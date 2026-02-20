# Tentacle Technical Docs

This directory is the implementation-focused documentation for future coding agents and maintainers.

## Recommended Reading Order

1. `docs/architecture-overview.md`
2. `docs/dev-setup-modes.md`
3. `docs/local-storage-and-data-model.md`
4. `docs/core-api-contracts.md`
5. `docs/cli-command-contract.md`
6. `docs/tauri-command-contract.md`
7. `docs/search-and-embeddings.md`
8. `docs/frontend-runtime-boundaries.md`
9. `docs/supabase-schema-and-rls.md`
10. `docs/testing-and-validation-playbook.md`

## Scope

- Architecture and ownership boundaries across core/CLI/frontend/Tauri
- Setup and validation workflows for contributors
- Storage/schema contracts (local markdown/cache and Supabase RLS)
- Command and API contracts for CLI and Tauri integrations
- Search/embedding lifecycle and runtime semantics

## Legacy/Companion Docs

- `docs/core-cli-agent-guide.md`
- `docs/tauri-core-command-map.md`
- `cli/README.md` (repo root CLI install + quickstart)

## Current State Snapshot

As of February 20, 2026:

- `core` is the single owner of embedding sync + hybrid search orchestration.
- Core embedding runtime is ONNX/MiniLM (`onnx-community/all-MiniLM-L6-v2-ONNX`).
- Frontend no longer uses `@xenova/transformers`.
- Tauri calls into core for embedding lifecycle and query-based hybrid search.
- A dedicated `cli/` crate exists and publishes the `tentacle` binary for terminal/agent use.
