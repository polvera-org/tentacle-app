# Search and Embeddings

This document describes the end-to-end retrieval pipeline used by Tentacle.

## 1) Retrieval Architecture

Hybrid retrieval combines:

1. BM25-like lexical retrieval from SQLite FTS5 (`documents_fts`)
2. Semantic retrieval from vector embeddings (`sqlite-vec`, 384 dims)

Fusion is executed in `DocumentCacheStore::hybrid_search_documents`.

## 2) Query Processing Path

## Frontend preprocessing

`frontend/lib/ai/query-preprocessor.ts` computes:

- `ftsQuery`: original tokens (exact lexical intent)
- `normalized`: abbreviation-expanded semantic query text
- adaptive weights (`semanticWeight`, `bm25Weight`) based on query length

Examples:

- very short queries: BM25-heavy
- longer natural-language queries: more semantic weight

## Core query execution

`core::embeddings::hybrid_search_documents_by_query`:

1. Validates non-empty query and positive limit.
2. Attempts embedding for semantic query text (if semantic leg enabled).
3. On embedding failure, falls back to BM25-only mode.
4. Calls `DocumentCacheStore::hybrid_search_documents` with weights.

## 3) Embedding Model Runtime

Current model id:

- `onnx-community/all-MiniLM-L6-v2-ONNX`

Runtime stack:

- `hf-hub` artifact resolution/download
- `tokenizers` for tokenization
- `ort` (ONNX Runtime) for inference

Model lifecycle:

- Tauri starts preload in background at app startup.
- Progress emitted via `embedding-model-load-state` event.
- Frontend startup gate blocks app until status is `ready` (or fallback-ready path when unavailable).

## 4) Embedding and Chunking Details

Vector dimension:

- fixed `384`

Text preparation:

- document embedding source: `title + plain-body`
- plain body extracted from Tiptap JSON or raw text

Chunking (`core/src/text_processing.rs`):

- target chunk size: `800` chars
- overlap: `200` chars
- chunk text includes title context

Inference batching:

- micro-batch size: `8` texts per model call
- write batch size: `75` docs for embedding sync writes

## 5) Hashing and Incremental Sync

Core uses deterministic content hashes for skip logic:

- document hash: source text + model id
- chunk hash: chunk texts + model id

During sync:

1. If document hash unchanged, doc embedding write is skipped.
2. If chunk hash unchanged, chunk embedding write is skipped.
3. Changed embeddings are written in batches with rollback-safe fallback to per-doc writes.

## 6) Reindex Interaction

Reindex flow (`KnowledgeBaseService::reindex_with_progress`):

1. Read/normalize markdown documents.
2. Replace cache document rows.
3. Sync embeddings batch.
4. Emit progress events for phase 1 (load) and phase 2 (embedding sync).

Folder-scoped reindex updates only selected subtree plus embedding updates for those docs.

## 7) Failure Modes and Fallbacks

- Query embedding failure: lexical search still works (BM25-only).
- Model preload failure: startup gate shows retry UI.
- Individual doc sync failure in batch: logged; fallback attempts per-document writes.
- Empty/invalid query: returns no hits.

## 8) Tuning Guidance

When tuning relevance:

1. Keep lexical and semantic query inputs distinct (do not over-normalize FTS string).
2. Preserve deterministic ordering/tie-break behavior.
3. Tune weights with realistic corpus and short/long query mixes.
4. Avoid changing vector dimension unless cache schema + migration + all call sites are updated.
5. Document any ranking behavior changes in this file and release notes.
