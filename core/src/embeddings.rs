use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use hf_hub::api::sync::{Api as HfApi, ApiError as HfApiError, ApiRepo as HfApiRepo};
use hf_hub::api::Siblings;
use once_cell::sync::OnceCell;
use ort::memory::Allocator;
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::tensor::TensorElementType;
use ort::value::{DynTensor, Tensor, ValueType};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokenizers::{Tokenizer, TruncationDirection};

use crate::document_cache::{
    CachedDocumentChunkEmbeddingPayload, CachedDocumentEmbeddingMetadataPayload,
    CachedDocumentEmbeddingPayload, CachedDocumentEmbeddingSyncBatchPayload, DocumentCacheError,
    DocumentCacheStore, HybridSearchHitPayload, EMBEDDING_VECTOR_DIMENSIONS,
};
use crate::text_processing::{
    build_document_embedding_source_text, chunk_document_text, format_query_for_embedding,
    DocumentChunk,
};

const HF_EMBEDDING_REPO_ID: &str = "onnx-community/all-MiniLM-L6-v2-ONNX";
pub const LOCAL_EMBEDDING_MODEL_ID: &str = HF_EMBEDDING_REPO_ID;
pub const LOCAL_EMBEDDING_DIMENSIONS: usize = EMBEDDING_VECTOR_DIMENSIONS;
const MAX_SEQUENCE_LENGTH: usize = 512;
const INPUT_IDS_NAME: &str = "input_ids";
const ATTENTION_MASK_NAME: &str = "attention_mask";
const TOKEN_TYPE_IDS_NAME: &str = "token_type_ids";
const POSITION_IDS_NAME: &str = "position_ids";
const PAST_KEY_VALUES_NAME: &str = "past_key_values.";
const USE_CACHE_BRANCH_NAME: &str = "use_cache_branch";
const CACHE_POSITION_NAME: &str = "cache_position";
const EMBEDDING_SYNC_WRITE_BATCH_SIZE: usize = 75;
const EMBEDDING_INFERENCE_MICRO_BATCH_SIZE: usize = 8;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EmbeddingModelLoadStatus {
    Idle,
    Loading,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EmbeddingModelLoadStage {
    Starting,
    ResolvingArtifacts,
    LoadingTokenizer,
    CreatingSession,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingModelLoadStatePayload {
    pub status: EmbeddingModelLoadStatus,
    pub stage: EmbeddingModelLoadStage,
    pub progress: f32,
    pub message: String,
    pub error: Option<String>,
}

impl EmbeddingModelLoadStatePayload {
    pub fn idle() -> Self {
        Self {
            status: EmbeddingModelLoadStatus::Idle,
            stage: EmbeddingModelLoadStage::Starting,
            progress: 0.0,
            message: "Waiting to load embedding model.".to_owned(),
            error: None,
        }
    }

    fn loading(stage: EmbeddingModelLoadStage, progress: f32, message: &str) -> Self {
        Self {
            status: EmbeddingModelLoadStatus::Loading,
            stage,
            progress,
            message: message.to_owned(),
            error: None,
        }
    }

    fn ready() -> Self {
        Self {
            status: EmbeddingModelLoadStatus::Ready,
            stage: EmbeddingModelLoadStage::Ready,
            progress: 1.0,
            message: "Embedding model is ready.".to_owned(),
            error: None,
        }
    }

    fn failed(error: String) -> Self {
        Self {
            status: EmbeddingModelLoadStatus::Failed,
            stage: EmbeddingModelLoadStage::Failed,
            progress: 1.0,
            message: "Failed to load embedding model.".to_owned(),
            error: Some(error),
        }
    }
}

impl Default for EmbeddingModelLoadStatePayload {
    fn default() -> Self {
        Self::idle()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingSyncDocumentPayload {
    pub id: String,
    pub title: String,
    pub body: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingBatchSyncResultPayload {
    pub synced_count: usize,
    pub failed_count: usize,
}

#[derive(Debug, Error)]
pub enum EmbeddingError {
    #[error("document cache error: {0}")]
    DocumentCache(#[from] DocumentCacheError),
    #[error("onnx runtime error: {0}")]
    OnnxRuntime(#[from] ort::Error),
    #[error("embedding input must not be empty")]
    EmptyInput,
    #[error("failed to acquire embedding engine lock")]
    EnginePoisoned,
    #[error("failed to initialize embedding model artifacts: {0}")]
    ModelArtifacts(String),
    #[error("failed to tokenize input text: {0}")]
    Tokenization(String),
    #[error("unsupported model input: {0}")]
    UnsupportedModelInput(String),
    #[error("model did not return output tensor")]
    MissingModelOutput,
    #[error("embedding output has invalid shape: {0}")]
    InvalidOutputShape(String),
    #[error(
        "embedding vector length {0} does not match expected length {LOCAL_EMBEDDING_DIMENSIONS}"
    )]
    InvalidEmbeddingLength(usize),
}

struct EmbeddingArtifacts {
    tokenizer_path: PathBuf,
    model_path: PathBuf,
}

struct EmbeddingEngine {
    tokenizer: Tokenizer,
    session: Session,
    input_specs: Vec<ModelInputSpec>,
    output_name: String,
}

static EMBEDDING_ENGINE: OnceCell<Mutex<EmbeddingEngine>> = OnceCell::new();

#[derive(Debug, Clone)]
struct ModelInputSpec {
    name: String,
    value_type: ValueType,
}

fn l2_normalize(mut values: Vec<f32>) -> Vec<f32> {
    let magnitude = values.iter().map(|value| value * value).sum::<f32>().sqrt();

    if magnitude <= f32::EPSILON {
        return vec![0.0; LOCAL_EMBEDDING_DIMENSIONS];
    }

    for value in &mut values {
        *value /= magnitude;
    }

    values
}

impl EmbeddingEngine {
    fn initialize() -> Result<Self, EmbeddingError> {
        Self::initialize_with_progress(|_| {})
    }

    fn initialize_with_progress<F>(mut report_progress: F) -> Result<Self, EmbeddingError>
    where
        F: FnMut(EmbeddingModelLoadStatePayload),
    {
        report_progress(EmbeddingModelLoadStatePayload::loading(
            EmbeddingModelLoadStage::Starting,
            0.05,
            "Starting embedding model initialization...",
        ));
        let api = HfApi::new().map_err(|error| {
            EmbeddingError::ModelArtifacts(format!("failed to create hf-hub client: {error}"))
        })?;
        let repo = api.model(HF_EMBEDDING_REPO_ID.to_owned());
        report_progress(EmbeddingModelLoadStatePayload::loading(
            EmbeddingModelLoadStage::ResolvingArtifacts,
            0.3,
            "Resolving model artifacts...",
        ));
        let artifacts = resolve_artifacts(&repo)?;

        report_progress(EmbeddingModelLoadStatePayload::loading(
            EmbeddingModelLoadStage::LoadingTokenizer,
            0.55,
            "Loading tokenizer...",
        ));
        let tokenizer = Tokenizer::from_file(&artifacts.tokenizer_path).map_err(|error| {
            EmbeddingError::ModelArtifacts(format!(
                "failed to load tokenizer from {}: {error}",
                artifacts.tokenizer_path.display()
            ))
        })?;

        report_progress(EmbeddingModelLoadStatePayload::loading(
            EmbeddingModelLoadStage::CreatingSession,
            0.8,
            "Creating ONNX runtime session...",
        ));
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .with_intra_threads(1)?
            .commit_from_file(&artifacts.model_path)?;

        let input_specs = session
            .inputs()
            .iter()
            .map(|input| ModelInputSpec {
                name: input.name().to_owned(),
                value_type: input.dtype().clone(),
            })
            .collect::<Vec<_>>();
        if input_specs.is_empty() {
            return Err(EmbeddingError::ModelArtifacts(
                "model has no inputs".to_owned(),
            ));
        }

        let output_name = select_model_output_name(&session)?;
        log::info!(
            "[embeddings] Initialized ONNX model {} ({})",
            HF_EMBEDDING_REPO_ID,
            artifacts.model_path.display()
        );

        Ok(Self {
            tokenizer,
            session,
            input_specs,
            output_name,
        })
    }

    fn engine() -> Result<&'static Mutex<Self>, EmbeddingError> {
        EMBEDDING_ENGINE.get_or_try_init(|| Self::initialize().map(Mutex::new))
    }

    fn embed_texts(&mut self, texts: &[&str]) -> Result<Vec<Vec<f32>>, EmbeddingError> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        let mut encoded_texts = Vec::with_capacity(texts.len());
        for text in texts {
            let normalized = text.trim();
            if normalized.is_empty() {
                return Err(EmbeddingError::EmptyInput);
            }

            let mut encoding = self
                .tokenizer
                .encode(normalized, true)
                .map_err(|error| EmbeddingError::Tokenization(error.to_string()))?;
            if encoding.get_ids().is_empty() {
                return Err(EmbeddingError::EmptyInput);
            }

            if encoding.get_ids().len() > MAX_SEQUENCE_LENGTH {
                encoding.truncate(MAX_SEQUENCE_LENGTH, 0, TruncationDirection::Right);
            }

            encoded_texts.push(encoding);
        }

        let batch_size = encoded_texts.len();
        let sequence_lengths = encoded_texts
            .iter()
            .map(|encoding| encoding.get_ids().len())
            .collect::<Vec<_>>();
        let sequence_length = sequence_lengths.iter().copied().max().unwrap_or(0);
        if sequence_length == 0 {
            return Err(EmbeddingError::EmptyInput);
        }

        let pad_token_id = self
            .tokenizer
            .get_padding()
            .map(|padding| i64::from(padding.pad_id))
            .unwrap_or(0_i64);

        let past_sequence_length = infer_past_sequence_length(&self.input_specs, batch_size);
        let total_sequence_length = sequence_length + past_sequence_length;

        let mut input_ids: Vec<i64> = Vec::with_capacity(batch_size * sequence_length);
        let mut attention_masks: Vec<Vec<i64>> = Vec::with_capacity(batch_size);
        let mut attention_masks_with_past: Vec<i64> =
            Vec::with_capacity(batch_size * total_sequence_length);
        let mut token_type_ids: Vec<i64> = Vec::with_capacity(batch_size * sequence_length);

        for (encoding, current_sequence_length) in encoded_texts.iter().zip(sequence_lengths) {
            let ids = encoding.get_ids();
            let masks = encoding.get_attention_mask();
            let type_ids = encoding.get_type_ids();

            let mut attention_mask_row = vec![0_i64; sequence_length];
            for token_index in 0..sequence_length {
                if token_index < current_sequence_length {
                    input_ids.push(i64::from(ids[token_index]));
                    attention_mask_row[token_index] =
                        i64::from(*masks.get(token_index).unwrap_or(&1));

                    let type_id = if type_ids.len() == current_sequence_length {
                        i64::from(type_ids[token_index])
                    } else {
                        0_i64
                    };
                    token_type_ids.push(type_id);
                } else {
                    input_ids.push(pad_token_id);
                    token_type_ids.push(0_i64);
                }
            }

            let attention_mask_with_past = build_attention_mask_with_past(
                &attention_mask_row,
                sequence_length,
                total_sequence_length,
                past_sequence_length,
            );
            attention_masks_with_past.extend(attention_mask_with_past);
            attention_masks.push(attention_mask_row);
        }

        let cache_position = (past_sequence_length..(past_sequence_length + sequence_length))
            .map(|idx| idx as i64)
            .collect::<Vec<_>>();
        let mut position_ids = Vec::with_capacity(batch_size * sequence_length);
        for _ in 0..batch_size {
            position_ids.extend(cache_position.iter().copied());
        }

        let mut inputs: Vec<(String, DynTensor)> = Vec::with_capacity(self.input_specs.len());
        for spec in &self.input_specs {
            let key = spec.name.to_ascii_lowercase();

            let tensor = if key.contains(INPUT_IDS_NAME) {
                Tensor::from_array(([batch_size, sequence_length], input_ids.clone()))?.upcast()
            } else if key.contains(ATTENTION_MASK_NAME) {
                Tensor::from_array((
                    [batch_size, total_sequence_length],
                    attention_masks_with_past.clone(),
                ))?
                .upcast()
            } else if key.contains(TOKEN_TYPE_IDS_NAME) {
                Tensor::from_array(([batch_size, sequence_length], token_type_ids.clone()))?
                    .upcast()
            } else if key.contains(POSITION_IDS_NAME) {
                Tensor::from_array(([batch_size, sequence_length], position_ids.clone()))?.upcast()
            } else if key.starts_with(PAST_KEY_VALUES_NAME) {
                build_empty_past_kv_tensor(spec, batch_size)?
            } else if key.contains(USE_CACHE_BRANCH_NAME) {
                build_use_cache_branch_tensor(spec)?
            } else if key.contains(CACHE_POSITION_NAME) {
                Tensor::from_array(([sequence_length], cache_position.clone()))?.upcast()
            } else {
                return Err(EmbeddingError::UnsupportedModelInput(spec.name.clone()));
            };

            inputs.push((spec.name.clone(), tensor));
        }

        let outputs = self.session.run(inputs)?;
        let output_tensor = if let Some(value) = outputs.get(self.output_name.as_str()) {
            value
        } else if outputs.len() > 0 {
            &outputs[0]
        } else {
            return Err(EmbeddingError::MissingModelOutput);
        };
        let (shape, data) = output_tensor.try_extract_tensor::<f32>()?;
        let pooled = pool_embeddings(data, shape, &attention_masks)?;

        let mut normalized_embeddings = Vec::with_capacity(pooled.len());
        for embedding in pooled {
            if embedding.len() != LOCAL_EMBEDDING_DIMENSIONS {
                return Err(EmbeddingError::InvalidEmbeddingLength(embedding.len()));
            }

            normalized_embeddings.push(l2_normalize(embedding));
        }

        Ok(normalized_embeddings)
    }
}

fn build_empty_past_kv_tensor(
    spec: &ModelInputSpec,
    batch_size: usize,
) -> Result<DynTensor, EmbeddingError> {
    let shape = infer_past_kv_shape(spec, batch_size);
    let dtype = spec
        .value_type
        .tensor_type()
        .ok_or_else(|| EmbeddingError::UnsupportedModelInput(spec.name.clone()))?;

    DynTensor::new(&Allocator::default(), dtype, shape).map_err(EmbeddingError::from)
}

fn build_use_cache_branch_tensor(spec: &ModelInputSpec) -> Result<DynTensor, EmbeddingError> {
    let dtype = spec
        .value_type
        .tensor_type()
        .ok_or_else(|| EmbeddingError::UnsupportedModelInput(spec.name.clone()))?;

    match dtype {
        TensorElementType::Bool => Ok(Tensor::from_array(([1_usize], vec![false]))?.upcast()),
        TensorElementType::Int64 => Ok(Tensor::from_array(([1_usize], vec![0_i64]))?.upcast()),
        TensorElementType::Int32 => Ok(Tensor::from_array(([1_usize], vec![0_i32]))?.upcast()),
        _ => Err(EmbeddingError::UnsupportedModelInput(format!(
            "{} (unsupported cache-branch dtype: {})",
            spec.name, dtype
        ))),
    }
}

fn infer_past_kv_shape(spec: &ModelInputSpec, batch_size: usize) -> Vec<usize> {
    let Some(shape) = spec.value_type.tensor_shape() else {
        return vec![batch_size, 1, 0, 1];
    };

    if shape.is_empty() {
        return vec![batch_size, 1, 0, 1];
    }

    shape
        .iter()
        .enumerate()
        .map(|(index, dimension)| {
            if *dimension > 0 {
                *dimension as usize
            } else if index == 0 {
                batch_size
            } else if index == 2 {
                0
            } else {
                1
            }
        })
        .collect::<Vec<_>>()
}

fn infer_past_sequence_length(input_specs: &[ModelInputSpec], batch_size: usize) -> usize {
    input_specs
        .iter()
        .find(|spec| {
            spec.name
                .to_ascii_lowercase()
                .starts_with(PAST_KEY_VALUES_NAME)
        })
        .and_then(|spec| infer_past_kv_shape(spec, batch_size).get(2).copied())
        .unwrap_or(0)
}

fn build_attention_mask_with_past(
    attention_mask: &[i64],
    sequence_length: usize,
    total_sequence_length: usize,
    past_sequence_length: usize,
) -> Vec<i64> {
    if total_sequence_length == sequence_length && attention_mask.len() == sequence_length {
        return attention_mask.to_vec();
    }

    let mut mask = vec![0_i64; total_sequence_length];
    let available = attention_mask.len().min(sequence_length);
    for index in 0..available {
        mask[past_sequence_length + index] = attention_mask[index];
    }
    mask
}

fn select_model_output_name(session: &Session) -> Result<String, EmbeddingError> {
    let outputs = session.outputs();
    if outputs.is_empty() {
        return Err(EmbeddingError::MissingModelOutput);
    }

    let priorities = ["sentence_embedding", "embedding", "last_hidden_state"];
    for priority in priorities {
        if let Some(output) = outputs
            .iter()
            .find(|output| output.name().eq_ignore_ascii_case(priority))
        {
            return Ok(output.name().to_owned());
        }
    }

    for priority in priorities {
        if let Some(output) = outputs
            .iter()
            .find(|output| output.name().to_ascii_lowercase().contains(priority))
        {
            return Ok(output.name().to_owned());
        }
    }

    Ok(outputs[0].name().to_owned())
}

fn resolve_artifacts(repo: &HfApiRepo) -> Result<EmbeddingArtifacts, EmbeddingError> {
    let repo_info = repo.info().ok();
    let siblings = repo_info.as_ref().map(|info| info.siblings.as_slice());
    let tokenizer_path = resolve_tokenizer_path(repo, siblings)?;
    let model_file = resolve_model_file_name(siblings)?;
    let model_path = repo
        .get(&model_file)
        .map_err(|error| model_artifact_error("onnx model", &model_file, error))?;

    if let Some(siblings) = siblings {
        for sidecar in sidecar_file_candidates(&model_file, siblings) {
            if let Err(error) = repo.get(&sidecar) {
                log::warn!(
                    "[embeddings] Failed to download model sidecar {}: {}",
                    sidecar,
                    error
                );
            }
        }
    } else {
        let sidecar_candidates = [
            format!("{}_data", model_file),
            format!("{}.data", model_file),
        ];
        for sidecar in sidecar_candidates {
            if let Err(error) = repo.get(&sidecar) {
                log::debug!(
                    "[embeddings] Optional sidecar not found ({}): {}",
                    sidecar,
                    error
                );
            }
        }
    }

    Ok(EmbeddingArtifacts {
        tokenizer_path,
        model_path,
    })
}

fn resolve_tokenizer_path(
    repo: &HfApiRepo,
    siblings: Option<&[Siblings]>,
) -> Result<PathBuf, EmbeddingError> {
    if let Some(siblings) = siblings {
        if let Some(file) = tokenizer_file_from_siblings(siblings) {
            return repo
                .get(&file)
                .map_err(|error| model_artifact_error("tokenizer", &file, error));
        }
    }

    let tokenizer_candidates = ["tokenizer.json", "onnx/tokenizer.json"];
    let mut last_error = None;
    for candidate in tokenizer_candidates {
        match repo.get(candidate) {
            Ok(path) => return Ok(path),
            Err(error) => last_error = Some(model_artifact_error("tokenizer", candidate, error)),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        EmbeddingError::ModelArtifacts(
            "tokenizer.json was not found in model repository".to_owned(),
        )
    }))
}

fn resolve_model_file_name(siblings: Option<&[Siblings]>) -> Result<String, EmbeddingError> {
    let preferred = [
        "onnx/model_quantized.onnx",
        "onnx/model.onnx",
        "model_quantized.onnx",
        "model.onnx",
    ];

    if let Some(siblings) = siblings {
        let files = siblings
            .iter()
            .map(|entry| entry.rfilename.clone())
            .filter(|name| name.ends_with(".onnx"))
            .collect::<Vec<_>>();

        if files.is_empty() {
            return Err(EmbeddingError::ModelArtifacts(
                "no .onnx file found in model repository".to_owned(),
            ));
        }

        for candidate in preferred {
            if files.iter().any(|file| file == candidate) {
                return Ok(candidate.to_owned());
            }
        }

        if let Some(file) = files
            .iter()
            .find(|file| file.to_ascii_lowercase().contains("quantized"))
        {
            return Ok(file.clone());
        }

        return Ok(files[0].clone());
    }

    Ok(preferred[0].to_owned())
}

fn tokenizer_file_from_siblings(siblings: &[Siblings]) -> Option<String> {
    if let Some(exact) = siblings
        .iter()
        .find(|entry| entry.rfilename == "tokenizer.json")
    {
        return Some(exact.rfilename.clone());
    }

    siblings
        .iter()
        .find(|entry| entry.rfilename.ends_with("/tokenizer.json"))
        .map(|entry| entry.rfilename.clone())
}

fn sidecar_file_candidates(model_file: &str, siblings: &[Siblings]) -> Vec<String> {
    let underscore_prefix = format!("{model_file}_");
    let dot_prefix = format!("{model_file}.");

    siblings
        .iter()
        .map(|entry| entry.rfilename.clone())
        .filter(|file| file != model_file)
        .filter(|file| file.starts_with(&underscore_prefix) || file.starts_with(&dot_prefix))
        .collect::<Vec<_>>()
}

fn model_artifact_error(kind: &str, file: &str, error: HfApiError) -> EmbeddingError {
    EmbeddingError::ModelArtifacts(format!("failed to resolve {kind} artifact {file}: {error}"))
}

fn positive_dim(shape: &[i64], index: usize, label: &str) -> Result<usize, EmbeddingError> {
    let value = *shape.get(index).ok_or_else(|| {
        EmbeddingError::InvalidOutputShape(format!("missing {label} dimension in shape {shape:?}"))
    })?;

    if value <= 0 {
        return Err(EmbeddingError::InvalidOutputShape(format!(
            "{label} dimension must be > 0, got {value}"
        )));
    }

    usize::try_from(value).map_err(|_| {
        EmbeddingError::InvalidOutputShape(format!(
            "{label} dimension cannot be represented as usize: {value}"
        ))
    })
}

fn last_active_token_index(attention_mask: &[i64], sequence_length: usize) -> usize {
    let limit = attention_mask.len().min(sequence_length);
    for index in (0..limit).rev() {
        if attention_mask[index] > 0 {
            return index;
        }
    }

    sequence_length.saturating_sub(1)
}

fn pool_embeddings(
    output_data: &[f32],
    output_shape: &[i64],
    attention_masks: &[Vec<i64>],
) -> Result<Vec<Vec<f32>>, EmbeddingError> {
    let batch_size = attention_masks.len();
    if batch_size == 0 {
        return Ok(Vec::new());
    }

    match output_shape.len() {
        2 => {
            let first_dim = positive_dim(output_shape, 0, "first")?;
            let hidden_size = positive_dim(output_shape, 1, "hidden")?;
            let expected = first_dim.checked_mul(hidden_size).ok_or_else(|| {
                EmbeddingError::InvalidOutputShape(format!("shape is too large: {output_shape:?}"))
            })?;

            if output_data.len() != expected {
                return Err(EmbeddingError::InvalidOutputShape(format!(
                    "expected {expected} values for shape {output_shape:?}, got {}",
                    output_data.len()
                )));
            }

            if first_dim == batch_size {
                let mut pooled = Vec::with_capacity(batch_size);
                for batch_index in 0..batch_size {
                    let start = batch_index.checked_mul(hidden_size).ok_or_else(|| {
                        EmbeddingError::InvalidOutputShape(format!(
                            "shape is too large: {output_shape:?}"
                        ))
                    })?;
                    let end = start + hidden_size;
                    pooled.push(output_data[start..end].to_vec());
                }
                Ok(pooled)
            } else if batch_size == 1 {
                let token_index = last_active_token_index(&attention_masks[0], first_dim);
                let start = token_index.checked_mul(hidden_size).ok_or_else(|| {
                    EmbeddingError::InvalidOutputShape(format!(
                        "shape is too large: {output_shape:?}"
                    ))
                })?;
                let end = start + hidden_size;
                Ok(vec![output_data[start..end].to_vec()])
            } else {
                Err(EmbeddingError::InvalidOutputShape(format!(
                    "rank-2 output first dimension {first_dim} does not match batch size {batch_size}"
                )))
            }
        }
        3 => {
            let batch_size = positive_dim(output_shape, 0, "batch")?;
            let sequence_length = positive_dim(output_shape, 1, "sequence")?;
            let hidden_size = positive_dim(output_shape, 2, "hidden")?;
            let expected = batch_size
                .checked_mul(sequence_length)
                .and_then(|value| value.checked_mul(hidden_size))
                .ok_or_else(|| {
                    EmbeddingError::InvalidOutputShape(format!(
                        "shape is too large: {output_shape:?}"
                    ))
                })?;

            if output_data.len() != expected {
                return Err(EmbeddingError::InvalidOutputShape(format!(
                    "expected {expected} values for shape {output_shape:?}, got {}",
                    output_data.len()
                )));
            }

            if batch_size != attention_masks.len() {
                return Err(EmbeddingError::InvalidOutputShape(format!(
                    "rank-3 output batch dimension {batch_size} does not match attention mask rows {}",
                    attention_masks.len()
                )));
            }

            let row_width = sequence_length.checked_mul(hidden_size).ok_or_else(|| {
                EmbeddingError::InvalidOutputShape(format!("shape is too large: {output_shape:?}"))
            })?;
            let mut pooled = Vec::with_capacity(batch_size);
            for (batch_index, attention_mask_row) in attention_masks.iter().enumerate() {
                let token_index = last_active_token_index(attention_mask_row, sequence_length);
                let row_offset = batch_index.checked_mul(row_width).ok_or_else(|| {
                    EmbeddingError::InvalidOutputShape(format!(
                        "shape is too large: {output_shape:?}"
                    ))
                })?;
                let start = row_offset
                    .checked_add(token_index.checked_mul(hidden_size).ok_or_else(|| {
                        EmbeddingError::InvalidOutputShape(format!(
                            "shape is too large: {output_shape:?}"
                        ))
                    })?)
                    .ok_or_else(|| {
                        EmbeddingError::InvalidOutputShape(format!(
                            "shape is too large: {output_shape:?}"
                        ))
                    })?;
                let end = start + hidden_size;
                pooled.push(output_data[start..end].to_vec());
            }

            Ok(pooled)
        }
        _ => Err(EmbeddingError::InvalidOutputShape(format!(
            "expected rank-2 or rank-3 tensor, got shape {output_shape:?}"
        ))),
    }
}

fn compute_sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn compute_document_content_hash(source_text: &str) -> String {
    compute_sha256_hex(&format!("{source_text}\0{LOCAL_EMBEDDING_MODEL_ID}"))
}

fn compute_chunk_content_hash(chunk_texts: &[String]) -> String {
    let joined = chunk_texts.join("\0");
    compute_sha256_hex(&format!("chunks\0{joined}\0{LOCAL_EMBEDDING_MODEL_ID}"))
}

fn compute_chunk_plan(title: &str, body: &str) -> (Vec<DocumentChunk>, String) {
    let plain_body = crate::text_processing::extract_plain_text_from_tiptap_or_raw(body);
    let chunks = chunk_document_text(title, &plain_body);
    let chunk_texts = chunks
        .iter()
        .map(|chunk| chunk.text.clone())
        .collect::<Vec<_>>();
    let chunk_content_hash = compute_chunk_content_hash(&chunk_texts);
    (chunks, chunk_content_hash)
}

fn build_metadata_lookup(
    metadata: Vec<CachedDocumentEmbeddingMetadataPayload>,
) -> HashMap<String, CachedDocumentEmbeddingMetadataPayload> {
    metadata
        .into_iter()
        .filter(|item| item.model == LOCAL_EMBEDDING_MODEL_ID)
        .map(|item| (item.document_id.clone(), item))
        .collect()
}

pub fn embed_texts_batch(texts: &[&str]) -> Result<Vec<Vec<f32>>, EmbeddingError> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    if texts.iter().any(|text| text.trim().is_empty()) {
        return Err(EmbeddingError::EmptyInput);
    }

    let engine = EmbeddingEngine::engine()?;
    let mut engine = engine.lock().map_err(|_| EmbeddingError::EnginePoisoned)?;
    embed_texts_batch_internal(&mut engine, texts)
}

fn embed_texts_batch_internal(
    engine: &mut EmbeddingEngine,
    texts: &[&str],
) -> Result<Vec<Vec<f32>>, EmbeddingError> {
    let mut embeddings = Vec::with_capacity(texts.len());
    for chunk in texts.chunks(EMBEDDING_INFERENCE_MICRO_BATCH_SIZE) {
        let mut chunk_embeddings = engine.embed_texts(chunk)?;
        embeddings.append(&mut chunk_embeddings);
    }

    Ok(embeddings)
}

fn embed_query_text(query: &str) -> Result<Vec<f32>, EmbeddingError> {
    let formatted = format_query_for_embedding(query);
    embed_texts_batch(&[formatted.as_str()])?
        .into_iter()
        .next()
        .ok_or(EmbeddingError::EmptyInput)
}

fn embed_document_text(text: &str) -> Result<Vec<f32>, EmbeddingError> {
    embed_texts_batch(&[text])?
        .into_iter()
        .next()
        .ok_or(EmbeddingError::EmptyInput)
}

#[derive(Debug)]
struct PreparedDocumentEmbeddingWrite {
    document_id: String,
    document_embedding: Option<CachedDocumentEmbeddingPayload>,
    chunk_embeddings: Option<Vec<CachedDocumentChunkEmbeddingPayload>>,
}

#[derive(Debug)]
struct DocumentEmbeddingSyncPlan {
    source_text: String,
    document_content_hash: String,
    should_update_document_embedding: bool,
    chunks: Vec<DocumentChunk>,
    chunk_content_hash: String,
    should_update_chunk_embeddings: bool,
}

#[derive(Debug)]
struct ChangedDocumentEmbeddingSyncCandidate<'a> {
    document: &'a EmbeddingSyncDocumentPayload,
    plan: DocumentEmbeddingSyncPlan,
}

