# Tentacle Architecture Overview

This document is the canonical map of how the repository is structured and how data moves through the system.

## 1) System at a Glance

Tentacle has three primary runtime surfaces:

1. `core/` (`tentacle-core`): Rust business logic and storage/search engines.
2. `cli/` (`tentacle-cli`): terminal interface for humans and agents, built on `tentacle-core`.
3. `frontend/` + `frontend/src-tauri/` (`app`): Next.js UI embedded in a Tauri desktop shell that calls `tentacle-core`.

Optional cloud features (Supabase auth/notifications) are used by frontend-only paths and do not replace local-first storage.

## 2) Repository Topology

- `Cargo.toml`: Rust workspace containing `cli`, `core`, and `frontend/src-tauri`.
- `core/src/`: shared domain logic.
- `cli/src/`: CLI parsing, output contracts, and command handlers.
- `frontend/app/`: Next.js App Router pages.
- `frontend/lib/`: frontend data/services layer, including Tauri invocation wrappers.
- `frontend/src-tauri/src/lib.rs`: Tauri command handlers and startup wiring.
- `supabase/migrations/`: SQL schema and RLS for optional cloud features.
- `docs/`: implementation-focused docs for maintainers and agents.

## 3) Runtime Topology

### Desktop app path

1. Tauri starts Rust app (`frontend/src-tauri/src/lib.rs`).
2. Rust creates `ConfigStore` and embedding runtime state.
3. Rust starts async embedding-model preload and emits `embedding-model-load-state` events.
4. Next.js static frontend loads in the Tauri window.
5. Frontend calls Tauri commands (`invoke(...)`) for local config/cache/folder/embedding operations.

### CLI path

1. `tentacle` command parses args via `clap`.
2. Command handlers call `tentacle-core` services (`document_store`, `knowledge_base`, `document_folders`, etc).
3. Output is human-readable text or machine-parseable JSON (`--json`).

### Web-only browser path

Frontend can run under `next dev`, but many document operations intentionally fail outside Tauri (`isTauri()` checks). The repository is desktop-first for local document workflows.

## 4) Core Ownership Model

`core` is intended source-of-truth for:

- Local config DB access (`config.rs`)
- Markdown document store and metadata normalization (`document_store.rs`)
- Folder lifecycle and moves (`document_folders.rs`)
- Local cache DB and hybrid retrieval (`document_cache.rs`)
- Embedding lifecycle + query orchestration (`embeddings.rs`)
- Reindex/search/status orchestration (`knowledge_base.rs`)

Tauri should stay a transport adapter over core APIs.

## 5) Main Data Flows

### Create/update/delete document

1. User action in frontend or CLI.
2. Markdown file read/write under configured documents folder.
3. Cache update in `.document-data.db`.
4. Embedding sync/delete scheduled for the document.
5. Search uses cache + embeddings (hybrid ranking).

Delete is soft-delete at filesystem level: files are moved to `<documents_folder>/.trash/`.

### Reindex and search

1. Read markdown corpus from filesystem.
2. Normalize frontmatter/metadata and update cache docs/tags tables.
3. Sync embeddings in batch for changed content.
4. Search uses BM25 (FTS5) + semantic vector legs with weighted fusion.

### Voice and AI tagging

- Voice capture: frontend records audio and calls OpenAI Whisper directly from client-side code.
- Auto-tagging:
  - Frontend path: client-side OpenAI call + `updateDocument`.
  - CLI path: Rust `auto_tagging.rs` call to OpenAI chat completions, then tag update.

## 6) Optional Cloud Surfaces

Supabase is currently used for:

- Auth/session/profile in frontend (`profiles` table).
- Update notifications (`notifications` table).

Local markdown + local cache remain the primary data path for documents.

## 7) Current Architecture Constraints

- There is deliberate overlap between frontend local document logic (`frontend/lib/documents/api.ts`) and Rust `core` document services.
- Next.js in this repo runs with `output: 'export'`; no server-side API routes are currently the primary backend path.
- Some repository docs are stale relative to code; treat source files as canonical.

## 8) Extension Rules for Contributors

1. Put shared business logic in `core` first.
2. Keep Tauri handlers thin and mapping-only.
3. Keep CLI output contracts stable (`snake_case` JSON, stable error envelope).
4. Preserve local-first behavior and non-destructive delete semantics.
5. Document any new command/interface contract in `docs/` in the same PR.
