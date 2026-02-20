# Local Storage and Data Model

This document defines the local-first persistence contract used by CLI and desktop app.

## 1) Storage Locations

## App config DB

- File: `<app_data_dir>/config.db`
- `app_data_dir`: `dirs::data_dir()/com.tentacle.desktop`
- Owner: `core/src/config.rs`

## Documents root

- Config key: `documents_folder`
- CLI default on `tentacle init`: `~/Tentacle`
- Frontend fallback when missing: `<home>/Tentacle`

## Local cache DB

- File: `<documents_folder>/.document-data.db`
- Owner: `core/src/document_cache.rs`
- Purpose: cached docs/tags + FTS + vector data for hybrid search

## 2) Markdown File Contract

Each document is one `.md` file under `documents_folder` (including subfolders), excluding `.trash` subtree.

Canonical serialized shape:

```md
---
id: "<document_id>"
created_at: "<ISO8601>"
updated_at: "<ISO8601>"
tags: ["tag_one","tag_two"]
tags_locked: false
---

# <Title>

<Markdown body>
```

Behavioral notes:

- Title is derived from filename stem.
- Body is markdown content below the top `# Title` heading (if heading matches filename title).
- On read, malformed/missing metadata can be repaired and file rewritten.

## 3) Frontmatter Normalization Rules

Implemented in both Rust core and frontend local API layer:

- `id`: required; generated if missing/invalid.
- `created_at` / `updated_at`: fallback to current UTC if invalid.
- `tags`: de-duplicated, lowercased, `#` prefix removed, whitespace collapsed to `_`.
- `tags_locked`: boolean; defaults to `false`.

## 4) Path and Folder Rules

- Paths are normalized to relative forward-slash form.
- Absolute paths and traversal segments (`.` / `..`) are rejected.
- Reserved folder segment: `.trash`.
  - Cannot be created/renamed to via folder services.
  - Document scans skip `.trash` recursively.

## 5) Delete Semantics (Soft Delete)

Frontend delete operation moves markdown files to:

- `<documents_folder>/.trash/<original-or-collision-safe-name>.md`

It then removes cache entries and schedules embedding cleanup for the deleted doc id.

## 6) Config Keys in Active Use

Known keys currently read/written:

- `documents_folder`
- `editor` (CLI create editor command)
- `default_folder` (CLI folder delete move target)
- `auto_tag` (CLI create auto-tag toggle)
- `openai_api_key` (desktop settings)
- `input_device` (desktop voice capture settings)

## 7) `.document-data.db` Schema (High Level)

Core tables:

- `documents`
- `document_tags`
- `document_embeddings_meta`
- `document_chunk_embeddings_meta`

Virtual/search tables:

- `documents_fts` (FTS5)
- `document_embeddings_vec` (`vec0` 384-dim)
- `document_chunk_embeddings_vec` (`vec0` 384-dim)

Key invariants:

- Embedding vector dimension is fixed at 384.
- Embedding metadata includes model + content hash.
- Triggers keep vector rows in sync when metadata rows are deleted.
- FTS triggers keep `documents_fts` synced with `documents` updates.

## 8) Reindex and Cache Population

Reindex (`KnowledgeBaseService::reindex_with_progress`) does:

1. Read markdown docs from filesystem.
2. Normalize and replace cache `documents`/`document_tags`.
3. Batch-sync embeddings/chunk embeddings.

Folder-scoped reindex updates only matching folder subtree and preserves unrelated cached docs.

## 9) Data Ownership Summary

- Filesystem markdown is the canonical local source for document content.
- `.document-data.db` is a derived index/cache for fast retrieval.
- Supabase schema (`supabase/migrations`) is a separate optional cloud surface.
