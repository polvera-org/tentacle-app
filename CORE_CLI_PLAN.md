# Core + CLI Plan: Local RAG & Cloud Sync

**Timeline:** 2 weeks MVP
**Architecture:** Shared Rust core → Tauri app + CLI

## Directory Structure

```
tentacle-app/
├── Cargo.toml                    # Workspace root
├── core/                         # Shared Rust library
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs               # Public API
│       ├── watcher.rs           # File system watching
│       ├── indexer.rs           # Document indexing & chunking
│       ├── embeddings.rs        # Local embedding generation
│       ├── vector_store.rs      # Vector storage (LanceDB)
│       └── search.rs            # RAG query interface
├── cli/                          # CLI application
│   ├── Cargo.toml
│   └── src/
│       └── main.rs              # CLI commands (watch, search, sync)
└── frontend/                     # Tauri app (existing)
    └── src-tauri/
        ├── Cargo.toml           # Add core dependency
        └── src/
            └── lib.rs           # Tauri commands wrapping core
```

## MVP Scope (2 Weeks)

### Week 1: Core Foundation

**Days 1-2: Project Setup**
- [ ] Create Cargo workspace (`Cargo.toml` at root)
- [ ] Initialize `core/` library crate
- [ ] Initialize `cli/` binary crate
- [ ] Update `frontend/src-tauri/Cargo.toml` to use workspace

**Days 3-5: File Watching & Indexing**
- [ ] Implement file watcher (`notify` crate)
- [ ] Basic document chunking (split by paragraphs/sentences)
- [ ] File metadata extraction (name, path, modified date)
- [ ] Simple in-memory index for MVP

**Days 6-7: Embeddings & Vector Storage**
- [ ] Integrate local embedding model (use `fastembed-rs` or pre-quantized model)
- [ ] Set up LanceDB for vector storage
- [ ] Implement basic search (cosine similarity)

### Week 2: Integration & CLI

**Days 8-9: RAG Query Interface**
- [ ] Implement semantic search over indexed documents
- [ ] Return relevant chunks with metadata
- [ ] Basic ranking/scoring

**Days 10-11: Tauri Integration**
- [ ] Add Tauri commands wrapping core search
- [ ] Background indexing on app startup
- [ ] Settings UI to trigger re-indexing

**Days 12-13: CLI Implementation**
- [ ] `tentacle watch <folder>` - start indexing
- [ ] `tentacle search <query>` - semantic search
- [ ] `tentacle status` - show indexed files count

**Day 14: Polish & Testing**
- [ ] Error handling
- [ ] Basic tests
- [ ] Documentation

## MVP Exclusions (Post-Launch)

- Cloud sync (Phase 2)
- Advanced chunking strategies
- Multiple embedding models
- Incremental indexing optimization
- Full-text + semantic hybrid search

## Tech Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| File watching | `notify` | Battle-tested, cross-platform |
| Embeddings | `fastembed-rs` or `candle` | Local, no API calls |
| Vector DB | LanceDB | Embedded, no server needed |
| CLI framework | `clap` | Standard Rust CLI tool |
| Async runtime | `tokio` | Required for Tauri, consistent |

## Core API Example

```rust
// core/src/lib.rs
pub struct TentacleCore {
    watcher: FileWatcher,
    indexer: Indexer,
    vector_store: VectorStore,
}

impl TentacleCore {
    pub async fn new(docs_folder: PathBuf) -> Result<Self>;
    pub async fn start_watching(&mut self) -> Result<()>;
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>>;
    pub async fn get_stats(&self) -> IndexStats;
}
```

## CLI Commands

```bash
# Initialize and start watching
tentacle init ~/Documents

# Search documents
tentacle search "meeting notes from last week"

# Show index status
tentacle status

# Force re-index
tentacle reindex
```

## Tauri Commands

```typescript
// Frontend calls
await invoke('search_documents', { query: 'project plan' })
await invoke('get_index_stats')
await invoke('reindex_documents')
```

## Success Metrics

- ✅ Index 1000+ documents in < 30 seconds
- ✅ Search returns results in < 500ms
- ✅ CLI and app share identical core logic
- ✅ Single binary distribution (no external dependencies)

## Phase 2 (Post-MVP)

- Cloud sync architecture (conflict resolution, delta sync)
- Incremental indexing (only process changed files)
- Advanced RAG (re-ranking, query expansion)
- Tagging & metadata extraction
- Multi-modal support (images, PDFs)
