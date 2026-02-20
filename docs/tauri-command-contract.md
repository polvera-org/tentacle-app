# Tauri Command Contract

This document defines the Tauri invoke surface exposed by `frontend/src-tauri/src/lib.rs`.

## 1) Scope and Intent

Tauri handlers are transport adapters. Shared business logic should live in `tentacle-core` and be called from Tauri.

## 2) Command Groups

## Config commands

- `get_config(key)`
- `set_config(key, value)`
- `get_all_config()`

Backed by `ConfigStore`.

## Cache/document commands

- `get_cached_documents(documents_folder)`
- `get_cached_document_tags(documents_folder)`
- `upsert_cached_document(documents_folder, document)`
- `delete_cached_document(documents_folder, document_id)`
- `replace_cached_documents(documents_folder, documents)`

Backed by `DocumentCacheStore`.

## Low-level embedding cache commands

- `get_cached_document_embedding_metadata`
- `upsert_cached_document_embedding`
- `delete_cached_document_embedding`
- `replace_cached_document_embeddings`
- `semantic_search_cached_documents`
- `hybrid_search_cached_documents`
- `replace_cached_document_chunk_embeddings`

These remain for compatibility/debug plumbing.

## Preferred high-level embedding commands

- `sync_document_embeddings`
- `sync_documents_embeddings_batch`
- `delete_document_embeddings`
- `hybrid_search_documents_by_query`

These route through `core::embeddings` and are preferred for app behavior.

## Document folder commands

- `list_document_folders`
- `create_document_folder`
- `rename_document_folder`
- `delete_document_folder`
- `move_document_to_folder`

Backed by `DocumentFoldersService`.

## Embedding startup runtime commands

- `get_embedding_model_load_state`
- `preload_embedding_model`

Backed by in-memory `EmbeddingRuntimeState` in Tauri app state.

## 3) Event Contract

Emitted event name:

- `embedding-model-load-state`

Payload shape:

- `status`: `idle | loading | ready | failed`
- `stage`: `starting | resolving_artifacts | loading_tokenizer | creating_session | ready | failed`
- `progress`: `0..1`
- `message`: status text
- `error`: nullable string

Used by frontend startup gate in `frontend/components/providers/embedding-model-startup-gate.tsx`.

## 4) Startup Lifecycle

On app startup (`setup` callback):

1. Resolve app data dir.
2. Initialize and manage `ConfigStore` mutex.
3. Initialize and manage `EmbeddingRuntimeState`.
4. Spawn embedding model preload in background thread.
5. Emit progress events during preload.

## 5) Argument Naming Compatibility

Frontend wrappers intentionally send both camelCase and snake_case argument keys for compatibility, for example:

- `documentsFolder` + `documents_folder`
- `documentId` + `document_id`
- `queryText` + `query_text`
- `semanticWeight` + `semantic_weight`

When adding commands, keep compatibility with this dual-key calling pattern or update wrappers atomically.

## 6) Plugin/Capability Dependencies

Tauri plugins initialized:

- `tauri-plugin-dialog`
- `tauri-plugin-fs`
- `tauri-plugin-shell`
- `tauri-plugin-log` (debug builds)

Frontend local document workflows assume these plugins are available in desktop runtime.

## 7) Contributor Rules

1. Add new domain behavior in `core` first.
2. Keep Tauri handlers thin and mapping-only.
3. Return structured payloads instead of opaque strings where practical.
4. If adding startup/runtime state, define explicit event name + payload type in both Rust and TS.
5. Update this contract and `docs/core-api-contracts.md` when command surface changes.