fn plan_document_embedding_sync_for_document(
    store: &DocumentCacheStore,
    document: &EmbeddingSyncDocumentPayload,
    metadata_lookup: Option<&HashMap<String, CachedDocumentEmbeddingMetadataPayload>>,
    chunk_hash_lookup: Option<&HashMap<String, String>>,
) -> Result<DocumentEmbeddingSyncPlan, EmbeddingError> {
    let source_text = build_document_embedding_source_text(&document.title, &document.body);
    let document_content_hash = compute_document_content_hash(&source_text);

    let should_update_document_embedding = if let Some(lookup) = metadata_lookup {
        lookup
            .get(&document.id)
            .map(|existing| existing.content_hash != document_content_hash)
            .unwrap_or(true)
    } else {
        let metadata = store
            .list_document_embedding_metadata()?
            .into_iter()
            .find(|item| item.document_id == document.id && item.model == LOCAL_EMBEDDING_MODEL_ID);

        metadata.as_ref().map(|item| item.content_hash.as_str())
            != Some(document_content_hash.as_str())
    };

    let existing_chunk_hash = if let Some(lookup) = chunk_hash_lookup {
        lookup.get(&document.id).cloned()
    } else {
        store.get_document_chunk_embedding_content_hash(&document.id, LOCAL_EMBEDDING_MODEL_ID)?
    };

    // Fast path: when document hash is unchanged and chunk embeddings exist for the same model,
    // chunk content is also unchanged, so we skip expensive chunk extraction/hashing.
    let (chunks, chunk_content_hash, should_update_chunk_embeddings) =
        if !should_update_document_embedding && existing_chunk_hash.is_some() {
            (Vec::new(), String::new(), false)
        } else {
            let (chunks, chunk_content_hash) = compute_chunk_plan(&document.title, &document.body);
            let should_update_chunk_embeddings =
                existing_chunk_hash.as_deref() != Some(chunk_content_hash.as_str());
            (chunks, chunk_content_hash, should_update_chunk_embeddings)
        };

    Ok(DocumentEmbeddingSyncPlan {
        source_text,
        document_content_hash,
        should_update_document_embedding,
        chunks,
        chunk_content_hash,
        should_update_chunk_embeddings,
    })
}

