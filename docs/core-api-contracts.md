# Core API Contracts

This document defines the public interface and behavior contract for `tentacle-core`.

## 1) Scope

`tentacle-core` is the shared Rust domain layer used by:

- `tentacle-cli`
- Tauri desktop backend (`app` crate)

Public modules exported by `core/src/lib.rs`:

- `config`
- `document_store`
- `document_folders`
- `document_cache`
- `embeddings`
- `knowledge_base`
- `text_processing`

## 2) `config` Module

Primary type:

- `ConfigStore`

Primary operations:

- `new(app_data_dir)`
- `get(key)`
- `set(key, value)`
- `delete(key)`
- `get_all()`
- `default_data_dir()` helper

Contract:

- Backed by SQLite file `config.db`.
- Key/value strings only.
- Callers own key semantics.

## 3) `document_store` Module

Primary data types:

- `StoredDocument`
- `StoredDocumentListItem`
- `CreateDocumentInput`
- `TagUpdateMode` (`replace` / `add` / `remove`)

Primary operations:

- `list_documents(documents_folder)`
- `read_document(documents_folder, document_id)`
- `create_document(documents_folder, input)`
- `update_document_tags(documents_folder, document_id, tags, mode)`
- `find_document_by_id(documents_folder, document_id)`

Contract highlights:

- Markdown files are canonical source.
- Frontmatter metadata is normalized and can be repaired/re-written.
- Title/filename uniqueness is enforced within folder.
- `.trash` folder segment is reserved.

## 4) `document_folders` Module

Primary data types:

- `DocumentFolderPayload`
- `MoveDocumentResultPayload`
- `RenameDocumentFolderInputPayload`
- `DeleteDocumentFolderInputPayload`

Service:

- `DocumentFoldersService`

Operations:

- `list_folders`
- `create_folder`
- `rename_folder`
- `delete_folder`
- `move_document_to_folder`

Contract highlights:

- Relative normalized paths only.
- No path traversal.
- No `.trash` segment in managed folder paths.

## 5) `document_cache` Module

Primary store:

- `DocumentCacheStore`

Primary operations:

- docs/tags CRUD cache (`list_documents`, `replace_documents`, etc)
- embedding metadata/vector operations
- chunk embedding operations
- hybrid and semantic search

Contract highlights:

- Cache DB file is `.document-data.db` under documents root.
- FTS5 + sqlite-vec are initialized/migrated on store creation.
- Vector dimension invariant: 384.
- Hybrid search combines lexical + vector results with deterministic ordering.

## 6) `embeddings` Module

Primary inputs/outputs:

- `EmbeddingSyncDocumentPayload`
- `EmbeddingBatchSyncResultPayload`
- `EmbeddingModelLoadStatePayload`

Primary operations:

- `preload_embedding_model(on_state)`
- `sync_document_embeddings`
- `sync_documents_embeddings_batch`
- `sync_documents_embeddings_batch_with_progress`
- `delete_document_embeddings`
- `hybrid_search_documents_by_query`

Contract highlights:

- Embedding model id: `onnx-community/all-MiniLM-L6-v2-ONNX`.
- Inference runs in Rust (tokenizers + ONNX Runtime).
- Content hashes include model id to invalidate old embeddings naturally.
- Query embedding failure falls back to BM25-only mode.

## 7) `knowledge_base` Module

Primary service:

- `KnowledgeBaseService`

Primary operations:

- `reindex`
- `reindex_with_progress`
- `search`
- `status`

Contract highlights:

- Reindex orchestrates filesystem -> cache -> embedding sync.
- Search orchestrates query hybrid search and folder filtering.
- Status reports indexed counts/tags/folders/index size and last indexed timestamp.

## 8) `text_processing` Module

Core helpers:

- `extract_plain_text_from_tiptap_or_raw`
- `chunk_document_text`
- `build_document_embedding_source_text`
- `format_query_for_embedding`

Contract highlights:

- Long bodies are chunked with target size and overlap.
- Embedding source combines title + extracted plain body.

## 9) Error Contract

Each module exposes specific error enums (`ConfigError`, `DocumentStoreError`, etc).

Callers should:

1. Map domain-specific errors to caller-specific error envelopes.
2. Preserve original message when possible.
3. Avoid swallowing validation vs not-found distinctions.

## 10) Contributor Rules for Core APIs

1. Add behavior in core first when it can be shared by CLI and desktop.
2. Keep API shapes serde-friendly (`snake_case` on serialized payloads where relevant).
3. Preserve deterministic sorting and stable tie-break rules.
4. Add/adjust tests in module-local test suites when changing behavior.
