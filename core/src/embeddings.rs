use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

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
    CachedDocumentEmbeddingPayload, DocumentCacheError, DocumentCacheStore, HybridSearchHitPayload,
    EMBEDDING_VECTOR_DIMENSIONS,
};
use crate::text_processing::{
    build_document_embedding_source_text, chunk_document_text, format_query_for_embedding,
};

const HF_EMBEDDING_REPO_ID: &str = "onnx-community/Qwen3-Embedding-0.6B-ONNX";
pub const LOCAL_EMBEDDING_MODEL_ID: &str = HF_EMBEDDING_REPO_ID;
pub const LOCAL_EMBEDDING_DIMENSIONS: usize = EMBEDDING_VECTOR_DIMENSIONS;
const MAX_SEQUENCE_LENGTH: usize = 8192;
const INPUT_IDS_NAME: &str = "input_ids";
const ATTENTION_MASK_NAME: &str = "attention_mask";
const TOKEN_TYPE_IDS_NAME: &str = "token_type_ids";
const POSITION_IDS_NAME: &str = "position_ids";
const PAST_KEY_VALUES_NAME: &str = "past_key_values.";
const USE_CACHE_BRANCH_NAME: &str = "use_cache_branch";
const CACHE_POSITION_NAME: &str = "cache_position";

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
        let api = HfApi::new().map_err(|error| {
            EmbeddingError::ModelArtifacts(format!("failed to create hf-hub client: {error}"))
        })?;
        let repo = api.model(HF_EMBEDDING_REPO_ID.to_owned());
        let artifacts = resolve_artifacts(&repo)?;

        let tokenizer = Tokenizer::from_file(&artifacts.tokenizer_path).map_err(|error| {
            EmbeddingError::ModelArtifacts(format!(
                "failed to load tokenizer from {}: {error}",
                artifacts.tokenizer_path.display()
            ))
        })?;

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

    fn embed_text(&mut self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
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

        let input_ids = encoding
            .get_ids()
            .iter()
            .map(|value| *value as i64)
            .collect::<Vec<_>>();
        let attention_mask = encoding
            .get_attention_mask()
            .iter()
            .map(|value| *value as i64)
            .collect::<Vec<_>>();
        let type_ids = encoding
            .get_type_ids()
            .iter()
            .map(|value| *value as i64)
            .collect::<Vec<_>>();

        let batch_size = 1_usize;
        let sequence_length = input_ids.len();
        let past_sequence_length = infer_past_sequence_length(&self.input_specs, batch_size);
        let total_sequence_length = sequence_length + past_sequence_length;
        let attention_mask_with_past = build_attention_mask_with_past(
            &attention_mask,
            sequence_length,
            total_sequence_length,
            past_sequence_length,
        );

        let mut inputs: Vec<(String, DynTensor)> = Vec::with_capacity(self.input_specs.len());
        for spec in &self.input_specs {
            let key = spec.name.to_ascii_lowercase();

            let tensor = if key.contains(INPUT_IDS_NAME) {
                Tensor::from_array(([batch_size, sequence_length], input_ids.clone()))?.upcast()
            } else if key.contains(ATTENTION_MASK_NAME) {
                Tensor::from_array(([batch_size, total_sequence_length], attention_mask_with_past.clone()))?
                    .upcast()
            } else if key.contains(TOKEN_TYPE_IDS_NAME) {
                let token_type_ids = if type_ids.len() == sequence_length {
                    type_ids.clone()
                } else {
                    vec![0_i64; sequence_length]
                };
                Tensor::from_array(([batch_size, sequence_length], token_type_ids))?.upcast()
            } else if key.contains(POSITION_IDS_NAME) {
                let position_ids = (past_sequence_length..(past_sequence_length + sequence_length))
                    .map(|idx| idx as i64)
                    .collect::<Vec<_>>();
                Tensor::from_array(([batch_size, sequence_length], position_ids))?.upcast()
            } else if key.starts_with(PAST_KEY_VALUES_NAME) {
                build_empty_past_kv_tensor(spec, batch_size)?
            } else if key.contains(USE_CACHE_BRANCH_NAME) {
                build_use_cache_branch_tensor(spec)?
            } else if key.contains(CACHE_POSITION_NAME) {
                let cache_position = (past_sequence_length..(past_sequence_length + sequence_length))
                    .map(|idx| idx as i64)
                    .collect::<Vec<_>>();
                Tensor::from_array(([sequence_length], cache_position))?.upcast()
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
        let pooled = pool_embedding(data, shape, &attention_mask)?;

        if pooled.len() != LOCAL_EMBEDDING_DIMENSIONS {
            return Err(EmbeddingError::InvalidEmbeddingLength(pooled.len()));
        }

        Ok(l2_normalize(pooled))
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
        .find(|spec| spec.name.to_ascii_lowercase().starts_with(PAST_KEY_VALUES_NAME))
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

fn pool_embedding(
    output_data: &[f32],
    output_shape: &[i64],
    attention_mask: &[i64],
) -> Result<Vec<f32>, EmbeddingError> {
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

            let token_index = if first_dim == 1 || attention_mask.len() != first_dim {
                0
            } else {
                last_active_token_index(attention_mask, first_dim)
            };
            let start = token_index.checked_mul(hidden_size).ok_or_else(|| {
                EmbeddingError::InvalidOutputShape(format!("shape is too large: {output_shape:?}"))
            })?;
            let end = start + hidden_size;
            Ok(output_data[start..end].to_vec())
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

            let token_index = last_active_token_index(attention_mask, sequence_length);
            let start = token_index.checked_mul(hidden_size).ok_or_else(|| {
                EmbeddingError::InvalidOutputShape(format!("shape is too large: {output_shape:?}"))
            })?;
            let end = start + hidden_size;
            Ok(output_data[start..end].to_vec())
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

fn build_metadata_lookup(
    metadata: Vec<CachedDocumentEmbeddingMetadataPayload>,
) -> HashMap<String, CachedDocumentEmbeddingMetadataPayload> {
    metadata
        .into_iter()
        .filter(|item| item.model == LOCAL_EMBEDDING_MODEL_ID)
        .map(|item| (item.document_id.clone(), item))
        .collect()
}

fn embed_query_text(query: &str) -> Result<Vec<f32>, EmbeddingError> {
    let formatted = format_query_for_embedding(query);
    let engine = EmbeddingEngine::engine()?;
    let mut engine = engine.lock().map_err(|_| EmbeddingError::EnginePoisoned)?;
    engine.embed_text(&formatted)
}

fn embed_document_text(text: &str) -> Result<Vec<f32>, EmbeddingError> {
    let engine = EmbeddingEngine::engine()?;
    let mut engine = engine.lock().map_err(|_| EmbeddingError::EnginePoisoned)?;
    engine.embed_text(text)
}

pub fn sync_document_embeddings(
    store: &mut DocumentCacheStore,
    document: &EmbeddingSyncDocumentPayload,
    metadata_lookup: Option<&HashMap<String, CachedDocumentEmbeddingMetadataPayload>>,
) -> Result<(), EmbeddingError> {
    let source_text = build_document_embedding_source_text(&document.title, &document.body);
    let content_hash = compute_document_content_hash(&source_text);

    if let Some(lookup) = metadata_lookup {
        if let Some(existing) = lookup.get(&document.id) {
            if existing.content_hash == content_hash {
                // Whole-document embedding is current; still refresh chunk embeddings below.
            } else {
                let vector = embed_document_text(&source_text)?;
                store.upsert_document_embedding(&CachedDocumentEmbeddingPayload {
                    document_id: document.id.clone(),
                    model: LOCAL_EMBEDDING_MODEL_ID.to_owned(),
                    content_hash: content_hash.clone(),
                    vector,
                    updated_at: document.updated_at.clone(),
                })?;
            }
        } else {
            let vector = embed_document_text(&source_text)?;
            store.upsert_document_embedding(&CachedDocumentEmbeddingPayload {
                document_id: document.id.clone(),
                model: LOCAL_EMBEDDING_MODEL_ID.to_owned(),
                content_hash: content_hash.clone(),
                vector,
                updated_at: document.updated_at.clone(),
            })?;
        }
    } else {
        let metadata = store
            .list_document_embedding_metadata()?
            .into_iter()
            .find(|item| item.document_id == document.id && item.model == LOCAL_EMBEDDING_MODEL_ID);

        if metadata.as_ref().map(|item| item.content_hash.as_str()) != Some(content_hash.as_str()) {
            let vector = embed_document_text(&source_text)?;
            store.upsert_document_embedding(&CachedDocumentEmbeddingPayload {
                document_id: document.id.clone(),
                model: LOCAL_EMBEDDING_MODEL_ID.to_owned(),
                content_hash: content_hash.clone(),
                vector,
                updated_at: document.updated_at.clone(),
            })?;
        }
    }

    let plain_body = crate::text_processing::extract_plain_text_from_tiptap_or_raw(&document.body);
    let chunks = chunk_document_text(&document.title, &plain_body);
    let combined_hash = compute_chunk_content_hash(
        &chunks
            .iter()
            .map(|chunk| chunk.text.clone())
            .collect::<Vec<_>>(),
    );

    let mut chunk_payloads: Vec<CachedDocumentChunkEmbeddingPayload> =
        Vec::with_capacity(chunks.len());
    for chunk in chunks {
        let vector = embed_document_text(&chunk.text)?;
        chunk_payloads.push(CachedDocumentChunkEmbeddingPayload {
            document_id: document.id.clone(),
            chunk_index: chunk.index,
            chunk_text: chunk.text,
            content_hash: combined_hash.clone(),
            model: LOCAL_EMBEDDING_MODEL_ID.to_owned(),
            vector,
            updated_at: document.updated_at.clone(),
        });
    }

    store.replace_document_chunk_embeddings(&document.id, &chunk_payloads)?;
    Ok(())
}

pub fn sync_documents_embeddings_batch(
    store: &mut DocumentCacheStore,
    documents: &[EmbeddingSyncDocumentPayload],
) -> Result<EmbeddingBatchSyncResultPayload, EmbeddingError> {
    let metadata_lookup = build_metadata_lookup(store.list_document_embedding_metadata()?);

    let mut synced_count = 0;
    let mut failed_count = 0;

    for document in documents {
        match sync_document_embeddings(store, document, Some(&metadata_lookup)) {
            Ok(()) => synced_count += 1,
            Err(error) => {
                failed_count += 1;
                log::error!(
                    "[embedding-sync] Failed to sync embeddings for \"{}\": {}",
                    document.id,
                    error
                );
            }
        }
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

    let (query_vector, semantic_weight, bm25_weight) = match embed_query_text(normalized_query) {
        Ok(vector) => (vector, semantic_weight, bm25_weight),
        Err(error) => {
            log::warn!(
                "[semantic-search] Query embedding failed, falling back to BM25-only mode: {}",
                error
            );
            (vec![0.0_f32; LOCAL_EMBEDDING_DIMENSIONS], 0.0_f32, 1.0_f32)
        }
    };

    store
        .hybrid_search_documents(
            query_vector,
            query_text,
            limit,
            min_score,
            exclude_document_id,
            semantic_weight,
            bm25_weight,
        )
        .map_err(EmbeddingError::from)
}

#[cfg(test)]
mod tests {
    use ort::tensor::{Shape, SymbolicDimensions, TensorElementType};
    use ort::value::ValueType;

    use super::{
        build_attention_mask_with_past, infer_past_kv_shape, infer_past_sequence_length,
        l2_normalize, pool_embedding, ModelInputSpec, PAST_KEY_VALUES_NAME,
        LOCAL_EMBEDDING_DIMENSIONS,
    };

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
        let pooled = pool_embedding(&output, &shape, &attention_mask).expect("pooling should work");
        assert_eq!(pooled, vec![3.0_f32, 4.0_f32]);
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
}