fn prepare_document_embedding_write_from_plan(
    document: &EmbeddingSyncDocumentPayload,
    plan: DocumentEmbeddingSyncPlan,
) -> Result<PreparedDocumentEmbeddingWrite, EmbeddingError> {
    let document_embedding = if plan.should_update_document_embedding {
        let vector = embed_document_text(&plan.source_text)?;
        Some(CachedDocumentEmbeddingPayload {
            document_id: document.id.clone(),
            model: LOCAL_EMBEDDING_MODEL_ID.to_owned(),
            content_hash: plan.document_content_hash.clone(),
            vector,
            updated_at: document.updated_at.clone(),
        })
    } else {
        log::info!(
            "[embedding-sync] skip document embedding for \"{}\" (hash unchanged)",
            document.id
        );
        None
    };

    let chunk_embeddings = if plan.should_update_chunk_embeddings {
        let chunk_text_refs = plan
            .chunks
            .iter()
            .map(|chunk| chunk.text.as_str())
            .collect::<Vec<_>>();
        let vectors = embed_texts_batch(&chunk_text_refs)?;
        if vectors.len() != plan.chunks.len() {
            return Err(EmbeddingError::InvalidOutputShape(format!(
                "expected {} chunk embeddings, got {}",
                plan.chunks.len(),
                vectors.len()
            )));
        }

        let payloads = plan
            .chunks
            .into_iter()
            .zip(vectors)
            .map(|(chunk, vector)| CachedDocumentChunkEmbeddingPayload {
                document_id: document.id.clone(),
                chunk_index: chunk.index,
                chunk_text: chunk.text,
                content_hash: plan.chunk_content_hash.clone(),
                model: LOCAL_EMBEDDING_MODEL_ID.to_owned(),
                vector,
                updated_at: document.updated_at.clone(),
            })
            .collect::<Vec<_>>();
        Some(payloads)
    } else {
        log::info!(
            "[embedding-sync] skip chunk embeddings for \"{}\" (hash unchanged)",
            document.id
        );
        None
    };

    Ok(PreparedDocumentEmbeddingWrite {
        document_id: document.id.clone(),
        document_embedding,
        chunk_embeddings,
    })
}

