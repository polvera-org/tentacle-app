use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Once;

use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const CACHE_DB_FILE_NAME: &str = ".document-data.db";
const EMBEDDING_VECTOR_DIMENSIONS: usize = 384;

static SQLITE_VEC_EXTENSION_INIT: Once = Once::new();

const CREATE_SCHEMA_SQL: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  banner_image_url TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_tags (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags(tag);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_tags_document_id_tag ON document_tags(document_id, tag);

CREATE TABLE IF NOT EXISTS document_embeddings_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_embeddings_meta_updated_at ON document_embeddings_meta(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_meta_content_hash ON document_embeddings_meta(content_hash);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_meta_document_id ON document_embeddings_meta(document_id);

CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings_vec USING vec0(
  embedding float[384]
);

CREATE TRIGGER IF NOT EXISTS trg_document_embeddings_meta_delete_vec
AFTER DELETE ON document_embeddings_meta
BEGIN
  DELETE FROM document_embeddings_vec WHERE rowid = OLD.id;
END;
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedDocumentPayload {
    pub id: String,
    pub user_id: String,
    pub title: String,
    pub body: String,
    pub banner_image_url: Option<String>,
    pub deleted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedDocumentTagPayload {
    pub tag: String,
    pub last_used_at: String,
    pub usage_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedDocumentEmbeddingPayload {
    pub document_id: String,
    pub model: String,
    pub content_hash: String,
    pub vector: Vec<f32>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedDocumentEmbeddingMetadataPayload {
    pub document_id: String,
    pub model: String,
    pub content_hash: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchHitPayload {
    pub document_id: String,
    pub score: f32,
}

pub struct DocumentCacheStore {
    connection: Connection,
}

fn initialize_sqlite_vec_extension() {
    SQLITE_VEC_EXTENSION_INIT.call_once(|| unsafe {
        // sqlite-vec exports `sqlite3_vec_init` as a raw symbol; sqlite expects a generic extension entrypoint.
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    });
}

impl DocumentCacheStore {
    pub fn new(documents_folder: &Path) -> Result<Self, DocumentCacheError> {
        initialize_sqlite_vec_extension();
        std::fs::create_dir_all(documents_folder)?;

        let database_path = documents_folder.join(CACHE_DB_FILE_NAME);
        let connection = Connection::open(database_path)?;
        connection.execute_batch(CREATE_SCHEMA_SQL)?;

        Ok(Self { connection })
    }

    pub fn list_documents(&self) -> Result<Vec<CachedDocumentPayload>, DocumentCacheError> {
        let mut statement = self.connection.prepare(
            "SELECT
               d.id,
               d.user_id,
               d.title,
               d.body,
               d.banner_image_url,
               d.deleted_at,
               d.created_at,
               d.updated_at,
               dt.tag
             FROM documents d
             LEFT JOIN document_tags dt ON dt.document_id = d.id
             ORDER BY d.updated_at DESC, d.id ASC, dt.tag ASC",
        )?;

        let mut rows = statement.query([])?;
        let mut documents: Vec<CachedDocumentPayload> = Vec::new();
        let mut index_by_document_id: HashMap<String, usize> = HashMap::new();

        while let Some(row) = rows.next()? {
            let document_id: String = row.get(0)?;
            let tag: Option<String> = row.get(8)?;

            if let Some(index) = index_by_document_id.get(&document_id).copied() {
                if let Some(tag) = tag {
                    documents[index].tags.push(tag);
                }
                continue;
            }

            let mut document = CachedDocumentPayload {
                id: document_id.clone(),
                user_id: row.get(1)?,
                title: row.get(2)?,
                body: row.get(3)?,
                banner_image_url: row.get(4)?,
                deleted_at: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                tags: Vec::new(),
            };

            if let Some(tag) = tag {
                document.tags.push(tag);
            }

            index_by_document_id.insert(document_id, documents.len());
            documents.push(document);
        }

        Ok(documents)
    }

    pub fn list_document_tags(&self) -> Result<Vec<CachedDocumentTagPayload>, DocumentCacheError> {
        let mut statement = self.connection.prepare(
            "SELECT
               tag,
               MAX(created_at) AS last_used_at,
               COUNT(*) AS usage_count
             FROM document_tags
             WHERE TRIM(tag) <> ''
             GROUP BY tag
             ORDER BY last_used_at DESC, tag ASC",
        )?;

        let rows = statement.query_map([], |row| {
            Ok(CachedDocumentTagPayload {
                tag: row.get(0)?,
                last_used_at: row.get(1)?,
                usage_count: row.get(2)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(DocumentCacheError::from)
    }

    pub fn upsert_document(
        &mut self,
        document: &CachedDocumentPayload,
    ) -> Result<(), DocumentCacheError> {
        let transaction = self.connection.transaction()?;
        Self::upsert_document_record(&transaction, document)?;
        Self::replace_document_tags(&transaction, document)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn delete_document(&self, document_id: &str) -> Result<(), DocumentCacheError> {
        self.connection
            .execute("DELETE FROM documents WHERE id = ?1", params![document_id])?;
        Ok(())
    }

    pub fn replace_documents(
        &mut self,
        documents: &[CachedDocumentPayload],
    ) -> Result<(), DocumentCacheError> {
        let transaction = self.connection.transaction()?;
        transaction.execute("DELETE FROM documents", [])?;

        for document in documents {
            Self::upsert_document_record(&transaction, document)?;
            Self::insert_document_tags(&transaction, document)?;
        }

        transaction.commit()?;
        Ok(())
    }

    pub fn list_document_embedding_metadata(
        &self,
    ) -> Result<Vec<CachedDocumentEmbeddingMetadataPayload>, DocumentCacheError> {
        let mut statement = self.connection.prepare(
            "SELECT document_id, model, content_hash, updated_at
             FROM document_embeddings_meta
             ORDER BY updated_at DESC, document_id ASC",
        )?;

        let rows = statement.query_map([], |row| {
            Ok(CachedDocumentEmbeddingMetadataPayload {
                document_id: row.get(0)?,
                model: row.get(1)?,
                content_hash: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(DocumentCacheError::from)
    }

    pub fn upsert_document_embedding(
        &mut self,
        embedding: &CachedDocumentEmbeddingPayload,
    ) -> Result<(), DocumentCacheError> {
        validate_embedding_vector(&embedding.vector)?;

        let transaction = self.connection.transaction()?;
        transaction.execute(
            "INSERT INTO document_embeddings_meta (document_id, model, content_hash, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(document_id) DO UPDATE SET
               model = excluded.model,
               content_hash = excluded.content_hash,
               updated_at = excluded.updated_at",
            params![
                &embedding.document_id,
                &embedding.model,
                &embedding.content_hash,
                &embedding.updated_at
            ],
        )?;

        let meta_id: i64 = transaction.query_row(
            "SELECT id FROM document_embeddings_meta WHERE document_id = ?1",
            params![&embedding.document_id],
            |row| row.get(0),
        )?;

        let vector_bytes = f32_vector_to_le_bytes(&embedding.vector);
        // vec0 does not reliably support conflict clauses like INSERT OR REPLACE.
        // Delete first, then insert deterministically for idempotent upserts.
        transaction.execute(
            "DELETE FROM document_embeddings_vec WHERE rowid = ?1",
            params![meta_id],
        )?;
        transaction.execute(
            "INSERT INTO document_embeddings_vec (rowid, embedding)
             VALUES (?1, vec_f32(?2))",
            params![meta_id, vector_bytes],
        )?;

        transaction.commit()?;
        Ok(())
    }

    pub fn delete_document_embedding(&self, document_id: &str) -> Result<(), DocumentCacheError> {
        self.connection.execute(
            "DELETE FROM document_embeddings_meta WHERE document_id = ?1",
            params![document_id],
        )?;
        Ok(())
    }

    pub fn replace_document_embeddings(
        &mut self,
        embeddings: &[CachedDocumentEmbeddingPayload],
    ) -> Result<(), DocumentCacheError> {
        for embedding in embeddings {
            validate_embedding_vector(&embedding.vector)?;
        }

        let transaction = self.connection.transaction()?;
        transaction.execute("DELETE FROM document_embeddings_meta", [])?;

        for embedding in embeddings {
            Self::insert_document_embedding(&transaction, embedding)?;
        }

        transaction.commit()?;
        Ok(())
    }

    pub fn semantic_search_documents(
        &self,
        query_vector: Vec<f32>,
        limit: usize,
        min_score: f32,
        exclude_document_id: Option<String>,
    ) -> Result<Vec<SemanticSearchHitPayload>, DocumentCacheError> {
        if limit == 0 {
            return Ok(Vec::new());
        }

        validate_embedding_vector(&query_vector)?;

        let k = limit.saturating_mul(4).max(1);
        let k = i64::try_from(k).map_err(|_| {
            DocumentCacheError::Validation("semantic search limit is too large".into())
        })?;

        let bounded_min_score = min_score.clamp(-1.0, 1.0);
        let max_distance = (2.0_f32 * (1.0 - bounded_min_score)).sqrt();
        let query_vector_bytes = f32_vector_to_le_bytes(&query_vector);

        let mut statement = self.connection.prepare(
            "SELECT m.document_id, v.distance
             FROM document_embeddings_vec v
             JOIN document_embeddings_meta m ON m.id = v.rowid
             WHERE v.embedding MATCH vec_f32(?1)
               AND k = ?2
               AND (?3 IS NULL OR m.document_id <> ?3)",
        )?;

        let rows = statement
            .query_map(params![query_vector_bytes, k, exclude_document_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?))
            })?;

        let mut hits = Vec::new();
        for row in rows {
            let (document_id, distance) = row?;
            if distance > max_distance {
                continue;
            }

            let score = 1.0 - ((distance * distance) / 2.0);
            hits.push(SemanticSearchHitPayload { document_id, score });
        }

        hits.sort_by(|left, right| {
            right
                .score
                .partial_cmp(&left.score)
                .unwrap_or(Ordering::Equal)
                .then_with(|| left.document_id.cmp(&right.document_id))
        });
        hits.truncate(limit);

        Ok(hits)
    }

    fn upsert_document_record(
        transaction: &Transaction<'_>,
        document: &CachedDocumentPayload,
    ) -> Result<(), rusqlite::Error> {
        transaction.execute(
            "INSERT INTO documents (
               id, user_id, title, body, banner_image_url, deleted_at, created_at, updated_at
             ) VALUES (
               ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
             )
             ON CONFLICT(id) DO UPDATE SET
               user_id = excluded.user_id,
               title = excluded.title,
               body = excluded.body,
               banner_image_url = excluded.banner_image_url,
               deleted_at = excluded.deleted_at,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at",
            params![
                document.id,
                document.user_id,
                document.title,
                document.body,
                document.banner_image_url,
                document.deleted_at,
                document.created_at,
                document.updated_at
            ],
        )?;
        Ok(())
    }

    fn replace_document_tags(
        transaction: &Transaction<'_>,
        document: &CachedDocumentPayload,
    ) -> Result<(), rusqlite::Error> {
        transaction.execute(
            "DELETE FROM document_tags WHERE document_id = ?1",
            params![document.id],
        )?;
        Self::insert_document_tags(transaction, document)
    }

    fn insert_document_tags(
        transaction: &Transaction<'_>,
        document: &CachedDocumentPayload,
    ) -> Result<(), rusqlite::Error> {
        for tag in dedupe_non_empty_tags(&document.tags) {
            let tag_id = format!("{}:{}", document.id, tag);
            transaction.execute(
                "INSERT INTO document_tags (id, document_id, tag, created_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![tag_id, document.id, tag, document.updated_at],
            )?;
        }

        Ok(())
    }

    fn insert_document_embedding(
        transaction: &Transaction<'_>,
        embedding: &CachedDocumentEmbeddingPayload,
    ) -> Result<(), rusqlite::Error> {
        transaction.execute(
            "INSERT INTO document_embeddings_meta (document_id, model, content_hash, updated_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                &embedding.document_id,
                &embedding.model,
                &embedding.content_hash,
                &embedding.updated_at
            ],
        )?;

        let meta_id = transaction.last_insert_rowid();
        let vector_bytes = f32_vector_to_le_bytes(&embedding.vector);
        transaction.execute(
            "INSERT INTO document_embeddings_vec (rowid, embedding)
             VALUES (?1, vec_f32(?2))",
            params![meta_id, vector_bytes],
        )?;

        Ok(())
    }
}

fn dedupe_non_empty_tags(tags: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();

    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }

        if seen.insert(trimmed.to_owned()) {
            deduped.push(trimmed.to_owned());
        }
    }

    deduped
}

fn validate_embedding_vector(vector: &[f32]) -> Result<(), DocumentCacheError> {
    if vector.len() != EMBEDDING_VECTOR_DIMENSIONS {
        return Err(DocumentCacheError::Validation(format!(
            "embedding vector must contain exactly {EMBEDDING_VECTOR_DIMENSIONS} dimensions (got {})",
            vector.len()
        )));
    }

    Ok(())
}

fn f32_vector_to_le_bytes(vector: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(vector.len() * std::mem::size_of::<f32>());
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

#[derive(Debug, Error)]
pub enum DocumentCacheError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Validation(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path() -> std::path::PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("tentacle-cache-test-{timestamp}"))
    }

    #[test]
    fn initializes_vec_schema_and_executes_embedding_search() {
        let temp_dir = unique_temp_path();

        {
            let mut store = DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");

            let document = CachedDocumentPayload {
                id: "doc-1".to_string(),
                user_id: "user-1".to_string(),
                title: "Test".to_string(),
                body: "Body".to_string(),
                banner_image_url: None,
                deleted_at: None,
                created_at: "2026-02-13T00:00:00Z".to_string(),
                updated_at: "2026-02-13T00:00:00Z".to_string(),
                tags: vec!["tag".to_string()],
            };
            store
                .upsert_document(&document)
                .expect("document upsert should succeed");

            let embedding = CachedDocumentEmbeddingPayload {
                document_id: document.id.clone(),
                model: "test-model".to_string(),
                content_hash: "hash".to_string(),
                vector: vec![0.0; EMBEDDING_VECTOR_DIMENSIONS],
                updated_at: "2026-02-13T00:00:00Z".to_string(),
            };
            store
                .upsert_document_embedding(&embedding)
                .expect("embedding upsert should succeed");

            let updated_embedding = CachedDocumentEmbeddingPayload {
                document_id: document.id.clone(),
                model: "test-model".to_string(),
                content_hash: "updated-hash".to_string(),
                vector: vec![1.0; EMBEDDING_VECTOR_DIMENSIONS],
                updated_at: "2026-02-13T00:00:01Z".to_string(),
            };
            store
                .upsert_document_embedding(&updated_embedding)
                .expect("repeated embedding upsert should succeed");

            let metadata = store
                .list_document_embedding_metadata()
                .expect("embedding metadata read should succeed");
            assert_eq!(metadata.len(), 1);
            assert_eq!(metadata[0].document_id, document.id);
            assert_eq!(metadata[0].content_hash, "updated-hash");

            let hits = store
                .semantic_search_documents(
                    vec![1.0; EMBEDDING_VECTOR_DIMENSIONS],
                    1,
                    0.0,
                    None,
                )
                .expect("semantic search should succeed");

            assert_eq!(hits.len(), 1);
            assert_eq!(hits[0].document_id, document.id);
        }

        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
