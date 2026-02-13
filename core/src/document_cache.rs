use std::collections::{HashMap, HashSet};
use std::path::Path;

use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const CACHE_DB_FILE_NAME: &str = ".document-data.db";

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

pub struct DocumentCacheStore {
    connection: Connection,
}

impl DocumentCacheStore {
    pub fn new(documents_folder: &Path) -> Result<Self, DocumentCacheError> {
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

#[derive(Debug, Error)]
pub enum DocumentCacheError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