fn prepared_write_to_batch_payload(
    prepared_write: PreparedDocumentEmbeddingWrite,
) -> CachedDocumentEmbeddingSyncBatchPayload {
    CachedDocumentEmbeddingSyncBatchPayload {
        document_id: prepared_write.document_id,
        document_embedding: prepared_write.document_embedding,
        chunk_embeddings: prepared_write.chunk_embeddings,
    }
}

fn prepare_document_embedding_write_for_document(
    store: &DocumentCacheStore,
    document: &EmbeddingSyncDocumentPayload,
    metadata_lookup: Option<&HashMap<String, CachedDocumentEmbeddingMetadataPayload>>,
    chunk_hash_lookup: Option<&HashMap<String, String>>,
) -> Result<PreparedDocumentEmbeddingWrite, EmbeddingError> {
    let plan = plan_document_embedding_sync_for_document(
        store,
        document,
        metadata_lookup,
        chunk_hash_lookup,
    )?;
    prepare_document_embedding_write_from_plan(document, plan)
}

pub fn preload_embedding_model<F>(mut on_state: F) -> Result<(), EmbeddingError>
where
    F: FnMut(EmbeddingModelLoadStatePayload),
{
    let started = Instant::now();
    if EMBEDDING_ENGINE.get().is_some() {
        let ready = EmbeddingModelLoadStatePayload::ready();
        log::info!(
            "[embeddings][startup] status={:?} stage={:?} progress={} elapsed_ms={} cached=true",
            ready.status,
            ready.stage,
            ready.progress,
            started.elapsed().as_millis()
        );
        on_state(ready);
        return Ok(());
    }

    let result = EMBEDDING_ENGINE.get_or_try_init(|| {
        EmbeddingEngine::initialize_with_progress(|state| {
            log::info!(
                "[embeddings][startup] status={:?} stage={:?} progress={} message=\"{}\"",
                state.status,
                state.stage,
                state.progress,
                state.message
            );
            on_state(state);
        })
        .map(Mutex::new)
    });

    match result {
        Ok(_) => {
            let ready = EmbeddingModelLoadStatePayload::ready();
            log::info!(
                "[embeddings][startup] status={:?} stage={:?} progress={} elapsed_ms={} cached=false",
                ready.status,
                ready.stage,
                ready.progress,
                started.elapsed().as_millis()
            );
            on_state(ready);
            Ok(())
        }
        Err(error) => {
            let failed = EmbeddingModelLoadStatePayload::failed(error.to_string());
            log::error!(
                "[embeddings][startup] status={:?} stage={:?} progress={} elapsed_ms={} error={}",
                failed.status,
                failed.stage,
                failed.progress,
                started.elapsed().as_millis(),
                error
            );
            on_state(failed);
            Err(error)
        }
    }
}

