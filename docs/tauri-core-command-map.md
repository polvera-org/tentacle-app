# Tauri <-> Core Command Map

This file maps Tauri commands to their core behavior so future CLI and desktop work stays aligned.

Source files:

- Tauri command handlers: `frontend/src-tauri/src/lib.rs`
- Core logic: `core/src/config.rs`, `core/src/document_cache.rs`, `core/src/document_folders.rs`, `core/src/embeddings.rs`

## 1. Config Commands

| Tauri command | Core call |
| --- | --- |
| `get_config` | `ConfigStore::get` |
| `set_config` | `ConfigStore::set` |
| `get_all_config` | `ConfigStore::get_all` |

## 2. Document Cache Commands

| Tauri command | Core call |
| --- | --- |
| `get_cached_documents` | `DocumentCacheStore::list_documents` |
| `get_cached_document_tags` | `DocumentCacheStore::list_document_tags` |
| `upsert_cached_document` | `DocumentCacheStore::upsert_document` |
| `delete_cached_document` | `DocumentCacheStore::delete_document` |
| `replace_cached_documents` | `DocumentCacheStore::replace_documents` |

## 3. Low-Level Embedding Cache Commands

These still exist but should be treated as lower-level plumbing:

| Tauri command | Core call |
| --- | --- |
| `get_cached_document_embedding_metadata` | `DocumentCacheStore::list_document_embedding_metadata` |
| `upsert_cached_document_embedding` | `DocumentCacheStore::upsert_document_embedding` |
| `delete_cached_document_embedding` | `DocumentCacheStore::delete_document_embedding` |
| `replace_cached_document_embeddings` | `DocumentCacheStore::replace_document_embeddings` |
| `semantic_search_cached_documents` | `DocumentCacheStore::semantic_search_documents` |
| `hybrid_search_cached_documents` | `DocumentCacheStore::hybrid_search_documents` |
| `replace_cached_document_chunk_embeddings` | `DocumentCacheStore::replace_document_chunk_embeddings` |

## 4. Preferred High-Level Embedding Commands

These are the commands the frontend now uses for the migrated core-owned flow:

| Tauri command | Core call |
| --- | --- |
| `sync_document_embeddings` | `embeddings::sync_document_embeddings` |
| `sync_documents_embeddings_batch` | `embeddings::sync_documents_embeddings_batch` |
| `delete_document_embeddings` | `embeddings::delete_document_embeddings` |
| `hybrid_search_documents_by_query` | `embeddings::hybrid_search_documents_by_query` |

Notes:

- Core embedding inference is ONNX-based (`Qwen3-Embedding-0.6B-ONNX`) and executed fully in Rust.
- These high-level commands are the preferred surface for both desktop and future CLI behavior.

## 5. Document Folder Commands

| Tauri command | Core call |
| --- | --- |
| `list_document_folders` | `tentacle_core::document_folders::DocumentFoldersService::list_folders` |
| `create_document_folder` | `tentacle_core::document_folders::DocumentFoldersService::create_folder` |
| `rename_document_folder` | `tentacle_core::document_folders::DocumentFoldersService::rename_folder` |
| `delete_document_folder` | `tentacle_core::document_folders::DocumentFoldersService::delete_folder` |
| `move_document_to_folder` | `tentacle_core::document_folders::DocumentFoldersService::move_document_to_folder` |

## 6. Guidance

For CLI implementation:

1. Call `tentacle-core` directly, not Tauri commands.
2. Keep command output and ranking behavior consistent with core.
3. Add new core APIs first, then expose through Tauri only if frontend needs them.
