# Core Guide For CLI Agents

This document describes how the shared Rust core currently works and how future CLI agents should integrate with it.

## 1. Architecture Overview

The workspace currently has:

- `core/` - shared Rust library (`tentacle-core`)
- `frontend/src-tauri/` - desktop app shell exposing Tauri commands

The intended direction is:

- Desktop app and CLI both call `tentacle-core`.
- Tauri command handlers stay thin wrappers over core logic.
- Business logic (embedding sync, hybrid search, storage behavior) lives in `core`.

## 2. Core Modules And Responsibilities

`core/src/lib.rs` exports:

- `config` - app config key/value store (`config.db`)
- `document_cache` - local document + tag + vector cache (`.document-data.db`)
- `embeddings` - embedding lifecycle and query-based hybrid search orchestration
- `text_processing` - body text extraction/chunking/query formatting helpers

## 3. Storage Model

### 3.1 Config DB

- File: `<app_data_dir>/config.db`
- API: `core/src/config.rs`
- Main key today: `documents_folder`

### 3.2 Document Cache DB

- File: `<documents_folder>/.document-data.db`
- API: `core/src/document_cache.rs`
- Contains:
  - document rows (`documents`)
  - tag rows (`document_tags`)
  - document embeddings metadata + vec table
  - chunk embeddings metadata + vec table
  - FTS5 table for BM25-style retrieval

## 4. Embedding Ownership In Core

Core embedding orchestration lives in `core/src/embeddings.rs`.

Public entry points:

- `sync_document_embeddings(...)`
- `sync_documents_embeddings_batch(...)`
- `delete_document_embeddings(...)`
- `hybrid_search_documents_by_query(...)`

How it behaves:

1. Build source text from title + plain body.
2. Compute deterministic content hash.
3. Skip doc-level embedding update if hash already matches metadata.
4. Recompute chunk embeddings for the document and replace chunk rows.
5. For query search, compute query embedding and call cache hybrid search.
6. If query embedding fails, fallback to BM25-only mode.

## 5. Embedding Runtime (Current)

`core/src/embeddings.rs` now uses ONNX Runtime + Hugging Face tokenizer in Rust core.

Current model id:

- `onnx-community/Qwen3-Embedding-0.6B-ONNX`

Runtime behavior:

1. Resolve tokenizer + ONNX artifacts via `hf-hub`.
2. Initialize a lazy singleton embedding engine in core (tokenizer + ORT session).
3. Encode text with tokenizer in Rust.
4. Run ONNX inference in Rust.
5. Apply last-token pooling and L2 normalization.
6. Enforce 1024-dimensional vectors for cache compatibility.

This means desktop app and future CLI use the exact same embedding implementation.

Operational notes:

- First run may download model artifacts to local HF cache.
- If query embedding fails at runtime, hybrid search falls back to BM25-only mode.
- Content hashes include the model id, so model changes naturally invalidate old embeddings.

## 6. Search Semantics

Hybrid search combines:

- BM25/FTS leg
- Semantic vector leg (doc chunks or doc vectors)

Combination is done in `DocumentCacheStore::hybrid_search_documents(...)` with weighted fusion and deterministic sort behavior.

CLI implementations should call core query APIs and not reimplement ranking logic independently.

## 7. Tauri Integration Contract

Tauri wrappers in `frontend/src-tauri/src/lib.rs` are transport adapters only.

New high-level commands for core-owned embedding flow:

- `sync_document_embeddings`
- `sync_documents_embeddings_batch`
- `delete_document_embeddings`
- `hybrid_search_documents_by_query`

Frontend wrappers for these live in:

- `frontend/lib/documents/embeddings-cache.ts`

## 8. Rules For Future CLI Agents

1. Prefer calling core public APIs directly.
2. Do not duplicate SQL or ranking logic in CLI.
3. Keep vector dimensions aligned with `document_cache` constraints.
4. Keep document operations non-blocking from user perspective where possible.
5. Preserve deterministic ordering and stable tie-breaks in outputs.
6. Treat Tauri command handlers as compatibility surface, not source of truth.

## 9. Suggested First CLI Commands

Once a `cli/` crate is added, wire these first:

1. `reindex <folder>`: read docs and call batch sync.
2. `search <folder> <query>`: call query-based hybrid search API.
3. `delete-embeddings <folder> <doc-id>`: call delete API for debugging/repair.

## 10. Validation Commands

From repo root:

```bash
cargo check -p tentacle-core
cargo check -p app
cargo test -p tentacle-core
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```