pub fn sync_document_embeddings(
    store: &mut DocumentCacheStore,
    document: &EmbeddingSyncDocumentPayload,
    metadata_lookup: Option<&HashMap<String, CachedDocumentEmbeddingMetadataPayload>>,
) -> Result<(), EmbeddingError> {
    let prepared_write =
        prepare_document_embedding_write_for_document(store, document, metadata_lookup, None)?;

    if let Some(document_embedding) = prepared_write.document_embedding.as_ref() {
        store.upsert_document_embedding(document_embedding)?;
    }

    if let Some(chunk_embeddings) = prepared_write.chunk_embeddings.as_ref() {
        store.replace_document_chunk_embeddings(&prepared_write.document_id, chunk_embeddings)?;
    }

    Ok(())
}

pub fn sync_documents_embeddings_batch(
    store: &mut DocumentCacheStore,
    documents: &[EmbeddingSyncDocumentPayload],
) -> Result<EmbeddingBatchSyncResultPayload, EmbeddingError> {
    sync_documents_embeddings_batch_with_progress(store, documents, None)
}

pub fn sync_documents_embeddings_batch_with_progress(
    store: &mut DocumentCacheStore,
    documents: &[EmbeddingSyncDocumentPayload],
    mut progress_callback: Option<&mut crate::knowledge_base::ProgressCallback>,
) -> Result<EmbeddingBatchSyncResultPayload, EmbeddingError> {
    let total_documents = documents.len();
    let metadata_lookup = build_metadata_lookup(store.list_document_embedding_metadata()?);
    let chunk_hash_lookup =
        store.list_document_chunk_embedding_hashes_by_model(LOCAL_EMBEDDING_MODEL_ID)?;

    if let Some(callback) = progress_callback.as_mut() {
        callback(crate::knowledge_base::ProgressEvent::Phase2Start { total_documents });
    }

    let mut changed_documents: Vec<ChangedDocumentEmbeddingSyncCandidate<'_>> = Vec::new();
    for (document_index, document) in documents.iter().enumerate() {
        let plan = plan_document_embedding_sync_for_document(
            store,
            document,
            Some(&metadata_lookup),
            Some(&chunk_hash_lookup),
        )?;
        if plan.should_update_document_embedding || plan.should_update_chunk_embeddings {
            changed_documents.push(ChangedDocumentEmbeddingSyncCandidate { document, plan });
        }

        if let Some(callback) = progress_callback.as_mut() {
            callback(crate::knowledge_base::ProgressEvent::Phase2Progress {
                current: document_index + 1,
                total: total_documents,
                document_id: document.id.clone(),
            });
        }
    }

    let total_changed_documents = changed_documents.len();

    if let Some(callback) = progress_callback.as_mut() {
        callback(crate::knowledge_base::ProgressEvent::Phase2Start {
            total_documents: total_changed_documents,
        });
    }

    let mut synced_count = documents.len().saturating_sub(total_changed_documents);
    let mut failed_count = 0;
    let mut attempted_changed_count = 0;

    while !changed_documents.is_empty() {
        let batch_len = changed_documents.len().min(EMBEDDING_SYNC_WRITE_BATCH_SIZE);
        let batch = changed_documents
            .drain(..batch_len)
            .collect::<Vec<ChangedDocumentEmbeddingSyncCandidate<'_>>>();

        let mut batch_payloads: Vec<CachedDocumentEmbeddingSyncBatchPayload> =
            Vec::with_capacity(batch.len());
        let mut batch_document_ids: Vec<String> = Vec::with_capacity(batch.len());

        for candidate in batch {
            match prepare_document_embedding_write_from_plan(candidate.document, candidate.plan) {
                Ok(prepared_write) => {
                    batch_document_ids.push(candidate.document.id.clone());
                    batch_payloads.push(prepared_write_to_batch_payload(prepared_write));
                }
                Err(error) => {
                    failed_count += 1;
                    attempted_changed_count += 1;
                    log::error!(
                        "[embedding-sync] Failed to prepare embeddings for \"{}\": {}",
                        candidate.document.id,
                        error
                    );

                    if let Some(callback) = progress_callback.as_mut() {
                        callback(crate::knowledge_base::ProgressEvent::Phase2Progress {
                            current: attempted_changed_count,
                            total: total_changed_documents,
                            document_id: candidate.document.id.clone(),
                        });
                    }
                }
            }
        }

        if batch_payloads.is_empty() {
            continue;
        }

        match store.apply_embedding_sync_batch(&batch_payloads) {
            Ok(()) => {
                for document_id in batch_document_ids {
                    synced_count += 1;
                    attempted_changed_count += 1;

                    if let Some(callback) = progress_callback.as_mut() {
                        callback(crate::knowledge_base::ProgressEvent::Phase2Progress {
                            current: attempted_changed_count,
                            total: total_changed_documents,
                            document_id,
                        });
                    }
                }
            }
            Err(error) => {
                log::error!(
                    "[embedding-sync] Failed to write embedding batch (size={}): {}",
                    batch_payloads.len(),
                    error
                );

                for payload in batch_payloads {
                    let document_id = payload.document_id.clone();
                    match store.apply_embedding_sync_batch(std::slice::from_ref(&payload)) {
                        Ok(()) => {
                            synced_count += 1;
                        }
                        Err(document_error) => {
                            failed_count += 1;
                            log::error!(
                                "[embedding-sync] Failed to sync embeddings for \"{}\": {}",
                                document_id,
                                document_error
                            );
                        }
                    }

                    attempted_changed_count += 1;
                    if let Some(callback) = progress_callback.as_mut() {
                        callback(crate::knowledge_base::ProgressEvent::Phase2Progress {
                            current: attempted_changed_count,
                            total: total_changed_documents,
                            document_id,
                        });
                    }
                }
            }
        }
    }

    if let Some(callback) = progress_callback.as_mut() {
        callback(crate::knowledge_base::ProgressEvent::Phase2Complete {
            synced: synced_count,
            failed: failed_count,
        });
    }

    Ok(EmbeddingBatchSyncResultPayload {
        synced_count,
        failed_count,
    })
}

