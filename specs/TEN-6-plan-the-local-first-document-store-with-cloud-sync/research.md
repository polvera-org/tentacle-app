# TEN-6: Local-First Document Store with Cloud Sync - Research

**Issue**: [TEN-6](https://linear.app/tentacle-app/issue/TEN-6/plan-the-local-first-document-store-with-cloud-sync)
**Priority**: High
**Date**: 2026-02-11

## Executive Summary

This document outlines research findings and recommendations for implementing a local-first architecture for Tentacle, allowing users to work offline without authentication while maintaining optional cloud sync capabilities. The solution combines markdown files in a user-chosen folder with SQLite for metadata/tags, leveraging Tauri's Rust backend for file system operations.

### Key Decisions from User Input

1. **Storage Location**: User-chosen folder (Obsidian-style) for maximum flexibility and cloud storage integration
2. **Authentication**: All features work without login (fully local-first)
3. **Sync Strategy**: Merge local and cloud notes with conflict resolution UI when users log in
4. **AI Approach**: BYOK (Bring Your Own Key) with single OpenAI API key for Whisper and embeddings
   - Simplifies implementation significantly
   - User provides their own OpenAI API key in settings
   - Local models marked as "Coming Soon" for future offline capability

## Current State Analysis

### Existing Architecture

**Frontend Stack**:
- Next.js 16 + TypeScript + Tailwind CSS
- Tiptap rich text editor (stores content as JSON)
- Tauri v2 desktop wrapper
- React components for document management

**Current Data Flow**:
```
User → Frontend (React/Next.js) → Supabase Client → Supabase Cloud
         ↓
    Tiptap Editor (JSON content)
```

**Current Database Schema** (Supabase PostgreSQL):
```sql
documents:
  - id (UUID, PK)
  - user_id (UUID, FK to auth.users) -- Required, blocks unauthenticated use
  - title (TEXT)
  - body (TEXT) -- Tiptap JSON stored as text
  - banner_image_url (TEXT)
  - deleted_at (TIMESTAMP) -- Soft delete
  - created_at (TIMESTAMP)
  - updated_at (TIMESTAMP)

document_tags:
  - id (UUID, PK)
  - document_id (UUID, FK)
  - tag (TEXT)
  - created_at (TIMESTAMP)
```

**Current Limitations**:
1. ❌ Requires authentication (user_id is NOT NULL)
2. ❌ No offline document storage
3. ❌ Data locked in Supabase cloud
4. ❌ No direct filesystem access
5. ❌ No RAG/semantic search
6. ❌ Whisper API key hardcoded in backend (security issue)

### Existing Tauri Setup

**Current Rust Backend** (`frontend/src-tauri/`):
- Basic Tauri app shell with logging and shell plugins
- No database or filesystem operations yet
- Ready for extension with commands

**Dependencies** (Cargo.toml):
```toml
tauri = "2.10.0"
tauri-plugin-log = "2"
tauri-plugin-shell = "2"
```

## Local-First Architecture Research

### Core Principles

Local-first software prioritizes local device storage and operation, with cloud sync as an enhancement rather than a requirement. Key benefits:

1. **Offline Storage**: Documents stored locally as markdown files (AI features require internet)
2. **Data Ownership**: Users control their data and API keys
3. **Privacy**: Documents never leave device unless explicitly synced
4. **Speed**: Fast local file access and SQLite queries
5. **Resilience**: Document CRUD works during outages (AI features require connection)
6. **Interoperability**: Standard formats (markdown, SQLite)

### Industry Examples

**Obsidian's Approach**:
- Markdown files in user-chosen vault directory
- `.obsidian/` folder for app metadata (cache, settings, workspace)
- Optional paid sync service ($8/month)
- Works perfectly with Dropbox/iCloud/Git

**Notable Transitions**:
- Obsidian initially used pure filesystem, later added SQLite for performance
- Maintains both markdown (source of truth) and SQLite (index/cache)
- This hybrid approach balances interoperability with performance

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Document Folder                   │
│                  (e.g., ~/Documents/Tentacle)                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  document-1.md                                               │
│  document-2.md                                               │
│  subfolder/                                                  │
│    document-3.md                                             │
│                                                               │
│  .tentacle/                    ← App metadata directory      │
│    ├── index.db                ← SQLite database             │
│    ├── embeddings.db           ← Vector embeddings cache    │
│    ├── settings.json           ← App settings                │
│    └── sync-state.json         ← Cloud sync metadata        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Why This Hybrid Approach?**

| Aspect | Markdown Files | SQLite Database |
|--------|---------------|-----------------|
| **Source of Truth** | ✅ Yes | ❌ No (cache/index) |
| **Human Readable** | ✅ Yes | ❌ No |
| **Version Control** | ✅ Git-friendly | ⚠️ Binary |
| **Interoperability** | ✅ Any editor | ❌ App-specific |
| **Fast Queries** | ❌ Requires scanning | ✅ Indexed |
| **Metadata/Tags** | ⚠️ Frontmatter | ✅ Normalized |
| **Full-Text Search** | ❌ Slow | ✅ FTS5 |
| **Vector Embeddings** | ❌ Not suitable | ✅ Optimized |

## Technical Implementation Strategy

### 1. File System Structure

**Document Files** (Markdown with Frontmatter):
```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
title: Meeting Notes
tags: [work, meeting]
created: 2026-02-11T10:30:00Z
updated: 2026-02-11T14:25:00Z
deleted: false
banner_image: ./assets/banner.jpg
sync_status: synced
last_sync: 2026-02-11T14:25:00Z
---

# Meeting Notes

Document content goes here...
```

**Benefits**:
- Markdown is readable/editable in any text editor
- Frontmatter holds metadata (YAML format)
- Git-friendly for version control
- Compatible with Obsidian, Notion import/export

### 2. SQLite Schema Design

**Purpose**: Index, cache, and fast querying. NOT the source of truth.

```sql
-- Core documents table (cache of filesystem)
CREATE TABLE documents (
  id TEXT PRIMARY KEY,           -- UUID from markdown frontmatter
  file_path TEXT UNIQUE NOT NULL, -- Relative path from vault root
  title TEXT NOT NULL,
  body_preview TEXT,             -- First 500 chars for fast display
  banner_image_path TEXT,
  deleted INTEGER DEFAULT 0,     -- Boolean: 0 = active, 1 = deleted
  created_at TEXT NOT NULL,      -- ISO 8601 timestamp
  updated_at TEXT NOT NULL,
  file_modified_at TEXT NOT NULL, -- Filesystem mtime for sync detection
  word_count INTEGER DEFAULT 0,
  char_count INTEGER DEFAULT 0,

  -- Cloud sync metadata (NULL for local-only)
  user_id TEXT,                  -- Supabase user ID (NULL if not logged in)
  cloud_id TEXT,                 -- Cloud database ID (NULL if never synced)
  sync_status TEXT DEFAULT 'local', -- local|synced|conflict|pending
  last_synced_at TEXT,           -- Last successful cloud sync

  -- FTS virtual table reference
  FOREIGN KEY (id) REFERENCES documents_fts(rowid)
);

-- Full-text search
CREATE VIRTUAL TABLE documents_fts USING fts5(
  title,
  body,
  content='documents',
  content_rowid='id'
);

-- Tags (normalized many-to-many)
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE document_tags (
  document_id TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (document_id, tag_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Vector embeddings for RAG
CREATE TABLE document_embeddings (
  document_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,       -- Serialized float32 vector
  model_version TEXT NOT NULL,   -- e.g., "nomic-embed-text-v1.5"
  chunk_index INTEGER DEFAULT 0, -- For long documents split into chunks
  generated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- File system watch metadata
CREATE TABLE fs_watch_state (
  file_path TEXT PRIMARY KEY,
  last_event TEXT NOT NULL,      -- created|modified|deleted
  last_event_time TEXT NOT NULL,
  processed INTEGER DEFAULT 0    -- Boolean: has been processed
);

-- Conflict resolution queue
CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  local_file_path TEXT NOT NULL,
  local_version TEXT NOT NULL,   -- JSON snapshot of local state
  cloud_version TEXT NOT NULL,   -- JSON snapshot of cloud state
  conflict_detected_at TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  resolution_strategy TEXT,      -- manual|take_local|take_cloud|merge
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_documents_updated ON documents(updated_at DESC);
CREATE INDEX idx_documents_user_id ON documents(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_documents_sync_status ON documents(sync_status);
CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);
CREATE INDEX idx_fs_watch_unprocessed ON fs_watch_state(processed) WHERE processed = 0;
```

### 3. Tauri Rust Backend Implementation

**Required Crates** (add to Cargo.toml):
```toml
[dependencies]
# Existing
tauri = "2.10.0"
tauri-plugin-log = "2"
tauri-plugin-shell = "2"

# New dependencies
sqlx = { version = "0.7", features = ["sqlite", "runtime-tokio-rustls"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
uuid = { version = "1.6", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
notify = "6.1"  # File system watcher
gray_matter = "0.2"  # Frontmatter parsing
pulldown-cmark = "0.9"  # Markdown parsing
walkdir = "2.4"  # Directory traversal

# OpenAI API integration
reqwest = { version = "0.11", features = ["json", "multipart"] }

# Optional for future: keyring for secure API key storage
keyring = "2.0"  # OS keychain integration
```

**Key Tauri Commands** (Rust → TypeScript bridge):

```rust
// File system operations
#[tauri::command]
async fn select_vault_folder() -> Result<String, String>

#[tauri::command]
async fn scan_vault(vault_path: String) -> Result<Vec<Document>, String>

#[tauri::command]
async fn read_document(file_path: String) -> Result<Document, String>

#[tauri::command]
async fn write_document(doc: Document) -> Result<(), String>

#[tauri::command]
async fn delete_document(file_path: String) -> Result<(), String>

// SQLite operations
#[tauri::command]
async fn search_documents(query: String) -> Result<Vec<Document>, String>

#[tauri::command]
async fn get_documents_by_tag(tag: String) -> Result<Vec<Document>, String>

#[tauri::command]
async fn update_document_index(file_path: String) -> Result<(), String>

// File watching
#[tauri::command]
async fn start_vault_watch(vault_path: String) -> Result<(), String>

#[tauri::command]
async fn stop_vault_watch() -> Result<(), String>

// RAG operations
#[tauri::command]
async fn generate_embeddings(document_id: String) -> Result<(), String>

#[tauri::command]
async fn semantic_search(query: String, limit: usize) -> Result<Vec<Document>, String>

// Sync operations
#[tauri::command]
async fn sync_with_cloud() -> Result<SyncResult, String>

#[tauri::command]
async fn resolve_conflict(conflict_id: i64, strategy: String) -> Result<(), String>
```

**File System Watcher Pattern**:

```rust
use notify::{Watcher, RecursiveMode, Event};
use std::sync::mpsc::channel;

pub fn watch_vault(vault_path: &str, db: Arc<Mutex<SqliteConnection>>) {
    let (tx, rx) = channel();

    let mut watcher = notify::recommended_watcher(tx).unwrap();
    watcher.watch(Path::new(vault_path), RecursiveMode::Recursive).unwrap();

    tokio::spawn(async move {
        for res in rx {
            match res {
                Ok(Event { kind, paths, .. }) => {
                    for path in paths {
                        if path.extension() == Some(OsStr::new("md")) {
                            // Update SQLite index
                            update_document_index(&path, &db).await;

                            // Emit event to frontend
                            emit_document_changed(&path);
                        }
                    }
                }
                Err(e) => eprintln!("watch error: {:?}", e),
            }
        }
    });
}
```

### 4. Document Operations Flow

**Creating a New Document**:
```
1. User clicks "New Document" in UI
2. Frontend calls Tauri command: create_document({ title })
3. Rust backend:
   a. Generate UUID
   b. Create markdown file in vault with frontmatter
   c. Insert metadata into SQLite
   d. Return document to frontend
4. Frontend opens editor with new document
```

**Reading a Document**:
```
1. User selects document from list (loaded from SQLite query)
2. Frontend calls: read_document(file_path)
3. Rust backend:
   a. Read markdown file from filesystem
   b. Parse frontmatter and body
   c. Return Document struct
4. Frontend displays in Tiptap editor
```

**Auto-Save on Edit**:
```
1. User types in editor (debounced, e.g., 1 second)
2. Frontend calls: write_document(document)
3. Rust backend:
   a. Update markdown file on filesystem
   b. Update updated_at in frontmatter
   c. Update SQLite cache
   d. Mark as needs_embedding if body changed significantly
4. File watcher detects change (no-op since initiated by app)
```

**Deletion (Soft Delete)**:
```
1. User clicks delete button
2. Frontend calls: delete_document(file_path)
3. Rust backend:
   a. Set deleted: true in markdown frontmatter
   b. Set deleted = 1 in SQLite
   c. Move file to .tentacle/trash/ folder (optional)
4. Document hidden from UI lists
```

### 5. Search and Query Performance

**Full-Text Search** (using SQLite FTS5):
```sql
-- Search titles and body content
SELECT d.*
FROM documents d
JOIN documents_fts fts ON d.id = fts.rowid
WHERE documents_fts MATCH 'search query'
  AND d.deleted = 0
ORDER BY fts.rank
LIMIT 50;
```

**Tag-Based Filtering**:
```sql
SELECT d.*
FROM documents d
JOIN document_tags dt ON d.id = dt.document_id
JOIN tags t ON dt.tag_id = t.id
WHERE t.name = 'work'
  AND d.deleted = 0
ORDER BY d.updated_at DESC;
```

**Performance Considerations**:
- SQLite FTS5 is extremely fast (microseconds for typical queries)
- Keep body_preview in documents table for list views (avoid reading files)
- Index on updated_at DESC for chronological views
- Lazy-load full body content only when document is opened

## AI Features: BYOK Approach

### Recommended Approach: OpenAI API with User's Key

To simplify implementation, we'll use OpenAI's API for both embeddings and transcription. Users provide their own API key.

### Why BYOK?

**Benefits**:
1. **Simpler Implementation**: No model download/management, no ONNX runtime
2. **Better Quality**: OpenAI models are state-of-the-art
3. **No Storage**: No large model files (~200MB+) to download
4. **User Control**: Users manage their own API costs and usage
5. **Faster MVP**: Can ship features much quicker

**Trade-offs**:
- Requires internet connection for AI features
- API costs (though minimal: ~$0.0001/doc for embeddings, ~$0.006/min for Whisper)
- Data sent to OpenAI (documents for embeddings, audio for transcription)

**Future**: Local models marked as "Coming Soon" for offline capability

### OpenAI API Integration

**Embedding Model**: `text-embedding-3-small`
- 1536 dimensions
- $0.02 / 1M tokens (~$0.0001 per document)
- High quality semantic search
- Fast API response (~100-200ms)

**Transcription Model**: `whisper-1`
- Same model as local Whisper
- $0.006 / minute of audio
- Supports 50+ languages
- Fast transcription (~10s for 1min audio)

### Implementation with OpenAI API

**Required Crate**:
```toml
[dependencies]
reqwest = { version = "0.11", features = ["json"] }
```

**Rust Integration**:
```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct EmbeddingRequest {
    input: String,
    model: String,
}

#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

pub async fn generate_embedding(
    text: &str,
    api_key: &str,
) -> Result<Vec<f32>, String> {
    let client = reqwest::Client::new();

    let request = EmbeddingRequest {
        input: text.to_string(),
        model: "text-embedding-3-small".to_string(),
    };

    let response = client
        .post("https://api.openai.com/v1/embeddings")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let embedding_response: EmbeddingResponse = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(embedding_response.data[0].embedding.clone())
}
```

**Semantic Search**:
```rust
#[tauri::command]
async fn semantic_search(
    query: String,
    limit: usize,
    db: State<'_, DatabaseState>,
    settings: State<'_, AppSettings>,
) -> Result<Vec<Document>, String> {
    // Get API key from settings
    let api_key = settings.openai_api_key
        .as_ref()
        .ok_or("OpenAI API key not configured")?;

    // Generate query embedding using OpenAI API
    let query_embedding = generate_embedding(&query, api_key)
        .await
        .map_err(|e| e.to_string())?;

    // Cosine similarity search in SQLite
    let docs = sqlx::query_as!(
        Document,
        r#"
        SELECT d.*
        FROM documents d
        JOIN document_embeddings e ON d.id = e.document_id
        WHERE d.deleted = 0
        ORDER BY cosine_similarity(e.embedding, $1) DESC
        LIMIT $2
        "#,
        query_embedding,
        limit
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(docs)
}
```

**Cosine Similarity UDF** (SQLite extension):
```rust
// Register custom SQL function
fn register_cosine_similarity(conn: &Connection) -> Result<()> {
    conn.create_scalar_function(
        "cosine_similarity",
        2,
        FunctionFlags::DETERMINISTIC,
        |ctx| {
            let vec1: Vec<f32> = ctx.get(0)?;
            let vec2: Vec<f32> = ctx.get(1)?;

            let dot: f32 = vec1.iter().zip(&vec2).map(|(a, b)| a * b).sum();
            let mag1: f32 = vec1.iter().map(|x| x * x).sum::<f32>().sqrt();
            let mag2: f32 = vec2.iter().map(|x| x * x).sum::<f32>().sqrt();

            Ok(dot / (mag1 * mag2))
        },
    )
}
```

### Embedding Generation Strategy

**When to Generate Embeddings**:
1. On document creation (background task)
2. On significant edit (>50% content change)
3. Batch generation: "Reindex All Documents" button in settings
4. Lazy generation: Generate on-demand if missing during semantic search

**Chunking for Long Documents**:
```rust
pub fn chunk_document(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut chunks = Vec::new();

    for i in (0..words.len()).step_by(chunk_size - overlap) {
        let end = (i + chunk_size).min(words.len());
        chunks.push(words[i..end].join(" "));
    }

    chunks
}

// Generate embeddings for each chunk via OpenAI API
for (i, chunk) in chunk_document(&doc.body, 512, 50).enumerate() {
    let embedding = generate_embedding(&chunk, api_key).await?;

    sqlx::query!(
        "INSERT INTO document_embeddings (document_id, embedding, chunk_index, model_version, generated_at)
         VALUES (?, ?, ?, ?, ?)",
        doc.id,
        embedding,
        i,
        "text-embedding-3-small",
        Utc::now().to_rfc3339()
    )
    .execute(&db)
    .await?;
}
```

### Performance Characteristics

| Operation | Time | Cost | Notes |
|-----------|------|------|-------|
| Embed 500 words | ~100-200ms | $0.0001 | API call + network |
| Embed 1000 docs | ~3-5 min | $0.10 | Batch with rate limiting |
| Semantic search | ~150ms | $0.0001 | Query embedding + DB search |

**Cost Estimates** (for typical usage):
- 100 documents/month: ~$0.01
- 1000 documents/month: ~$0.10
- 10,000 documents/month: ~$1.00

**Optimization**:
- Batch API requests where possible
- Cache embeddings in SQLite (never regenerate unless content changes significantly)
- Show progress bar for batch reindexing
- Rate limit to avoid API throttling

## Whisper Transcription via OpenAI API

### Architecture

Use OpenAI's Whisper API with user-provided API key. This is the same Whisper model that would run locally, but hosted by OpenAI.

### Implementation with OpenAI API

**Rust Command**:
```rust
use reqwest::multipart;
use std::fs::File;
use std::io::Read;

#[derive(Deserialize)]
struct TranscriptionResponse {
    text: String,
}

#[tauri::command]
async fn transcribe_audio(
    audio_path: String,
    settings: State<'_, AppSettings>,
) -> Result<String, String> {
    // Get API key from settings
    let api_key = settings.openai_api_key
        .as_ref()
        .ok_or("OpenAI API key not configured")?;

    // Read audio file
    let mut file = File::open(&audio_path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;

    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;

    // Create multipart form
    let part = multipart::Part::bytes(buffer)
        .file_name("audio.mp3")
        .mime_str("audio/mpeg")
        .map_err(|e| e.to_string())?;

    let form = multipart::Form::new()
        .part("file", part)
        .text("model", "whisper-1")
        .text("response_format", "json");

    // Send to OpenAI API
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    // Parse response
    let transcription: TranscriptionResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(transcription.text)
}
```

### API Configuration

**Settings Storage**:
```rust
pub struct AppSettings {
    pub openai_api_key: Option<String>,
    pub whisper_language: String,  // Default: "en"
}
```

**API Key Security**:
- Store in OS keychain (not plain text config)
- Use Tauri's secure storage or keyring crate
- Never log or expose in error messages

### Performance & Cost

| Audio Length | Transcription Time | Cost |
|--------------|-------------------|------|
| 30 seconds | ~3-5s | $0.003 |
| 1 minute | ~5-10s | $0.006 |
| 5 minutes | ~15-30s | $0.030 |
| 30 minutes | ~1-2 min | $0.180 |

**Typical Usage Costs**:
- 10 voice notes/day (2 min each): ~$3.60/month
- 50 voice notes/day (2 min each): ~$18/month

## Cloud Sync Strategy

### Sync Architecture

**Three-State System**:
1. **Local-Only**: User not logged in, all data stays local
2. **Hybrid**: User logged in, local data + cloud sync
3. **Cloud-Primary**: Future paid tier with server-side RAG

**Sync Status per Document**:
- `local`: Never synced, exists only locally
- `synced`: Local and cloud are in sync
- `pending`: Local changes not yet synced to cloud
- `conflict`: Local and cloud versions diverged

### Conflict Resolution Strategy

Based on user preference: "Merge with conflict resolution UI"

**Conflict Detection**:
```rust
pub enum ConflictType {
    BothModified,      // User edited locally and on another device
    DeletedLocally,    // Deleted locally but modified on cloud
    DeletedOnCloud,    // Deleted on cloud but modified locally
}

pub fn detect_conflicts(
    local_doc: &Document,
    cloud_doc: &Document,
) -> Option<ConflictType> {
    if local_doc.deleted && cloud_doc.updated_at > local_doc.last_synced_at {
        Some(ConflictType::DeletedLocally)
    } else if cloud_doc.deleted_at.is_some() && local_doc.updated_at > local_doc.last_synced_at {
        Some(ConflictType::DeletedOnCloud)
    } else if local_doc.updated_at > local_doc.last_synced_at &&
              cloud_doc.updated_at > local_doc.last_synced_at {
        Some(ConflictType::BothModified)
    } else {
        None
    }
}
```

**Conflict Resolution UI**:
```typescript
interface ConflictResolutionModal {
  document: Document
  localVersion: DocumentVersion
  cloudVersion: DocumentVersion

  // User actions
  actions: {
    takeLocal: () => void      // Overwrite cloud with local
    takeCloud: () => void      // Overwrite local with cloud
    merge: () => void          // Open side-by-side merge UI
    keepBoth: () => void       // Create "Document (Conflict)" copy
  }
}
```

**Side-by-Side Merge UI** (like Git conflict resolution):
```
┌─────────────────────┬─────────────────────┐
│    Local Version    │    Cloud Version    │
├─────────────────────┼─────────────────────┤
│ # Meeting Notes     │ # Meeting Notes     │
│                     │                     │
│ Updated: 2:30 PM    │ Updated: 3:15 PM    │
│                     │                     │
│ Action items:       │ Action items:       │
│ - Task A            │ - Task A            │
│ - Task B ←          │ - Task B            │
│                     │ - Task C ←          │
│ - Task D ←          │ - Task D            │
└─────────────────────┴─────────────────────┘
         ↓                      ↓
            [Use Local] [Use Cloud]
           [Pick Changes] [Keep Both]
```

### Sync Implementation

**Sync Algorithm**:
```rust
#[tauri::command]
async fn sync_with_cloud(
    db: State<'_, DatabaseState>,
    supabase: State<'_, SupabaseClient>,
) -> Result<SyncResult, String> {
    let mut result = SyncResult::default();

    // 1. Get all local documents
    let local_docs = get_all_documents(&db).await?;

    // 2. Fetch cloud documents for this user
    let cloud_docs = supabase.fetch_user_documents().await?;

    // 3. Build lookup maps
    let local_map: HashMap<String, Document> = local_docs.into_iter()
        .map(|d| (d.id.clone(), d))
        .collect();
    let cloud_map: HashMap<String, Document> = cloud_docs.into_iter()
        .map(|d| (d.id.clone(), d))
        .collect();

    // 4. Detect changes
    for (id, local_doc) in &local_map {
        match cloud_map.get(id) {
            None => {
                // New local document → upload to cloud
                supabase.upload_document(local_doc).await?;
                result.uploaded += 1;
            }
            Some(cloud_doc) => {
                // Check for conflicts
                if let Some(conflict) = detect_conflicts(local_doc, cloud_doc) {
                    // Save to conflict resolution queue
                    save_conflict(&db, id, conflict, local_doc, cloud_doc).await?;
                    result.conflicts.push(id.clone());
                } else if local_doc.updated_at > local_doc.last_synced_at {
                    // Local is newer → upload
                    supabase.update_document(local_doc).await?;
                    result.uploaded += 1;
                } else if cloud_doc.updated_at > local_doc.updated_at {
                    // Cloud is newer → download
                    download_and_save_document(&db, cloud_doc).await?;
                    result.downloaded += 1;
                }
            }
        }
    }

    // 5. Download new cloud documents
    for (id, cloud_doc) in &cloud_map {
        if !local_map.contains_key(id) {
            download_and_save_document(&db, cloud_doc).await?;
            result.downloaded += 1;
        }
    }

    Ok(result)
}
```

**Incremental Sync** (for better performance):
```rust
// Track last sync time
let last_sync = get_last_sync_time(&db).await?;

// Only fetch documents modified since last sync
let changed_cloud_docs = supabase
    .fetch_documents_since(last_sync)
    .await?;

// Reduces API calls and bandwidth
```

### Supabase Integration

**Keep Existing Schema**, but make `user_id` nullable:
```sql
-- Modify existing table
ALTER TABLE documents
ALTER COLUMN user_id DROP NOT NULL;

-- Add sync columns
ALTER TABLE documents
ADD COLUMN sync_status TEXT DEFAULT 'local',
ADD COLUMN last_synced_at TIMESTAMP WITH TIME ZONE;

-- Index for sync queries
CREATE INDEX idx_documents_sync
  ON documents(user_id, updated_at DESC)
  WHERE user_id IS NOT NULL;
```

**Hybrid Local + Cloud Storage**:
- Documents without `user_id` are local-only
- Documents with `user_id` sync to cloud
- Cloud acts as backup + multi-device sync, not source of truth
- Local markdown files always take precedence

## Settings UI Architecture

### Settings Modal Design

**Settings Icon Placement**:
- Header of /app page (top-right corner)
- Opens modal overlay

**Settings Categories**:

```typescript
interface AppSettings {
  storage: {
    vaultPath: string          // Selected document folder
    autoBackup: boolean        // Auto-backup to .tentacle/backups/
    maxBackups: number         // Keep last N backups
  }

  editor: {
    theme: 'light' | 'dark' | 'auto'
    fontSize: number           // 12-20
    fontFamily: string         // System default, monospace, serif
    spellCheck: boolean
    autoSave: boolean
    autoSaveDelay: number      // Milliseconds
  }

  ai: {
    // OpenAI API Key (BYOK)
    openaiApiKey: string       // User's OpenAI API key
    apiKeyConfigured: boolean  // Helper flag for UI

    // Embeddings
    autoGenerateEmbeddings: boolean
    embeddingModel: 'text-embedding-3-small'  // Fixed for now

    // Whisper
    whisperLanguage: string    // ISO 639-1 code (default: "en")

    // Future: Local models (coming soon)
    useLocalModels: false      // Disabled for MVP
  }

  sync: {
    enabled: boolean           // User logged in?
    autoSync: boolean          // Auto-sync on changes
    syncInterval: number       // Minutes (0 = manual only)
    lastSyncTime: string       // ISO timestamp
    conflictResolution: 'ask' | 'take_local' | 'take_cloud'
  }

  privacy: {
    collectAnalytics: boolean  // Opt-in only
    cloudBackup: boolean       // Enable cloud sync
  }
}
```

**UI Mockup - Storage Tab**:
```
┌────────────────────────────────────────────────┐
│  ⚙️ Settings                              × │
├────────────────────────────────────────────────┤
│ ┌──────────────┐                               │
│ │ 📁 Storage   │  ← Active tab                 │
│ │ ✏️ Editor     │                               │
│ │ 🤖 AI Models  │                               │
│ │ ☁️ Cloud Sync │                               │
│ │ 🔒 Privacy    │                               │
│ └──────────────┘                               │
│                                                 │
│  Document Folder                               │
│  ┌───────────────────────────────────────────┐│
│  │ ~/Documents/Tentacle                 [⋮] ││ ← Browse
│  └───────────────────────────────────────────┘│
│                                                 │
│  ☑ Auto-backup documents                       │
│     Keep last [10▼] backups                    │
│                                                 │
│  Current Storage Usage: 45.2 MB (1,247 docs)  │
│                                                 │
│  [Scan Vault Now]  [Clear Cache]               │
│                                                 │
├────────────────────────────────────────────────┤
│                    [Save Changes]              │
└────────────────────────────────────────────────┘
```

**UI Mockup - AI Models Tab**:
```
┌────────────────────────────────────────────────┐
│  ⚙️ Settings                              × │
├────────────────────────────────────────────────┤
│ ┌──────────────┐                               │
│ │ 📁 Storage   │                               │
│ │ ✏️ Editor     │                               │
│ │ 🤖 AI Models  │  ← Active tab                 │
│ │ ☁️ Cloud Sync │                               │
│ │ 🔒 Privacy    │                               │
│ └──────────────┘                               │
│                                                 │
│  OpenAI API Key (BYOK)                         │
│  ┌───────────────────────────────────────────┐│
│  │ sk-proj-...                          [👁] ││ ← Show/hide
│  └───────────────────────────────────────────┘│
│  [Test API Key]                                │
│                                                 │
│  ✓ API key configured and valid                │
│                                                 │
│  ℹ️ Your API key is stored securely in your    │
│     system keychain and never leaves your      │
│     device except for API calls to OpenAI.     │
│                                                 │
│  Get your API key:                             │
│  → https://platform.openai.com/api-keys        │
│                                                 │
│  Features enabled with API key:                │
│  • Voice transcription (Whisper)               │
│  • Semantic search (Embeddings)                │
│                                                 │
│  Whisper Language                              │
│  ┌───────────────────────────────────────────┐│
│  │ English                              [▼] ││
│  └───────────────────────────────────────────┘│
│                                                 │
│  ☑ Auto-generate embeddings for new documents │
│                                                 │
│  🔜 Coming Soon: Local models for offline use  │
│                                                 │
├────────────────────────────────────────────────┤
│                    [Save Changes]              │
└────────────────────────────────────────────────┘
```

### First-Time Setup Flow

**On First Launch**:
```
1. Welcome screen
   "Welcome to Tentacle!"
   "Local-first note-taking with AI features"

2. Folder selection dialog
   "Choose where to store your documents"
   - Suggest: ~/Documents/Tentacle
   - Allow custom selection
   - Show disk space available

3. Optional: Import existing markdown files
   "Found 47 markdown files in this folder. Import them?"
   [Import] [Skip]

4. AI Features setup (optional)
   "Enable AI features?"
   "Voice transcription and semantic search require an OpenAI API key"

   Enter your OpenAI API key (optional):
   [___________________________] [Get API Key]

   [Skip for now] [Save & Continue]

5. Optional: Sign in for cloud sync
   "Sign in to enable cloud sync and backup"
   [Sign In] [Skip - Use Locally]

6. Ready!
   "You're all set! Start capturing your thoughts."
   [Create First Document]
```

## Migration Strategy

### Phase 1: Parallel Implementation (Keep Supabase)

**Goal**: Implement local-first without breaking existing users

1. Add Tauri commands for local filesystem
2. Add SQLite database alongside Supabase
3. Add settings modal with vault selection
4. Implement local document CRUD
5. Keep Supabase integration intact

**Feature Flag**:
```typescript
const useLocalFirst = localStorage.getItem('local-first-enabled') === 'true'

if (useLocalFirst) {
  // Use Tauri local storage
  await invoke('read_document', { filePath })
} else {
  // Use Supabase
  await fetchDocument(id)
}
```

### Phase 2: Make Local-First Default

1. Switch default to local storage
2. Add "Migrate from Cloud" tool
3. Download all user's Supabase documents to local vault
4. Keep cloud sync as optional feature

### Phase 3: Supabase as Sync Backend Only

1. Remove Supabase as primary datastore
2. Use Supabase only for sync/backup (when logged in)
3. Documents live in markdown files + SQLite
4. Cloud is cache/replica, not source of truth

## Recommended Implementation Order

### Sprint 1: Foundation (Week 1-2)

1. **Tauri Commands** ✅
   - File system operations (read, write, delete)
   - Folder selection dialog
   - Basic markdown parsing with frontmatter

2. **SQLite Setup** ✅
   - Create database schema
   - Initialize on app startup
   - Basic CRUD operations

3. **Settings Modal** ✅
   - Storage tab (vault path selection)
   - Scan existing folder
   - Simple UI with save/cancel

4. **Document Operations** ✅
   - Create document → markdown file
   - Read document → parse markdown
   - Update document → write markdown
   - Delete document → soft delete

### Sprint 2: Indexing & Search (Week 3)

5. **File System Watcher** ✅
   - Watch vault for changes
   - Update SQLite index on file changes
   - Handle external edits (Obsidian, VSCode)

6. **Full-Text Search** ✅
   - FTS5 integration
   - Search UI component
   - Tag filtering

7. **Migration Tool** ✅
   - "Import from Supabase" button
   - Download all user documents
   - Convert to markdown + index

### Sprint 3: AI Features (Week 3-4) - SIMPLIFIED with BYOK

8. **OpenAI API Integration** 🔄
   - Settings UI: API key input field
   - Secure API key storage (keychain)
   - Test API key connection

9. **Embeddings via OpenAI** 🔄
   - Call text-embedding-3-small API
   - Generate embeddings on create/edit
   - Store in SQLite
   - Semantic search UI

10. **Whisper via OpenAI** 🔄
    - Voice recording UI
    - Upload audio to Whisper API
    - Display transcription
    - Auto-save as document

### Sprint 4: Cloud Sync (Week 5)

11. **Sync Implementation** 🔄
    - Sync algorithm (upload/download)
    - Conflict detection
    - Conflict resolution UI

12. **Settings Completion** 🔄
    - Cloud Sync tab
    - Privacy tab
    - Editor preferences

## Key Technical Decisions

### 1. Markdown vs. Database as Source of Truth

**Decision**: Markdown files are source of truth
**Rationale**:
- User data portability (can read with any text editor)
- Git version control friendly
- Future-proof (markdown will outlive any database schema)
- Interoperability with other tools (Obsidian, Notion, etc.)

**Trade-off**: Slower full-text search (mitigated by SQLite FTS5 cache)

### 2. Frontmatter Format

**Decision**: Use YAML frontmatter (standard in Obsidian, Jekyll, Hugo)
**Rationale**:
- Industry standard for markdown metadata
- Supports nested objects, arrays
- Human-readable
- Parseable by many tools

**Example**:
```yaml
---
id: uuid
title: string
tags: [string]
created: ISO8601
updated: ISO8601
deleted: boolean
---
```

### 3. CRDT vs. Last-Write-Wins (LWW)

**Decision**: Last-Write-Wins with conflict UI
**Rationale**:
- Simpler to implement
- Users understand it (like Dropbox conflicts)
- CRDTs are complex and harder to debug
- Most conflicts are rare and resolved manually anyway

**When to Consider CRDTs**:
- If real-time collaborative editing is needed (future feature)
- Yjs or Automerge libraries could be added later

### 4. Local Models vs. BYOK APIs

**Decision**: BYOK (Bring Your Own Key) with OpenAI API
**Rationale**:
- Much simpler implementation (no ONNX, no model management)
- Faster time to market (weeks vs. months)
- Better quality (state-of-the-art models)
- User controls costs and usage
- No large model downloads (~200MB saved)

**Trade-off**:
- Requires internet for AI features
- API costs (though minimal for typical usage)
- Data sent to OpenAI for transcription/embeddings

**Future**: Local models marked as "Coming Soon" for offline capability

### 5. SQLite vs. Embedded DB (RocksDB, sled)

**Decision**: SQLite
**Rationale**:
- Mature, battle-tested
- Excellent full-text search (FTS5)
- SQL is familiar to developers
- Great Rust libraries (sqlx, rusqlite)
- Compatible with many tools (Datasette, DB Browser)

### 6. File Watching Strategy

**Decision**: Use notify crate, update SQLite on changes
**Rationale**:
- Keeps index in sync with filesystem
- Handles external edits (Obsidian, VSCode)
- Low overhead (file system events, not polling)

**Edge Case**: User edits document in Vim while Tentacle is open
- File watcher detects change
- Re-reads file, updates SQLite cache
- Frontend re-fetches document if currently open
- User sees changes reflected (graceful reload)

## Performance Targets

| Operation | Target | Strategy |
|-----------|--------|----------|
| App startup (cold) | < 2s | No model loading, cache DB connection |
| Open document | < 100ms | Read from SQLite cache first |
| Search 10k docs | < 500ms | FTS5 index, limit results |
| Semantic search | < 500ms | Pre-computed embeddings, cosine similarity |
| Auto-save | < 50ms | Debounced writes, async |
| Voice transcription (30s) | 3-5s | OpenAI Whisper API (network dependent) |
| Full vault scan (1k docs) | < 10s | Parallel file reading, progress bar |
| Generate embeddings (1k docs) | 3-5 min | OpenAI API with rate limiting, show progress |

## Security Considerations

### Data Privacy

1. **Local-First Storage**
   - Documents stored locally as markdown files
   - SQLite database never leaves device
   - No cloud storage unless user logs in

2. **AI Features (BYOK)**
   - User provides their own OpenAI API key
   - Document text sent to OpenAI for embeddings
   - Audio sent to OpenAI for transcription
   - User controls their OpenAI account and data retention policies
   - API key stored securely in OS keychain

3. **Optional Cloud Sync**
   - Explicit opt-in via login
   - End-to-end encryption (future enhancement)
   - User can delete cloud data anytime

4. **No Analytics by Default**
   - Opt-in telemetry only
   - No tracking without consent

### Filesystem Security

1. **Permissions**
   - Request folder access explicitly (Tauri dialog)
   - Don't auto-read sensitive directories
   - Respect OS sandboxing

2. **SQLite Encryption** (optional future feature)
   - SQLCipher for encrypted database
   - User sets master password
   - Protects metadata and embeddings

3. **Backup Strategy**
   - Auto-backup to `.tentacle/backups/`
   - Keep last N versions
   - Allow export to ZIP

## Open Questions & Future Enhancements

### Answered by User

✅ Vault folder: User-chosen (Obsidian-style)
✅ Authentication: Fully optional, all features work offline
✅ Sync strategy: Merge with conflict resolution UI
✅ Embeddings: Local models only

### To Decide in Implementation

1. **Document Linking**
   - Support `[[wikilinks]]` like Obsidian?
   - Backlinks panel?
   - Graph view?

2. **Media Files**
   - Store images inline (base64) or as separate files?
   - Create `assets/` subfolder in vault?
   - Handle attachments (PDFs, audio)?

3. **Export Options**
   - Export to PDF?
   - Export to Notion/Obsidian format?
   - Bulk export to ZIP?

4. **Templates**
   - Document templates (meeting notes, daily log)?
   - Custom frontmatter schemas?

5. **Mobile App**
   - iOS/Android apps in future?
   - Mobile-first sync (low bandwidth)?

6. **Plugins/Extensions**
   - Allow user plugins (WASM)?
   - API for third-party integrations?

## Research Sources

### Local-First Architecture
- [FOSDEM 2026 - Local-First, sync engines, CRDTs](https://fosdem.org/2026/schedule/track/local-first/)
- [Building an offline realtime sync engine · GitHub](https://gist.github.com/pesterhazy/3e039677f2e314cb77ffe3497ebca07b)
- [Why Local-First Software Is the Future and its Limitations | RxDB](https://rxdb.info/articles/local-first-future.html)
- [Local-first architecture with Expo](https://docs.expo.dev/guides/local-first/)
- [Local, first, forever @ tonsky.me](https://tonsky.me/blog/crdt-filesync/)
- [Cool frontend arts of local-first: storage, sync, conflicts—Evil Martians](https://evilmartians.com/chronicles/cool-front-end-arts-of-local-first-storage-sync-and-conflicts)

### SQLite with Tauri
- [How to use local SQLite database with Tauri and Rust | MoonGuard](https://blog.moonguard.dev/how-to-use-local-sqlite-database-with-tauri)
- [Building a todo app in Tauri with SQLite and sqlx](https://tauritutorials.com/blog/building-a-todo-app-in-tauri-with-sqlite-and-sqlx)
- [SQL | Tauri](https://v2.tauri.app/plugin/sql/)
- [Moving from Electron to Tauri - Part 2: Local Data Storage | UMLBoard](https://www.umlboard.com/blog/moving-from-electron-to-tauri-2/)
- [Rust - Embedding a SQLite database in a Tauri Application](https://dezoito.github.io/2025/01/01/embedding-sqlite-in-a-tauri-application.html)
- [Building a Local-First Password Manager: Tauri, Rust, Sqlx and SQLCipher | Medium](https://mhmtsr.medium.com/building-a-local-first-password-manager-tauri-rust-sqlx-and-sqlcipher-09d0134db5bc)

### CRDTs and Conflict Resolution
- [About CRDTs • Conflict-free Replicated Data Types](https://crdt.tech/)
- [The CRDT Dictionary: A Field Guide to Conflict-Free Replicated Data Types](https://www.iankduncan.com/engineering/2025-11-27-crdt-dictionary/)
- [CRDT - Conflict-free replicated data type Database | RxDB](https://rxdb.info/crdt.html)
- [Offline-First Done Right: Sync Patterns for Real-World Mobile Networks](https://developersvoice.com/blog/mobile/offline-first-sync-patterns/)

### Embedding Models for RAG
- [The Best Open-Source Embedding Models in 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [5 Best Embedding Models for RAG: How to Choose the Right One](https://greennode.ai/blog/best-embedding-models-for-rag)
- [Benchmark of 16 Best Open Source Embedding Models for RAG](https://research.aimultiple.com/open-source-embedding-models/)
- [Bring Your Own LLMs and Embeddings | Ragas](https://docs.ragas.io/en/v0.1.21/howtos/customisations/bring-your-own-llm-or-embs.html)
- [Finding the Best Open-Source Embedding Model for RAG | Tiger Data](https://www.tigerdata.com/blog/finding-the-best-open-source-embedding-model-for-rag)

### Local Whisper Inference
- [Using Whisper Model In Tauri Apps - Genspark](https://www.genspark.ai/spark/using-whisper-model-in-tauri-apps/aa7f0cea-77e6-4b80-9051-943c58bc9ac3)
- [GitHub - acknak/pothook: GUI application for transcribing text using Whisper.cpp](https://github.com/acknak/pothook)
- [GitHub - OpenWhispr/openwhispr: Voice-to-text dictation app with BYOK](https://github.com/OpenWhispr/openwhispr)
- [GitHub - hate/keyless: Privacy‑first speech‑to‑text dictation](https://github.com/hate/keyless)

### File System Watching
- [File System | Tauri](https://v2.tauri.app/plugin/file-system/)
- [GitHub - tauri-apps/tauri-plugin-fs-watch](https://github.com/tauri-apps/tauri-plugin-fs-watch)
- [GitHub - visnkmr/filedime: High Performance File explorer with markdown hot reload](https://github.com/visnkmr/filedime)
- [File Management in Tauri 2.0 with Rust | Q. Wach](https://quentinwach.com/blog/2024/11/26/files-in-tauri-v2.html)

### Obsidian Architecture
- [Obsidian the note taking app is a great model to follow | Hacker News](https://news.ycombinator.com/item?id=44475944)
- [GitHub - pmmvr/obsidian-index-service: SQLite indexing for Obsidian vault](https://github.com/pmmvr/obsidian-index-service)
- [SQLite DB - Obsidian Plugin](https://www.obsidianstats.com/plugins/sqlite-db)

## Conclusion

This local-first architecture provides:

✅ **Local storage**: Documents stored as markdown files, full control
✅ **No auth required**: Full document CRUD without login
✅ **Performance**: Fast SQLite queries, instant search
✅ **Interoperability**: Standard markdown files, any editor
✅ **Cloud sync**: Optional backup/sync when logged in
✅ **BYOK AI**: User-provided OpenAI API key for embeddings and Whisper
✅ **Conflict resolution**: Merge UI for diverged changes
✅ **User control**: Choose vault location, portable data

### Key Advantages of BYOK Approach

**Simplified Implementation**:
- No model downloads or management (~200MB saved)
- No ONNX runtime or ML inference complexity
- Single API key for both embeddings and transcription
- Faster time to MVP (weeks saved)

**Better User Experience**:
- No waiting for model downloads on first launch
- Faster app startup (no model loading)
- State-of-the-art quality (latest OpenAI models)
- Lower maintenance burden

**Future Path**:
- Local models can be added later as "offline mode"
- Users can choose between BYOK (online) and local (offline)
- Gradual migration path without breaking changes

The hybrid markdown + SQLite approach balances the best of both worlds: human-readable files as source of truth with fast database indexing for search and metadata queries. The Tauri Rust backend provides native filesystem access and OpenAI API integration, while the Next.js frontend delivers a polished user experience.

**Next Steps**: Create detailed implementation spec breaking down each component into implementable tasks.
