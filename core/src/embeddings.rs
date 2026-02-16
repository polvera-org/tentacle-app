use std::collections::HashMap;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::document_cache::{
    CachedDocumentChunkEmbeddingPayload, CachedDocumentEmbeddingMetadataPayload,
    CachedDocumentEmbeddingPayload, DocumentCacheError, DocumentCacheStore, HybridSearchHitPayload,
    EMBEDDING_VECTOR_DIMENSIONS,
};
use crate::text_processing::{
    build_document_embedding_source_text, chunk_document_text, format_query_for_embedding,
};

pub const LOCAL_EMBEDDING_MODEL_ID: &str = "tentacle-core/hash-embedding-v1";
pub const LOCAL_EMBEDDING_DIMENSIONS: usize = EMBEDDING_VECTOR_DIMENSIONS;

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
    #[error("embedding input must not be empty")]
    EmptyInput,
}

struct EmbeddingEngine;

static EMBEDDING_ENGINE: Lazy<EmbeddingEngine> = Lazy::new(|| EmbeddingEngine);

fn is_token_char(value: char) -> bool {
    value.is_alphanumeric() || value == '-'
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
    fn embed_text(&self, text: &str) -> Result<Vec<f32>, EmbeddingError> {
        let normalized = text.trim().to_lowercase();
        if normalized.is_empty() {
            return Err(EmbeddingError::EmptyInput);
        }

        let mut vector = vec![0.0_f32; LOCAL_EMBEDDING_DIMENSIONS];

        let mut current_token = String::new();
        for character in normalized.chars() {
            if is_token_char(character) {
                current_token.push(character);
                continue;
            }

            if current_token.len() >= 2 {
                self.accumulate_token(&current_token, &mut vector);
            }
            current_token.clear();
        }

        if current_token.len() >= 2 {
            self.accumulate_token(&current_token, &mut vector);
        }

        Ok(l2_normalize(vector))
    }

    fn accumulate_token(&self, token: &str, target: &mut [f32]) {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        let digest = hasher.finalize();
        let weight = 1.0_f32 + (token.len().min(24) as f32 / 24.0_f32);

        for chunk in digest.chunks_exact(8).take(4) {
            let mut bytes = [0_u8; 8];
            bytes.copy_from_slice(chunk);
            let value = u64::from_le_bytes(bytes);
            let index = (value % LOCAL_EMBEDDING_DIMENSIONS as u64) as usize;
            let sign = if (value >> 63) == 0 {
                1.0_f32
            } else {
                -1.0_f32
            };
            target[index] += sign * weight;
        }
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
    EMBEDDING_ENGINE.embed_text(&formatted)
}

fn embed_document_text(text: &str) -> Result<Vec<f32>, EmbeddingError> {
    EMBEDDING_ENGINE.embed_text(text)
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
    use super::{embed_document_text, embed_query_text, LOCAL_EMBEDDING_DIMENSIONS};

    #[test]
    fn document_embedding_has_expected_dimensions() {
        let vector = embed_document_text("example text").expect("embedding should work");
        assert_eq!(vector.len(), LOCAL_EMBEDDING_DIMENSIONS);
    }

    #[test]
    fn query_embedding_has_expected_dimensions() {
        let vector = embed_query_text("search query").expect("embedding should work");
        assert_eq!(vector.len(), LOCAL_EMBEDDING_DIMENSIONS);
    }
}
