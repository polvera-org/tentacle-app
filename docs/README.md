# Tentacle Technical Docs

This directory is the implementation-focused documentation for future coding agents and maintainers.

## Recommended Reading Order

1. `docs/core-cli-agent-guide.md`
2. `docs/tauri-core-command-map.md`
3. `CORE_CLI_PLAN.md` (repo root, high-level roadmap)

## Scope

- Shared Rust core architecture
- Embedding/search ownership and lifecycle
- Tauri command surface and how it maps to core APIs
- Guidance for upcoming CLI work

## Current State Snapshot

As of February 16, 2026:

- `core` is the single owner of embedding sync + hybrid search orchestration.
- Frontend no longer uses `@xenova/transformers`.
- Tauri calls into core for embedding lifecycle and query-based hybrid search.
- A dedicated `cli/` crate is not created yet in this workspace.