pub fn delete_document_embeddings(
    store: &mut DocumentCacheStore,
    document_id: &str,
) -> Result<(), EmbeddingError> {
    store.delete_document_embedding(document_id)?;
    store.replace_document_chunk_embeddings(document_id, &[])?;
    Ok(())
}

pub fn hybrid_search_documents_by_query(
    store: &DocumentCacheStore,
    query_text: &str,
    semantic_query_text: Option<&str>,
    limit: usize,
    min_score: f32,
    exclude_document_id: Option<String>,
    semantic_weight: f32,
    bm25_weight: f32,
) -> Result<Vec<HybridSearchHitPayload>, EmbeddingError> {
    let normalized_query = query_text.trim();
    if normalized_query.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }
    let started = Instant::now();

    let normalized_semantic_query = semantic_query_text.unwrap_or(query_text).trim();
    let has_semantic_query = !normalized_semantic_query.is_empty();
    log::info!(
        "[search-debug][query] query_text=\"{}\" semantic_query_text=\"{}\" limit={} min_score={} semantic_weight={} bm25_weight={} exclude={:?}",
        normalized_query,
        normalized_semantic_query,
        limit,
        min_score,
        semantic_weight,
        bm25_weight,
        exclude_document_id
    );

    let (query_vector, semantic_weight, bm25_weight) =
        if semantic_weight > 0.0 && has_semantic_query {
            let embed_started = Instant::now();
            match embed_query_text(normalized_semantic_query) {
                Ok(vector) => {
                    log::info!(
                        "[search-debug][query] embedding=ok dim={} elapsed_ms={}",
                        vector.len(),
                        embed_started.elapsed().as_millis()
                    );
                    (vector, semantic_weight, bm25_weight)
                }
                Err(error) => {
                    log::warn!(
                    "[semantic-search] Query embedding failed, falling back to BM25-only mode: {}",
                    error
                );
                    (vec![0.0_f32; LOCAL_EMBEDDING_DIMENSIONS], 0.0_f32, 1.0_f32)
                }
            }
        } else {
            log::info!(
                "[search-debug][query] embedding=skipped semantic_weight={} has_semantic_query={}",
                semantic_weight,
                has_semantic_query
            );
            let effective_bm25_weight = if bm25_weight > 0.0 { bm25_weight } else { 1.0 };
            (
                vec![0.0_f32; LOCAL_EMBEDDING_DIMENSIONS],
                0.0_f32,
                effective_bm25_weight,
            )
        };

    let hits = store
        .hybrid_search_documents(
            query_vector,
            query_text,
            limit,
            min_score,
            exclude_document_id,
            semantic_weight,
            bm25_weight,
        )
        .map_err(EmbeddingError::from)?;
    let top = hits
        .iter()
        .take(5)
        .map(|hit| format!("{}:{:.4}", hit.document_id, hit.score))
        .collect::<Vec<_>>();
    log::info!(
        "[search-debug][query] final_hits={} top={:?} elapsed_ms={}",
        hits.len(),
        top,
        started.elapsed().as_millis()
    );
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    use ort::tensor::{Shape, SymbolicDimensions, TensorElementType};
    use ort::value::ValueType;

    use crate::document_cache::{
        CachedDocumentChunkEmbeddingPayload, CachedDocumentEmbeddingPayload, CachedDocumentPayload,
        DocumentCacheStore,
    };
    use crate::text_processing::{
        build_document_embedding_source_text, chunk_document_text,
        extract_plain_text_from_tiptap_or_raw,
    };

    use super::{
        build_attention_mask_with_past, compute_chunk_content_hash, compute_document_content_hash,
        embed_texts_batch, infer_past_kv_shape, infer_past_sequence_length, l2_normalize,
        plan_document_embedding_sync_for_document, pool_embeddings, sync_documents_embeddings_batch,
        sync_documents_embeddings_batch_with_progress, EmbeddingError,
        EmbeddingSyncDocumentPayload, ModelInputSpec, LOCAL_EMBEDDING_DIMENSIONS,
        LOCAL_EMBEDDING_MODEL_ID, PAST_KEY_VALUES_NAME, build_metadata_lookup,
    };

    fn unique_temp_path() -> std::path::PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after unix epoch")
            .as_nanos();
        let thread_id = format!("{:?}", std::thread::current().id())
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect::<String>();
        std::env::temp_dir().join(format!("tentacle-embeddings-test-{timestamp}-{thread_id}"))
    }

    #[test]
    fn l2_normalize_zero_vector_returns_zero_vector() {
        let values = vec![0.0_f32; LOCAL_EMBEDDING_DIMENSIONS];
        let normalized = l2_normalize(values);
        assert_eq!(normalized, vec![0.0_f32; LOCAL_EMBEDDING_DIMENSIONS]);
    }

    #[test]
    fn l2_normalize_non_zero_vector_returns_unit_norm() {
        let normalized = l2_normalize(vec![3.0_f32, 4.0_f32]);
        let magnitude = normalized
            .iter()
            .map(|value| value * value)
            .sum::<f32>()
            .sqrt();
        assert!((magnitude - 1.0_f32).abs() < 1e-6_f32);
    }

    #[test]
    fn pool_embedding_uses_last_active_token_from_rank3_output() {
        let output = vec![1.0_f32, 2.0_f32, 3.0_f32, 4.0_f32, 5.0_f32, 6.0_f32];
        let shape = vec![1_i64, 3_i64, 2_i64];
        let attention_mask = vec![1_i64, 1_i64, 0_i64];
        let pooled = pool_embeddings(&output, &shape, &[attention_mask])
            .expect("pooling should work")
            .pop()
            .expect("single-row pool should contain one embedding");
        assert_eq!(pooled, vec![3.0_f32, 4.0_f32]);
    }

    #[test]
    fn pool_embeddings_uses_last_active_token_for_each_batch_row() {
        let output = vec![
            1.0_f32, 2.0_f32, 3.0_f32, 4.0_f32, 5.0_f32, 6.0_f32, 7.0_f32, 8.0_f32, 9.0_f32,
            10.0_f32, 11.0_f32, 12.0_f32,
        ];
        let shape = vec![2_i64, 3_i64, 2_i64];
        let attention_masks = vec![vec![1_i64, 1_i64, 0_i64], vec![1_i64, 0_i64, 0_i64]];

        let pooled = pool_embeddings(&output, &shape, &attention_masks)
            .expect("batched pooling should work");
        assert_eq!(pooled, vec![vec![3.0_f32, 4.0_f32], vec![7.0_f32, 8.0_f32]]);
    }

    #[test]
    fn infer_past_kv_shape_uses_zero_past_sequence_length() {
        let spec = ModelInputSpec {
            name: format!("{PAST_KEY_VALUES_NAME}0.key"),
            value_type: ValueType::Tensor {
                ty: TensorElementType::Float32,
                shape: Shape::new([-1_i64, 8_i64, -1_i64, 128_i64]),
                dimension_symbols: SymbolicDimensions::new([
                    "batch_size".to_owned(),
                    String::new(),
                    "past_sequence_length".to_owned(),
                    String::new(),
                ]),
            },
        };

        let shape = infer_past_kv_shape(&spec, 1);
        assert_eq!(shape, vec![1_usize, 8_usize, 0_usize, 128_usize]);
    }

    #[test]
    fn infer_past_sequence_length_reads_first_cache_input() {
        let input_specs = vec![ModelInputSpec {
            name: format!("{PAST_KEY_VALUES_NAME}0.value"),
            value_type: ValueType::Tensor {
                ty: TensorElementType::Float32,
                shape: Shape::new([-1_i64, 8_i64, -1_i64, 128_i64]),
                dimension_symbols: SymbolicDimensions::new([
                    "batch_size".to_owned(),
                    String::new(),
                    "past_sequence_length".to_owned(),
                    String::new(),
                ]),
            },
        }];

        assert_eq!(infer_past_sequence_length(&input_specs, 1), 0);
    }

    #[test]
    fn build_attention_mask_with_past_pads_prefix_for_cache_tokens() {
        let attention_mask = vec![1_i64, 1_i64, 1_i64];
        let with_past = build_attention_mask_with_past(&attention_mask, 3, 5, 2);
        assert_eq!(with_past, vec![0_i64, 0_i64, 1_i64, 1_i64, 1_i64]);
    }

    #[test]
    fn embed_texts_batch_empty_batch_short_circuits() {
        let embeddings = embed_texts_batch(&[]).expect("empty batch should short-circuit");
        assert!(embeddings.is_empty());
    }

    #[test]
    fn embed_texts_batch_rejects_blank_strings() {
        let error = embed_texts_batch(&["hello", "   "]).expect_err("blank input should fail");
        assert!(matches!(error, EmbeddingError::EmptyInput));
    }

    #[test]
    fn sync_documents_embeddings_batch_skips_unchanged_documents_without_rewriting_embeddings() {
        let temp_dir = unique_temp_path();

        {
            let mut store =
                DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");
            let document_id = "doc-unchanged-prefilter".to_string();
            let title = "Unchanged document";
            let body = "This content should stay hash-identical between reindex runs.";
            let initial_updated_at = "2026-02-13T00:00:00Z";

            store
                .upsert_document(&CachedDocumentPayload {
                    id: document_id.clone(),
                    user_id: "user-1".to_string(),
                    title: title.to_string(),
                    body: body.to_string(),
                    folder_path: "".to_string(),
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: initial_updated_at.to_string(),
                    updated_at: initial_updated_at.to_string(),
                    tags: vec![],
                })
                .expect("document upsert should succeed");

            let source_text = build_document_embedding_source_text(title, body);
            let document_hash = compute_document_content_hash(&source_text);
            let plain_body = extract_plain_text_from_tiptap_or_raw(body);
            let chunks = chunk_document_text(title, &plain_body);
            let chunk_hash = compute_chunk_content_hash(
                &chunks
                    .iter()
                    .map(|chunk| chunk.text.clone())
                    .collect::<Vec<_>>(),
            );

            store
                .upsert_document_embedding(&CachedDocumentEmbeddingPayload {
                    document_id: document_id.clone(),
                    model: LOCAL_EMBEDDING_MODEL_ID.to_string(),
                    content_hash: document_hash.clone(),
                    vector: vec![0.25; LOCAL_EMBEDDING_DIMENSIONS],
                    updated_at: initial_updated_at.to_string(),
                })
                .expect("seed document embedding should succeed");

            let chunk_payloads = chunks
                .iter()
                .map(|chunk| CachedDocumentChunkEmbeddingPayload {
                    document_id: document_id.clone(),
                    chunk_index: chunk.index,
                    chunk_text: chunk.text.clone(),
                    content_hash: chunk_hash.clone(),
                    model: LOCAL_EMBEDDING_MODEL_ID.to_string(),
                    vector: vec![0.5; LOCAL_EMBEDDING_DIMENSIONS],
                    updated_at: initial_updated_at.to_string(),
                })
                .collect::<Vec<_>>();
            store
                .replace_document_chunk_embeddings(&document_id, &chunk_payloads)
                .expect("seed chunk embeddings should succeed");

            let sync_result = sync_documents_embeddings_batch(
                &mut store,
                &[EmbeddingSyncDocumentPayload {
                    id: document_id.clone(),
                    title: title.to_string(),
                    body: body.to_string(),
                    updated_at: "2026-02-13T00:05:00Z".to_string(),
                }],
            )
            .expect("unchanged document sync should succeed");

            assert_eq!(sync_result.synced_count, 1);
            assert_eq!(sync_result.failed_count, 0);

            let persisted = store
                .list_document_embedding_metadata()
                .expect("metadata read should succeed")
                .into_iter()
                .find(|entry| {
                    entry.document_id == document_id && entry.model == LOCAL_EMBEDDING_MODEL_ID
                })
                .expect("seeded document embedding metadata should exist");
            assert_eq!(persisted.content_hash, document_hash);
            assert_eq!(
                persisted.updated_at, initial_updated_at,
                "prefiltered documents should not rewrite embedding metadata"
            );

            let persisted_chunk_hash = store
                .get_document_chunk_embedding_content_hash(&document_id, LOCAL_EMBEDDING_MODEL_ID)
                .expect("chunk hash read should succeed");
            assert_eq!(persisted_chunk_hash.as_deref(), Some(chunk_hash.as_str()));
        }

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn plan_document_embedding_sync_marks_missing_chunk_embeddings_for_unchanged_document() {
        let temp_dir = unique_temp_path();

        {
            let mut store =
                DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");
            let document_id = "doc-backfill-chunks".to_string();
            let title = "Unchanged document";
            let body = "Chunk embeddings should be backfilled when missing.";
            let initial_updated_at = "2026-02-19T00:00:00Z";

            store
                .upsert_document(&CachedDocumentPayload {
                    id: document_id.clone(),
                    user_id: "user-1".to_string(),
                    title: title.to_string(),
                    body: body.to_string(),
                    folder_path: "".to_string(),
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: initial_updated_at.to_string(),
                    updated_at: initial_updated_at.to_string(),
                    tags: vec![],
                })
                .expect("document upsert should succeed");

            let source_text = build_document_embedding_source_text(title, body);
            let document_hash = compute_document_content_hash(&source_text);

            store
                .upsert_document_embedding(&CachedDocumentEmbeddingPayload {
                    document_id: document_id.clone(),
                    model: LOCAL_EMBEDDING_MODEL_ID.to_string(),
                    content_hash: document_hash.clone(),
                    vector: vec![0.25; LOCAL_EMBEDDING_DIMENSIONS],
                    updated_at: initial_updated_at.to_string(),
                })
                .expect("seed document embedding should succeed");

            let before_chunk_hash = store
                .get_document_chunk_embedding_content_hash(&document_id, LOCAL_EMBEDDING_MODEL_ID)
                .expect("chunk hash read should succeed before sync");
            assert!(
                before_chunk_hash.is_none(),
                "chunk embeddings should be missing before sync"
            );

            let document = EmbeddingSyncDocumentPayload {
                id: document_id.clone(),
                title: title.to_string(),
                body: body.to_string(),
                updated_at: "2026-02-19T00:05:00Z".to_string(),
            };
            let metadata_lookup = build_metadata_lookup(
                store
                    .list_document_embedding_metadata()
                    .expect("metadata read should succeed"),
            );
            let chunk_hash_lookup = store
                .list_document_chunk_embedding_hashes_by_model(LOCAL_EMBEDDING_MODEL_ID)
                .expect("chunk hash lookup should succeed");

            let plan = plan_document_embedding_sync_for_document(
                &store,
                &document,
                Some(&metadata_lookup),
                Some(&chunk_hash_lookup),
            )
            .expect("planning should succeed");

            assert!(
                !plan.should_update_document_embedding,
                "unchanged document embedding should be skipped"
            );
            assert!(
                plan.should_update_chunk_embeddings,
                "missing chunk embeddings should trigger chunk backfill"
            );
            assert!(
                !plan.chunks.is_empty(),
                "chunk plan should include chunks when chunk embeddings are missing"
            );
            assert_eq!(plan.document_content_hash, document_hash);
            assert!(
                !plan.chunk_content_hash.is_empty(),
                "chunk content hash should be computed for chunk backfill"
            );

            let persisted = store
                .list_document_embedding_metadata()
                .expect("metadata read should succeed")
                .into_iter()
                .find(|entry| {
                    entry.document_id == document_id && entry.model == LOCAL_EMBEDDING_MODEL_ID
                })
                .expect("seeded document embedding metadata should exist");
            assert_eq!(persisted.content_hash, document_hash);
            assert_eq!(
                persisted.updated_at, initial_updated_at,
                "planning should not rewrite document embedding metadata"
            );

            let still_missing_chunk_hash = store
                .get_document_chunk_embedding_content_hash(&document_id, LOCAL_EMBEDDING_MODEL_ID)
                .expect("chunk hash read should succeed after planning");
            assert!(
                still_missing_chunk_hash.is_none(),
                "planning alone should not mutate chunk embeddings"
            );
        }

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn sync_documents_embeddings_batch_backfills_missing_chunk_embeddings_for_unchanged_document() {
        let temp_dir = unique_temp_path();

        {
            let mut store =
                DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");
            let document_id = "doc-backfill-chunks".to_string();
            let title = "Unchanged document";
            let body = "Chunk embeddings should be backfilled when missing.";
            let initial_updated_at = "2026-02-19T00:00:00Z";

            store
                .upsert_document(&CachedDocumentPayload {
                    id: document_id.clone(),
                    title: title.to_string(),
                    body: body.to_string(),
                    user_id: "user-1".to_string(),
                    folder_path: "".to_string(),
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: initial_updated_at.to_string(),
                    updated_at: initial_updated_at.to_string(),
                    tags: vec![],
                })
                .expect("document upsert should succeed");

            let source_text = build_document_embedding_source_text(title, body);
            let document_hash = compute_document_content_hash(&source_text);

            store
                .upsert_document_embedding(&CachedDocumentEmbeddingPayload {
                    document_id: document_id.clone(),
                    model: LOCAL_EMBEDDING_MODEL_ID.to_string(),
                    content_hash: document_hash,
                    vector: vec![0.25; LOCAL_EMBEDDING_DIMENSIONS],
                    updated_at: initial_updated_at.to_string(),
                })
                .expect("seed document embedding should succeed");

            let sync_result = sync_documents_embeddings_batch(
                &mut store,
                &[EmbeddingSyncDocumentPayload {
                    id: document_id.clone(),
                    title: title.to_string(),
                    body: body.to_string(),
                    updated_at: "2026-02-19T00:05:00Z".to_string(),
                }],
            )
            .expect("sync should complete");

            assert_eq!(
                sync_result.synced_count + sync_result.failed_count,
                1,
                "single-document sync should account for exactly one result"
            );

            let after_chunk_hash = store
                .get_document_chunk_embedding_content_hash(&document_id, LOCAL_EMBEDDING_MODEL_ID)
                .expect("chunk hash read should succeed after sync");
            if sync_result.failed_count == 0 {
                assert!(
                    after_chunk_hash.is_some(),
                    "chunk embeddings should be backfilled for unchanged document"
                );
            }
        }

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn sync_documents_embeddings_batch_reports_phase2_progress_during_prefilter() {
        let temp_dir = unique_temp_path();

        {
            let mut store =
                DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");
            let document_id = "doc-prefilter-progress".to_string();
            let title = "Progress document";
            let body = "This document keeps the same content between sync runs.";
            let updated_at = "2026-02-19T00:00:00Z";

            store
                .upsert_document(&CachedDocumentPayload {
                    id: document_id.clone(),
                    user_id: "user-1".to_string(),
                    title: title.to_string(),
                    body: body.to_string(),
                    folder_path: "".to_string(),
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: updated_at.to_string(),
                    updated_at: updated_at.to_string(),
                    tags: vec![],
                })
                .expect("document upsert should succeed");

            let source_text = build_document_embedding_source_text(title, body);
            let document_hash = compute_document_content_hash(&source_text);
            let plain_body = extract_plain_text_from_tiptap_or_raw(body);
            let chunks = chunk_document_text(title, &plain_body);
            let chunk_hash = compute_chunk_content_hash(
                &chunks
                    .iter()
                    .map(|chunk| chunk.text.clone())
                    .collect::<Vec<_>>(),
            );

            store
                .upsert_document_embedding(&CachedDocumentEmbeddingPayload {
                    document_id: document_id.clone(),
                    model: LOCAL_EMBEDDING_MODEL_ID.to_string(),
                    content_hash: document_hash,
                    vector: vec![0.25; LOCAL_EMBEDDING_DIMENSIONS],
                    updated_at: updated_at.to_string(),
                })
                .expect("seed document embedding should succeed");

            let chunk_payloads = chunks
                .iter()
                .map(|chunk| CachedDocumentChunkEmbeddingPayload {
                    document_id: document_id.clone(),
                    chunk_index: chunk.index,
                    chunk_text: chunk.text.clone(),
                    content_hash: chunk_hash.clone(),
                    model: LOCAL_EMBEDDING_MODEL_ID.to_string(),
                    vector: vec![0.5; LOCAL_EMBEDDING_DIMENSIONS],
                    updated_at: updated_at.to_string(),
                })
                .collect::<Vec<_>>();
            store
                .replace_document_chunk_embeddings(&document_id, &chunk_payloads)
                .expect("seed chunk embeddings should succeed");

            let events = Arc::new(Mutex::new(Vec::new()));
            let events_for_callback = Arc::clone(&events);
            let mut callback: crate::knowledge_base::ProgressCallback = Box::new(move |event| {
                events_for_callback
                    .lock()
                    .expect("event lock should not be poisoned")
                    .push(event);
            });

            let sync_result = sync_documents_embeddings_batch_with_progress(
                &mut store,
                &[EmbeddingSyncDocumentPayload {
                    id: document_id.clone(),
                    title: title.to_string(),
                    body: body.to_string(),
                    updated_at: "2026-02-19T00:01:00Z".to_string(),
                }],
                Some(&mut callback),
            )
            .expect("sync should succeed");

            assert_eq!(sync_result.synced_count, 1);
            assert_eq!(sync_result.failed_count, 0);

            let observed_events = events
                .lock()
                .expect("event lock should not be poisoned")
                .clone();
            assert!(
                matches!(
                    observed_events.first(),
                    Some(crate::knowledge_base::ProgressEvent::Phase2Start { total_documents: 1 })
                ),
                "phase 2 should start immediately with full document count"
            );
            assert!(
                observed_events.iter().any(|event| matches!(
                    event,
                    crate::knowledge_base::ProgressEvent::Phase2Progress {
                        current: 1,
                        total: 1,
                        ..
                    }
                )),
                "phase 2 prefilter should report per-document progress"
            );
            assert!(
                matches!(
                    observed_events.last(),
                    Some(crate::knowledge_base::ProgressEvent::Phase2Complete { .. })
                ),
                "phase 2 should complete cleanly"
            );
        }

        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
