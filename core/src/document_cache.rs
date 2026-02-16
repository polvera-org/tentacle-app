use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Once;
use std::time::Instant;

use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const CACHE_DB_FILE_NAME: &str = ".document-data.db";
pub const EMBEDDING_VECTOR_DIMENSIONS: usize = 1024;

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
  embedding float[1024]
);

CREATE TRIGGER IF NOT EXISTS trg_document_embeddings_meta_delete_vec
AFTER DELETE ON document_embeddings_meta
BEGIN
  DELETE FROM document_embeddings_vec WHERE rowid = OLD.id;
END;

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title, body,
  content='documents', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_insert
AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_update
AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO documents_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_delete
AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;

CREATE TABLE IF NOT EXISTS document_chunk_embeddings_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunk_meta_doc_id ON document_chunk_embeddings_meta(document_id);

CREATE VIRTUAL TABLE IF NOT EXISTS document_chunk_embeddings_vec USING vec0(embedding float[1024]);

CREATE TRIGGER IF NOT EXISTS trg_chunk_meta_delete_vec
AFTER DELETE ON document_chunk_embeddings_meta
BEGIN
  DELETE FROM document_chunk_embeddings_vec WHERE rowid = OLD.id;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSearchHitPayload {
    pub document_id: String,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedDocumentChunkEmbeddingPayload {
    pub document_id: String,
    pub chunk_index: usize,
    pub chunk_text: String,
    pub content_hash: String,
    pub model: String,
    pub vector: Vec<f32>,
    pub updated_at: String,
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

fn is_fts_stopword(token: &str) -> bool {
    matches!(
        token,
        "a" | "an"
            | "and"
            | "are"
            | "as"
            | "at"
            | "be"
            | "but"
            | "by"
            | "for"
            | "from"
            | "how"
            | "if"
            | "in"
            | "into"
            | "is"
            | "it"
            | "no"
            | "not"
            | "of"
            | "on"
            | "or"
            | "that"
            | "the"
            | "their"
            | "then"
            | "there"
            | "these"
            | "they"
            | "this"
            | "to"
            | "was"
            | "will"
            | "with"
    )
}

fn tokenize_query_terms(raw: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for token in raw.split(|c: char| !c.is_alphanumeric() && c != '-') {
        let normalized = token.trim().to_lowercase();
        if normalized.len() < 2 || is_fts_stopword(&normalized) {
            continue;
        }

        if seen.insert(normalized.clone()) {
            tokens.push(normalized);
        }
    }

    tokens
}

fn stemmed_token_prefix(token: &str) -> Option<String> {
    let lower = token.to_lowercase();
    let mut stem = lower.clone();

    if stem.len() > 6 && stem.ends_with("ing") {
        let new_len = stem.len().saturating_sub(3);
        stem.truncate(new_len);
    } else if stem.len() > 5 && stem.ends_with("edly") {
        let new_len = stem.len().saturating_sub(4);
        stem.truncate(new_len);
    } else if stem.len() > 4 && stem.ends_with("ed") {
        let new_len = stem.len().saturating_sub(2);
        stem.truncate(new_len);
    } else if stem.len() > 4 && stem.ends_with("ies") {
        let new_len = stem.len().saturating_sub(3);
        stem.truncate(new_len);
        stem.push('y');
    } else if stem.len() > 4 && stem.ends_with("es") {
        let new_len = stem.len().saturating_sub(2);
        stem.truncate(new_len);
    } else if stem.len() > 4 && stem.ends_with("s") {
        let new_len = stem.len().saturating_sub(1);
        stem.truncate(new_len);
    } else if stem.len() > 5 && stem.ends_with("al") {
        let new_len = stem.len().saturating_sub(2);
        stem.truncate(new_len);
    } else if stem.len() > 5 && stem.ends_with("ly") {
        let new_len = stem.len().saturating_sub(2);
        stem.truncate(new_len);
    }

    if stem == lower || stem.len() < 3 {
        return None;
    }

    Some(stem)
}

/// Sanitize a raw user query for use in FTS5 MATCH.
/// Splits on non-alphanumeric chars (except hyphen), removes trivial stopwords,
/// and combines remaining tokens with AND for precision.
/// Returns None if no valid tokens (fall back to semantic-only).
fn sanitize_fts5_query(raw: &str) -> Option<String> {
    let tokens = tokenize_query_terms(raw);

    if tokens.is_empty() {
        None
    } else {
        Some(
            tokens
                .iter()
                .map(|token| {
                    if let Some(stem) = stemmed_token_prefix(token) {
                        format!("(\"{}\" OR {}*)", token, stem)
                    } else {
                        format!("\"{}\"", token)
                    }
                })
                .collect::<Vec<_>>()
                .join(" AND "),
        )
    }
}

struct Bm25Hit {
    document_id: String,
}

impl DocumentCacheStore {
    pub fn new(documents_folder: &Path) -> Result<Self, DocumentCacheError> {
        initialize_sqlite_vec_extension();
        std::fs::create_dir_all(documents_folder)?;

        let database_path = documents_folder.join(CACHE_DB_FILE_NAME);
        let connection = Connection::open(database_path)?;
        connection.execute_batch(CREATE_SCHEMA_SQL)?;

        let store = Self { connection };
        store.rebuild_fts_index_if_empty()?;
        Ok(store)
    }

    /// Ensure the FTS5 index is consistent with the documents table.
    ///
    /// On first run after migration (the FTS table was just created from schema), the
    /// FTS5 shadow data table has only its header block (count ≤ 1) while `documents`
    /// may already have rows. In that case, and whenever an integrity check fails, we
    /// rebuild the index from the content table using the FTS5 `'rebuild'` command.
    fn rebuild_fts_index_if_empty(&self) -> Result<(), DocumentCacheError> {
        let doc_count: i64 =
            self.connection
                .query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;

        if doc_count == 0 {
            return Ok(());
        }

        // `documents_fts_data` is the FTS5 B-tree data shadow table. It always has at
        // least 1 row (the averages block at id=1). Additional rows mean the index has
        // been populated. If it is ≤ 1 the index has never been built (migration path).
        let fts_data_count: i64 = self
            .connection
            .query_row("SELECT COUNT(*) FROM documents_fts_data", [], |row| {
                row.get(0)
            })
            .unwrap_or(0);

        if fts_data_count <= 1 {
            // Index has never been built — rebuild from content table.
            self.connection
                .execute_batch("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')")?;
            return Ok(());
        }

        // Index has data — run an integrity check and rebuild if it is inconsistent.
        // This recovers databases that were corrupted by a previous bad migration.
        let integrity_ok = self
            .connection
            .execute(
                "INSERT INTO documents_fts(documents_fts) VALUES('integrity-check')",
                [],
            )
            .is_ok();

        if !integrity_ok {
            self.connection
                .execute_batch("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')")?;
        }

        Ok(())
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
        // Do NOT touch documents_fts directly here. For a content FTS5 table,
        // directly deleting rows (`DELETE FROM documents_fts`) and then also
        // having the delete trigger fire per-row corrupts the shadow B-tree
        // (tombstones inserted into an already-empty index).
        // Instead, let the triggers run and then use `'rebuild'` at the end to
        // atomically reconstruct the FTS index from the content table.
        transaction.execute("DELETE FROM documents", [])?;

        for document in documents {
            Self::upsert_document_record(&transaction, document)?;
            Self::insert_document_tags(&transaction, document)?;
        }

        // Rebuild the FTS5 index from the content table inside the same transaction.
        // This discards any intermediate shadow-table state from the triggers above
        // and produces a clean, consistent index.
        transaction.execute(
            "INSERT INTO documents_fts(documents_fts) VALUES('rebuild')",
            [],
        )?;

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

    pub fn replace_document_chunk_embeddings(
        &mut self,
        document_id: &str,
        chunks: &[CachedDocumentChunkEmbeddingPayload],
    ) -> Result<(), DocumentCacheError> {
        for chunk in chunks {
            validate_embedding_vector(&chunk.vector)?;
        }

        let transaction = self.connection.transaction()?;
        // Delete old chunks — the trigger will cascade to the vec table.
        transaction.execute(
            "DELETE FROM document_chunk_embeddings_meta WHERE document_id = ?1",
            params![document_id],
        )?;

        for chunk in chunks {
            let chunk_index = i64::try_from(chunk.chunk_index)
                .map_err(|_| DocumentCacheError::Validation("chunk_index is too large".into()))?;
            transaction.execute(
                "INSERT INTO document_chunk_embeddings_meta
                   (document_id, chunk_index, chunk_text, content_hash, model, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &chunk.document_id,
                    chunk_index,
                    &chunk.chunk_text,
                    &chunk.content_hash,
                    &chunk.model,
                    &chunk.updated_at,
                ],
            )?;

            let meta_id = transaction.last_insert_rowid();
            let vector_bytes = f32_vector_to_le_bytes(&chunk.vector);
            transaction.execute(
                "INSERT INTO document_chunk_embeddings_vec (rowid, embedding)
                 VALUES (?1, vec_f32(?2))",
                params![meta_id, vector_bytes],
            )?;
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

    /// BM25 search via FTS5. Returns up to `limit` hits ordered by FTS5 rank (best first).
    fn bm25_search_documents(
        &self,
        query_text: &str,
        limit: usize,
        exclude_document_id: Option<&str>,
    ) -> Result<Vec<Bm25Hit>, DocumentCacheError> {
        let started = Instant::now();
        let fts_query = match sanitize_fts5_query(query_text) {
            Some(q) => q,
            None => {
                log::info!(
                    "[search-debug][bm25] query=\"{}\" produced no FTS tokens; skipping BM25 leg",
                    query_text
                );
                return Ok(Vec::new());
            }
        };

        let k = i64::try_from(limit).unwrap_or(i64::MAX);

        let mut statement = self.connection.prepare(
            "SELECT d.id
             FROM documents_fts
             JOIN documents d ON d.rowid = documents_fts.rowid
             WHERE documents_fts MATCH ?1
               AND (?2 IS NULL OR d.id != ?2)
             ORDER BY rank
             LIMIT ?3",
        )?;

        let rows = statement.query_map(params![&fts_query, exclude_document_id, k], |row| {
            row.get::<_, String>(0)
        })?;

        let mut hits = Vec::new();
        for row in rows {
            let document_id = row?;
            hits.push(Bm25Hit { document_id });
        }

        let top = hits
            .iter()
            .take(5)
            .map(|hit| hit.document_id.as_str())
            .collect::<Vec<_>>();
        log::info!(
            "[search-debug][bm25] query=\"{}\" fts={} limit={} exclude={:?} hits={} top={:?} elapsed_ms={}",
            query_text,
            fts_query,
            limit,
            exclude_document_id,
            hits.len(),
            top,
            started.elapsed().as_millis()
        );

        Ok(hits)
    }

    /// KNN search over document chunk embeddings, max-pooled to document level.
    /// Falls back to whole-document KNN if the chunk table is empty.
    fn chunk_knn_search(
        &self,
        query_vector: &[f32],
        limit: usize,
        min_score: f32,
        exclude_document_id: Option<&str>,
    ) -> Result<Vec<SemanticSearchHitPayload>, DocumentCacheError> {
        let started = Instant::now();
        // Check if chunk table has any rows.
        let chunk_count: i64 = self.connection.query_row(
            "SELECT COUNT(*) FROM document_chunk_embeddings_meta LIMIT 1",
            [],
            |row| row.get(0),
        )?;

        if chunk_count == 0 {
            // Fall back to whole-doc KNN.
            let hits = self.semantic_search_documents(
                query_vector.to_vec(),
                limit,
                min_score,
                exclude_document_id.map(str::to_owned),
            )?;
            let top = hits
                .iter()
                .take(5)
                .map(|hit| format!("{}:{:.3}", hit.document_id, hit.score))
                .collect::<Vec<_>>();
            log::info!(
                "[search-debug][semantic] chunk_count=0 fallback=whole-doc limit={} min_score={} hits={} top={:?} elapsed_ms={}",
                limit,
                min_score,
                hits.len(),
                top,
                started.elapsed().as_millis()
            );
            return Ok(hits);
        }

        let k = (limit * 4).max(1);
        let k = i64::try_from(k).unwrap_or(i64::MAX);
        let query_vector_bytes = f32_vector_to_le_bytes(query_vector);
        let bounded_min_score = min_score.clamp(-1.0, 1.0);

        let mut statement = self.connection.prepare(
            "SELECT m.document_id, MAX(1.0 - (v.distance * v.distance / 2.0)) as score
             FROM document_chunk_embeddings_vec v
             JOIN document_chunk_embeddings_meta m ON m.id = v.rowid
             WHERE v.embedding MATCH vec_f32(?1) AND k = ?2
               AND (?3 IS NULL OR m.document_id != ?3)
             GROUP BY m.document_id
             ORDER BY score DESC
             LIMIT ?4",
        )?;

        let limit_i64 = i64::try_from(limit).unwrap_or(i64::MAX);
        let rows = statement.query_map(
            params![query_vector_bytes, k, exclude_document_id, limit_i64],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?)),
        )?;

        let mut hits = Vec::new();
        for row in rows {
            let (document_id, score) = row?;
            if score >= bounded_min_score {
                hits.push(SemanticSearchHitPayload { document_id, score });
            }
        }

        let top = hits
            .iter()
            .take(5)
            .map(|hit| format!("{}:{:.3}", hit.document_id, hit.score))
            .collect::<Vec<_>>();
        log::info!(
            "[search-debug][semantic] chunk_count={} k={} limit={} min_score={} exclude={:?} hits={} top={:?} elapsed_ms={}",
            chunk_count,
            k,
            limit,
            bounded_min_score,
            exclude_document_id,
            hits.len(),
            top,
            started.elapsed().as_millis()
        );

        Ok(hits)
    }

    /// Hybrid search: BM25 + chunk KNN, combined with Reciprocal Rank Fusion.
    pub fn hybrid_search_documents(
        &self,
        query_vector: Vec<f32>,
        query_text: &str,
        limit: usize,
        min_score: f32,
        exclude_document_id: Option<String>,
        semantic_weight: f32,
        bm25_weight: f32,
    ) -> Result<Vec<HybridSearchHitPayload>, DocumentCacheError> {
        let started = Instant::now();
        if limit == 0 {
            return Ok(Vec::new());
        }

        validate_embedding_vector(&query_vector)?;

        let candidate_k = limit.saturating_mul(2).max(1);

        // BM25 leg
        let bm25_hits = if bm25_weight > 0.0 {
            self.bm25_search_documents(query_text, candidate_k, exclude_document_id.as_deref())?
        } else {
            Vec::new()
        };

        // Semantic/chunk KNN leg
        let semantic_hits = if semantic_weight > 0.0 {
            self.chunk_knn_search(
                &query_vector,
                candidate_k,
                min_score,
                exclude_document_id.as_deref(),
            )?
        } else {
            Vec::new()
        };

        // Collect all candidate document IDs
        let mut all_doc_ids: Vec<String> = Vec::new();
        let mut seen_ids: HashSet<String> = HashSet::new();

        for hit in &semantic_hits {
            if seen_ids.insert(hit.document_id.clone()) {
                all_doc_ids.push(hit.document_id.clone());
            }
        }
        for hit in &bm25_hits {
            if seen_ids.insert(hit.document_id.clone()) {
                all_doc_ids.push(hit.document_id.clone());
            }
        }

        if all_doc_ids.is_empty() {
            log::info!(
                "[search-debug][hybrid] query=\"{}\" limit={} min_score={} semantic_weight={} bm25_weight={} bm25_hits={} semantic_hits={} candidates=0 elapsed_ms={}",
                query_text,
                limit,
                min_score,
                semantic_weight,
                bm25_weight,
                bm25_hits.len(),
                semantic_hits.len(),
                started.elapsed().as_millis()
            );
            return Ok(Vec::new());
        }

        // Fetch titles for all candidate docs in one query (for title boosting)
        let title_map = self.fetch_titles_for_ids(&all_doc_ids)?;

        // Build rank maps
        let semantic_rank: HashMap<&str, usize> = semantic_hits
            .iter()
            .enumerate()
            .map(|(i, h)| (h.document_id.as_str(), i))
            .collect();
        let bm25_rank: HashMap<&str, usize> = bm25_hits
            .iter()
            .enumerate()
            .map(|(i, h)| (h.document_id.as_str(), i))
            .collect();

        // Query tokens for title boost (token-exact; excludes stopwords).
        let query_tokens: HashSet<String> = tokenize_query_terms(query_text).into_iter().collect();
        let semantic_score_map: HashMap<&str, f32> = semantic_hits
            .iter()
            .map(|hit| (hit.document_id.as_str(), hit.score))
            .collect();
        let bounded_min_score = min_score.clamp(-1.0, 1.0);
        let semantic_floor = bounded_min_score.max(0.15);

        // RRF scoring
        const RRF_K: f32 = 60.0;
        let mut dropped_semantic_only = 0_usize;
        let mut results: Vec<HybridSearchHitPayload> = Vec::with_capacity(all_doc_ids.len());
        for doc_id in &all_doc_ids {
            let has_bm25 = bm25_rank.contains_key(doc_id.as_str());
            let semantic_raw_score = semantic_score_map.get(doc_id.as_str()).copied();
            let semantic_passes_floor = semantic_raw_score
                .map(|score| score >= semantic_floor)
                .unwrap_or(false);

            // Avoid flooding results with low-confidence semantic-only hits.
            if semantic_weight > 0.0 && !has_bm25 && !semantic_passes_floor {
                dropped_semantic_only += 1;
                continue;
            }

            let sem_score = semantic_rank
                .get(doc_id.as_str())
                .map(|&rank| semantic_weight / (RRF_K + rank as f32))
                .unwrap_or(0.0);

            let bm25_score = bm25_rank
                .get(doc_id.as_str())
                .map(|&rank| bm25_weight / (RRF_K + rank as f32))
                .unwrap_or(0.0);

            let mut score = sem_score + bm25_score;

            // Title boost: only for exact term overlap, with a small additive value.
            if !query_tokens.is_empty() {
                let has_title_overlap = title_map
                    .get(doc_id.as_str())
                    .map(|title| {
                        tokenize_query_terms(title)
                            .into_iter()
                            .any(|title_token| query_tokens.contains(&title_token))
                    })
                    .unwrap_or(false);
                if has_title_overlap {
                    score += 0.015;
                }
            }

            results.push(HybridSearchHitPayload {
                document_id: doc_id.clone(),
                score,
            });
        }

        results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(Ordering::Equal)
                .then_with(|| a.document_id.cmp(&b.document_id))
        });
        results.truncate(limit);

        let bm25_top = bm25_hits
            .iter()
            .take(5)
            .map(|hit| hit.document_id.as_str())
            .collect::<Vec<_>>();
        let semantic_top = semantic_hits
            .iter()
            .take(5)
            .map(|hit| format!("{}:{:.3}", hit.document_id, hit.score))
            .collect::<Vec<_>>();
        let result_top = results
            .iter()
            .take(5)
            .map(|hit| format!("{}:{:.4}", hit.document_id, hit.score))
            .collect::<Vec<_>>();
        log::info!(
            "[search-debug][hybrid] query=\"{}\" limit={} candidate_k={} min_score={} semantic_weight={} bm25_weight={} bm25_hits={} semantic_hits={} candidates={} dropped_semantic_only={} final_hits={} bm25_top={:?} semantic_top={:?} final_top={:?} elapsed_ms={}",
            query_text,
            limit,
            candidate_k,
            min_score,
            semantic_weight,
            bm25_weight,
            bm25_hits.len(),
            semantic_hits.len(),
            all_doc_ids.len(),
            dropped_semantic_only,
            results.len(),
            bm25_top,
            semantic_top,
            result_top,
            started.elapsed().as_millis()
        );

        Ok(results)
    }

    /// Fetch title strings for a list of document IDs in one query.
    fn fetch_titles_for_ids(
        &self,
        ids: &[String],
    ) -> Result<HashMap<String, String>, DocumentCacheError> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }

        // Build a parameterized IN clause.
        let placeholders: String = ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT id, title FROM documents WHERE id IN ({})",
            placeholders
        );

        let mut statement = self.connection.prepare(&sql)?;
        let params_vec: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        let rows = statement.query_map(params_vec.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut map = HashMap::new();
        for row in rows {
            let (id, title) = row?;
            map.insert(id, title);
        }

        Ok(map)
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
        let thread_id = format!("{:?}", std::thread::current().id())
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect::<String>();
        std::env::temp_dir().join(format!("tentacle-cache-test-{timestamp}-{thread_id}"))
    }

    #[test]
    fn initializes_vec_schema_and_executes_embedding_search() {
        let temp_dir = unique_temp_path();

        {
            let mut store =
                DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");

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
                .semantic_search_documents(vec![1.0; EMBEDDING_VECTOR_DIMENSIONS], 1, 0.0, None)
                .expect("semantic search should succeed");

            assert_eq!(hits.len(), 1);
            assert_eq!(hits[0].document_id, document.id);
        }

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn hybrid_search_returns_results() {
        let temp_dir = unique_temp_path();

        {
            let mut store =
                DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");

            let document = CachedDocumentPayload {
                id: "doc-hybrid-1".to_string(),
                user_id: "user-1".to_string(),
                title: "OAuth Authentication Guide".to_string(),
                body: "This document explains OAuth 2.0 authentication flows.".to_string(),
                banner_image_url: None,
                deleted_at: None,
                created_at: "2026-02-13T00:00:00Z".to_string(),
                updated_at: "2026-02-13T00:00:00Z".to_string(),
                tags: vec![],
            };
            store
                .upsert_document(&document)
                .expect("upsert should succeed");

            let embedding = CachedDocumentEmbeddingPayload {
                document_id: document.id.clone(),
                model: "test-model".to_string(),
                content_hash: "hash1".to_string(),
                vector: vec![0.5; EMBEDDING_VECTOR_DIMENSIONS],
                updated_at: "2026-02-13T00:00:00Z".to_string(),
            };
            store
                .upsert_document_embedding(&embedding)
                .expect("embedding upsert should succeed");

            let hits = store
                .hybrid_search_documents(
                    vec![0.5; EMBEDDING_VECTOR_DIMENSIONS],
                    "OAuth",
                    5,
                    0.0,
                    None,
                    0.5,
                    0.5,
                )
                .expect("hybrid search should succeed");

            assert!(!hits.is_empty(), "expected at least one hybrid search hit");
            assert_eq!(hits[0].document_id, document.id);
        }

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn hybrid_search_supports_bm25_only_mode_when_semantic_weight_is_zero() {
        let temp_dir = unique_temp_path();

        {
            let mut store =
                DocumentCacheStore::new(&temp_dir).expect("cache store should initialize");
            let document = CachedDocumentPayload {
                id: "doc-bm25-only".to_string(),
                user_id: "user-1".to_string(),
                title: "OAuth Authentication Guide".to_string(),
                body: "This note explains OAuth login best practices.".to_string(),
                banner_image_url: None,
                deleted_at: None,
                created_at: "2026-02-13T00:00:00Z".to_string(),
                updated_at: "2026-02-13T00:00:00Z".to_string(),
                tags: vec![],
            };
            store
                .upsert_document(&document)
                .expect("upsert should succeed");

            let hits = store
                .hybrid_search_documents(
                    vec![0.0; EMBEDDING_VECTOR_DIMENSIONS],
                    "OAuth",
                    5,
                    0.0,
                    None,
                    0.0,
                    1.0,
                )
                .expect("hybrid search should succeed in bm25-only mode");

            assert!(
                !hits.is_empty(),
                "expected at least one BM25-only hybrid search hit"
            );
            assert_eq!(hits[0].document_id, document.id);
        }

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn sanitize_fts5_query_basic() {
        assert_eq!(
            sanitize_fts5_query("OAuth API"),
            Some("\"oauth\" AND \"api\"".to_string())
        );
        assert_eq!(sanitize_fts5_query("a"), None); // single char token filtered
        assert_eq!(
            sanitize_fts5_query("machine learning"),
            Some("\"machine\" AND (\"learning\" OR learn*)".to_string())
        );
        assert_eq!(
            sanitize_fts5_query("how to use the api"),
            Some("\"use\" AND \"api\"".to_string())
        );
        assert_eq!(
            sanitize_fts5_query("Herbal"),
            Some("(\"herbal\" OR herb*)".to_string())
        );
    }
}
