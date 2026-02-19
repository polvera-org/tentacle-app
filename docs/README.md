# Tentacle Technical Docs

This directory is the implementation-focused documentation for future coding agents and maintainers.

## Recommended Reading Order

1. `cli/README.md` (repo root, install + agent workflow quickstart)
2. `docs/core-cli-agent-guide.md`
3. `docs/tauri-core-command-map.md`
4. `CORE_CLI_PLAN.md` (repo root, high-level roadmap)

## Scope

- CLI install/distribution and machine-readable usage patterns
- Shared Rust core architecture
- Embedding/search ownership and lifecycle
- Tauri command surface and how it maps to core APIs
- Guidance for upcoming CLI work

## CLI Guidance

- Prefer `tentacle ... --json` for all agent automation.
- Chain commands through stable IDs: `search -> read -> tag`.
- Use stdin create mode for non-interactive flows:
  `echo "# note" | tentacle create --title "..." --json`.
- For install/distribution details, see `cli/README.md` and root `README.md`.

## Current State Snapshot

As of February 18, 2026:

- `core` is the single owner of embedding sync + hybrid search orchestration.
- Core embedding runtime is ONNX/MiniLM (`onnx-community/all-MiniLM-L6-v2-ONNX`).
- Frontend no longer uses `@xenova/transformers`.
- Tauri calls into core for embedding lifecycle and query-based hybrid search.
- A dedicated `cli/` crate exists and publishes the `tentacle` binary for terminal/agent use.
