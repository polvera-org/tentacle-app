use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::document_cache::{CachedDocumentPayload, DocumentCacheError, DocumentCacheStore};
use crate::document_folders::{DocumentFoldersError, DocumentFoldersService};
use crate::document_store::{self, DocumentStoreError};
use crate::embeddings::{
    hybrid_search_documents_by_query, sync_documents_embeddings_batch_with_progress,
    EmbeddingError, EmbeddingSyncDocumentPayload,
};

const CACHE_DB_FILE_NAME: &str = ".document-data.db";
const LOCAL_USER_ID: &str = "local";

pub type ProgressCallback = Box<dyn FnMut(ProgressEvent) + Send>;

#[derive(Debug, Clone)]
pub enum ProgressEvent {
    Phase1Start {
        total_documents: usize,
    },
    Phase1Progress {
        current: usize,
        total: usize,
    },
    Phase1Complete {
        documents_loaded: usize,
    },
    Phase2Start {
        total_documents: usize,
    },
    Phase2Progress {
        current: usize,
        total: usize,
        document_id: String,
    },
    Phase2Complete {
        synced: usize,
        failed: usize,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ReindexResultPayload {
    pub documents_indexed: usize,
    pub embeddings_synced: usize,
    pub embeddings_failed: usize,
    pub folder_filter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SearchOptions {
    pub limit: usize,
    pub min_score: f32,
    pub folder_filter: Option<String>,
    pub semantic_query: Option<String>,
    pub exclude_document_id: Option<String>,
    pub semantic_weight: f32,
    pub bm25_weight: f32,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            limit: 20,
            min_score: 0.0,
            folder_filter: None,
            semantic_query: None,
            exclude_document_id: None,
            semantic_weight: 1.0,
            bm25_weight: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SearchResultPayload {
    pub id: String,
    pub title: String,
    pub folder_path: String,
    pub tags: Vec<String>,
    pub relevance_score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SearchResponsePayload {
    pub query: String,
    pub results: Vec<SearchResultPayload>,
    pub total_results: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct StatusDocumentsPayload {
    pub total: usize,
    pub by_folder: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct StatusPayload {
    pub documents: StatusDocumentsPayload,
    pub folders: usize,
    pub tags: usize,
    pub last_indexed: Option<String>,
    pub index_size_bytes: u64,
}

pub struct KnowledgeBaseService;

impl KnowledgeBaseService {
    pub fn reindex(
        documents_folder: &Path,
        folder_filter: Option<&str>,
    ) -> Result<ReindexResultPayload, KnowledgeBaseError> {
        Self::reindex_with_progress(documents_folder, folder_filter, None)
    }

    pub fn reindex_with_progress(
        documents_folder: &Path,
        folder_filter: Option<&str>,
        mut progress_callback: Option<ProgressCallback>,
    ) -> Result<ReindexResultPayload, KnowledgeBaseError> {
        let normalized_filter = normalize_optional_folder_filter(folder_filter)?;
        let mut store = DocumentCacheStore::new(documents_folder)?;

        let next_documents = load_cached_documents_with_progress(
            documents_folder,
            normalized_filter.as_deref(),
            progress_callback.as_mut(),
        )?;
        let final_documents = if let Some(folder_filter) = normalized_filter.as_deref() {
            let mut retained = store.list_documents()?;
            retained
                .retain(|document| !folder_matches_filter(&document.folder_path, folder_filter));
            let mut merged_by_id: HashMap<String, CachedDocumentPayload> =
                HashMap::with_capacity(retained.len() + next_documents.len());
            for document in retained {
                merged_by_id.insert(document.id.clone(), document);
            }
            for document in &next_documents {
                merged_by_id.insert(document.id.clone(), document.clone());
            }

            let mut merged = merged_by_id.into_values().collect::<Vec<_>>();
            merged.sort_by(|left, right| {
                right
                    .updated_at
                    .cmp(&left.updated_at)
                    .then_with(|| left.id.cmp(&right.id))
            });
            merged
        } else {
            next_documents.clone()
        };

        store.replace_documents(&final_documents)?;

        let embedding_documents = next_documents
            .iter()
            .map(|document| EmbeddingSyncDocumentPayload {
                id: document.id.clone(),
                title: document.title.clone(),
                body: document.body.clone(),
                updated_at: document.updated_at.clone(),
            })
            .collect::<Vec<_>>();
        let embedding_result = sync_documents_embeddings_batch_with_progress(
            &mut store,
            &embedding_documents,
            progress_callback.as_mut(),
        )?;

        Ok(ReindexResultPayload {
            documents_indexed: next_documents.len(),
            embeddings_synced: embedding_result.synced_count,
            embeddings_failed: embedding_result.failed_count,
            folder_filter: normalized_filter,
        })
    }

    pub fn search(
        documents_folder: &Path,
        query: &str,
        options: SearchOptions,
    ) -> Result<SearchResponsePayload, KnowledgeBaseError> {
        let normalized_query = query.trim().to_owned();
        let normalized_filter = normalize_optional_folder_filter(options.folder_filter.as_deref())?;
        let requested_limit = options.limit;
        let candidate_limit = if normalized_filter.is_some() {
            requested_limit.saturating_mul(5).max(requested_limit)
        } else {
            requested_limit
        };

        let store = DocumentCacheStore::new(documents_folder)?;
        let hits = hybrid_search_documents_by_query(
            &store,
            &normalized_query,
            options.semantic_query.as_deref(),
            candidate_limit,
            options.min_score,
            options.exclude_document_id,
            options.semantic_weight,
            options.bm25_weight,
        )?;

        let documents = store.list_documents()?;
        let mut documents_by_id: HashMap<String, CachedDocumentPayload> =
            HashMap::with_capacity(documents.len());
        for document in documents {
            documents_by_id.insert(document.id.clone(), document);
        }

        let mut results = Vec::new();
        for hit in hits {
            if results.len() == requested_limit {
                break;
            }

            let Some(document) = documents_by_id.get(&hit.document_id) else {
                continue;
            };

            if normalized_filter
                .as_deref()
                .is_some_and(|folder| !folder_matches_filter(&document.folder_path, folder))
            {
                continue;
            }

            results.push(SearchResultPayload {
                id: document.id.clone(),
                title: document.title.clone(),
                folder_path: document.folder_path.clone(),
                tags: document.tags.clone(),
                relevance_score: hit.score,
            });
        }

        Ok(SearchResponsePayload {
            query: normalized_query,
            total_results: results.len(),
            results,
        })
    }

    pub fn status(documents_folder: &Path) -> Result<StatusPayload, KnowledgeBaseError> {
        let store = DocumentCacheStore::new(documents_folder)?;
        let documents = store.list_documents()?;
        let tags = store.list_document_tags()?;
        let folders = DocumentFoldersService::list_folders(documents_folder)?;

        let mut by_folder: BTreeMap<String, usize> = BTreeMap::new();
        for document in &documents {
            *by_folder.entry(document.folder_path.clone()).or_insert(0) += 1;
        }

        let cache_db_path = documents_folder.join(CACHE_DB_FILE_NAME);
        let cache_db_metadata = match fs::metadata(&cache_db_path) {
            Ok(metadata) => Some(metadata),
            Err(error) if error.kind() == ErrorKind::NotFound => None,
            Err(error) => return Err(KnowledgeBaseError::Io(error)),
        };

        let index_size_bytes = cache_db_metadata
            .as_ref()
            .map(std::fs::Metadata::len)
            .unwrap_or(0);

        let modified_last_indexed = cache_db_metadata
            .as_ref()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(format_system_time_utc);
        let fallback_last_indexed = documents
            .iter()
            .map(|document| document.updated_at.clone())
            .max();

        Ok(StatusPayload {
            documents: StatusDocumentsPayload {
                total: documents.len(),
                by_folder,
            },
            folders: folders.len(),
            tags: tags.len(),
            last_indexed: modified_last_indexed.or(fallback_last_indexed),
            index_size_bytes,
        })
    }
}

fn load_cached_documents_with_progress(
    documents_folder: &Path,
    folder_filter: Option<&str>,
    mut progress_callback: Option<&mut ProgressCallback>,
) -> Result<Vec<CachedDocumentPayload>, KnowledgeBaseError> {
    let listed_documents = document_store::list_documents(documents_folder)?;

    let candidate_documents = listed_documents
        .into_iter()
        .filter(|document| {
            !folder_filter
                .is_some_and(|folder| !folder_matches_filter(&document.folder_path, folder))
        })
        .collect::<Vec<_>>();
    let total_to_process = candidate_documents.len();

    if let Some(callback) = progress_callback.as_mut() {
        callback(ProgressEvent::Phase1Start {
            total_documents: total_to_process,
        });
    }

    struct CandidateReadOutcome {
        document_id: String,
        read_result: Result<CachedDocumentPayload, DocumentStoreError>,
    }

    let read_outcomes = candidate_documents
        .par_iter()
        .map(|document| {
            let read_result = document_store::read_document(documents_folder, &document.id).map(
                |full_document| CachedDocumentPayload {
                    id: full_document.id,
                    user_id: LOCAL_USER_ID.to_owned(),
                    title: full_document.title,
                    body: full_document.body,
                    folder_path: full_document.folder_path,
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: full_document.created_at,
                    updated_at: full_document.updated_at,
                    tags: full_document.tags,
                },
            );

            CandidateReadOutcome {
                document_id: document.id.clone(),
                read_result,
            }
        })
        .collect::<Vec<_>>();

    let mut cached_documents: Vec<CachedDocumentPayload> = Vec::new();

    for (index, outcome) in read_outcomes.into_iter().enumerate() {
        let fatal_error = match outcome.read_result {
            Ok(document) => {
                cached_documents.push(document);
                None
            }
            Err(DocumentStoreError::Io(error)) => {
                log::warn!(
                    "[knowledge-base] failed to read document \"{}\" while reindexing: {}",
                    outcome.document_id,
                    error
                );
                None
            }
            Err(DocumentStoreError::NotFound(message)) => {
                log::warn!(
                    "[knowledge-base] skipped document \"{}\" while reindexing: {}",
                    outcome.document_id,
                    message
                );
                None
            }
            Err(error) => Some(error),
        };

        if let Some(callback) = progress_callback.as_mut() {
            callback(ProgressEvent::Phase1Progress {
                current: index + 1,
                total: total_to_process,
            });
        }

        if let Some(error) = fatal_error {
            return Err(KnowledgeBaseError::DocumentStore(error));
        }
    }

    if let Some(callback) = progress_callback.as_mut() {
        callback(ProgressEvent::Phase1Complete {
            documents_loaded: cached_documents.len(),
        });
    }

    cached_documents.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.id.cmp(&right.id))
    });

    Ok(cached_documents)
}

fn normalize_optional_folder_filter(
    folder_filter: Option<&str>,
) -> Result<Option<String>, KnowledgeBaseError> {
    let Some(folder_filter) = folder_filter else {
        return Ok(None);
    };

    normalize_folder_filter(folder_filter).map_err(KnowledgeBaseError::Validation)
}

fn normalize_folder_filter(folder_filter: &str) -> Result<Option<String>, String> {
    let replaced = folder_filter.replace('\\', "/");
    let trimmed = replaced.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let mut segments: Vec<String> = Vec::new();
    for segment in trimmed.split('/') {
        let normalized = segment.trim();
        if normalized.is_empty() {
            continue;
        }

        if normalized == "." || normalized == ".." {
            return Err("folder_filter must not contain traversal segments".to_owned());
        }

        segments.push(normalized.to_owned());
    }

    if segments.is_empty() {
        Ok(None)
    } else {
        Ok(Some(segments.join("/")))
    }
}

fn folder_matches_filter(folder_path: &str, folder_filter: &str) -> bool {
    if folder_filter.is_empty() {
        return true;
    }

    folder_path == folder_filter || folder_path.starts_with(&format!("{folder_filter}/"))
}

fn format_system_time_utc(value: SystemTime) -> Option<String> {
    let duration = value.duration_since(UNIX_EPOCH).ok()?;
    let seconds = i64::try_from(duration.as_secs()).ok()?;
    Some(format_unix_seconds_utc(seconds))
}

fn format_unix_seconds_utc(seconds_since_epoch: i64) -> String {
    let days_since_epoch = seconds_since_epoch.div_euclid(86_400);
    let seconds_within_day = seconds_since_epoch.rem_euclid(86_400);

    let (year, month, day) = civil_from_days(days_since_epoch);
    let hour = seconds_within_day / 3_600;
    let minute = (seconds_within_day % 3_600) / 60;
    let second = seconds_within_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_unix_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }

    (year, month, day)
}

#[derive(Debug, Error)]
pub enum KnowledgeBaseError {
    #[error("document store error: {0}")]
    DocumentStore(#[from] DocumentStoreError),
    #[error("document cache error: {0}")]
    DocumentCache(#[from] DocumentCacheError),
    #[error("document folders error: {0}")]
    DocumentFolders(#[from] DocumentFoldersError),
    #[error("embedding error: {0}")]
    Embedding(#[from] EmbeddingError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Validation(String),
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::document_cache::DocumentCacheStore;
    use crate::document_store::{create_document, CreateDocumentInput};

    use super::{KnowledgeBaseError, KnowledgeBaseService, SearchOptions};

    fn unique_temp_path() -> std::path::PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after unix epoch")
            .as_nanos();
        let thread_id = format!("{:?}", std::thread::current().id())
            .chars()
            .filter(|character| character.is_alphanumeric())
            .collect::<String>();
        std::env::temp_dir().join(format!(
            "tentacle-knowledge-base-test-{timestamp}-{thread_id}"
        ))
    }

    #[test]
    fn knowledge_base_reindex_handles_empty_store() {
        let temp_dir = unique_temp_path();

        let result = KnowledgeBaseService::reindex(&temp_dir, None).expect("reindex should work");
        assert_eq!(result.documents_indexed, 0);
        assert_eq!(result.embeddings_synced, 0);
        assert_eq!(result.embeddings_failed, 0);
        assert_eq!(result.folder_filter, None);

        fs::remove_dir_all(&temp_dir).expect("cleanup temp folder");
    }

    #[test]
    fn knowledge_base_reindex_rejects_traversal_filter() {
        let temp_dir = unique_temp_path();

        let error = KnowledgeBaseService::reindex(&temp_dir, Some("../work"))
            .expect_err("traversal path should fail");
        assert!(matches!(error, KnowledgeBaseError::Validation(_)));
    }

    #[test]
    fn knowledge_base_search_preserves_order_when_filtering() {
        let temp_dir = unique_temp_path();
        let mut store = DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");
        store
            .replace_documents(&[
                crate::document_cache::CachedDocumentPayload {
                    id: "doc-a".to_owned(),
                    user_id: "local".to_owned(),
                    title: "Alpha".to_owned(),
                    body: "alpha signal".to_owned(),
                    folder_path: "work".to_owned(),
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: "2026-02-18T00:00:00Z".to_owned(),
                    updated_at: "2026-02-18T00:00:00Z".to_owned(),
                    tags: vec!["one".to_owned()],
                },
                crate::document_cache::CachedDocumentPayload {
                    id: "doc-b".to_owned(),
                    user_id: "local".to_owned(),
                    title: "Alpha Two".to_owned(),
                    body: "alpha beta".to_owned(),
                    folder_path: "personal".to_owned(),
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: "2026-02-18T00:00:01Z".to_owned(),
                    updated_at: "2026-02-18T00:00:01Z".to_owned(),
                    tags: vec!["two".to_owned()],
                },
                crate::document_cache::CachedDocumentPayload {
                    id: "doc-c".to_owned(),
                    user_id: "local".to_owned(),
                    title: "Alpha Three".to_owned(),
                    body: "alpha gamma".to_owned(),
                    folder_path: "work/sub".to_owned(),
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: "2026-02-18T00:00:02Z".to_owned(),
                    updated_at: "2026-02-18T00:00:02Z".to_owned(),
                    tags: vec!["three".to_owned()],
                },
            ])
            .expect("documents should insert");

        let mut options = SearchOptions::default();
        options.semantic_weight = 0.0;
        options.bm25_weight = 1.0;
        options.limit = 10;

        let all_results = KnowledgeBaseService::search(&temp_dir, "alpha", options.clone())
            .expect("search should work");

        let mut filtered_options = options.clone();
        filtered_options.folder_filter = Some("work".to_owned());
        let filtered_results = KnowledgeBaseService::search(&temp_dir, "alpha", filtered_options)
            .expect("filtered search should work");

        let expected_ids = all_results
            .results
            .iter()
            .filter(|result| {
                result.folder_path == "work" || result.folder_path.starts_with("work/")
            })
            .map(|result| result.id.clone())
            .collect::<Vec<_>>();
        let actual_ids = filtered_results
            .results
            .iter()
            .map(|result| result.id.clone())
            .collect::<Vec<_>>();

        assert_eq!(actual_ids, expected_ids);

        fs::remove_dir_all(&temp_dir).expect("cleanup temp folder");
    }

    #[test]
    fn knowledge_base_status_reports_expected_counts() {
        let temp_dir = unique_temp_path();

        let root_document = create_document(
            &temp_dir,
            &CreateDocumentInput {
                title: Some("Root".to_owned()),
                body: Some("Root body".to_owned()),
                tags: vec!["shared".to_owned()],
                ..CreateDocumentInput::default()
            },
        )
        .expect("create root document");
        let work_document = create_document(
            &temp_dir,
            &CreateDocumentInput {
                title: Some("Work".to_owned()),
                body: Some("Work body".to_owned()),
                folder_path: Some("work".to_owned()),
                tags: vec!["shared".to_owned(), "team".to_owned()],
                ..CreateDocumentInput::default()
            },
        )
        .expect("create work document");
        let personal_document = create_document(
            &temp_dir,
            &CreateDocumentInput {
                title: Some("Personal".to_owned()),
                body: Some("Personal body".to_owned()),
                folder_path: Some("personal".to_owned()),
                tags: vec!["journal".to_owned()],
                ..CreateDocumentInput::default()
            },
        )
        .expect("create personal document");

        let mut store = DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");
        store
            .replace_documents(&[
                crate::document_cache::CachedDocumentPayload {
                    id: root_document.id,
                    user_id: "local".to_owned(),
                    title: root_document.title,
                    body: root_document.body,
                    folder_path: root_document.folder_path,
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: root_document.created_at,
                    updated_at: root_document.updated_at,
                    tags: root_document.tags,
                },
                crate::document_cache::CachedDocumentPayload {
                    id: work_document.id,
                    user_id: "local".to_owned(),
                    title: work_document.title,
                    body: work_document.body,
                    folder_path: work_document.folder_path,
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: work_document.created_at,
                    updated_at: work_document.updated_at,
                    tags: work_document.tags,
                },
                crate::document_cache::CachedDocumentPayload {
                    id: personal_document.id,
                    user_id: "local".to_owned(),
                    title: personal_document.title,
                    body: personal_document.body,
                    folder_path: personal_document.folder_path,
                    banner_image_url: None,
                    deleted_at: None,
                    created_at: personal_document.created_at,
                    updated_at: personal_document.updated_at,
                    tags: personal_document.tags,
                },
            ])
            .expect("replace documents in cache");

        let status = KnowledgeBaseService::status(&temp_dir).expect("status should work");
        assert_eq!(status.documents.total, 3);
        assert_eq!(status.documents.by_folder.get(""), Some(&1));
        assert_eq!(status.documents.by_folder.get("work"), Some(&1));
        assert_eq!(status.documents.by_folder.get("personal"), Some(&1));
        assert_eq!(status.folders, 2);
        assert_eq!(status.tags, 3);
        assert!(status.last_indexed.is_some());
        assert!(status.index_size_bytes > 0);

        fs::remove_dir_all(&temp_dir).expect("cleanup temp folder");
    }
}
