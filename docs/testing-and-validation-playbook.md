# Testing and Validation Playbook

This document defines practical validation steps for current repository state.

## 1) Current Automated Test Surface

## Rust core tests

Located in module files:

- `core/src/document_store.rs`
- `core/src/document_folders.rs`
- `core/src/document_cache.rs`
- `core/src/embeddings.rs`
- `core/src/knowledge_base.rs`

Coverage focus:

- metadata normalization/recovery
- folder/path safety rules
- cache + hybrid search behavior
- embedding sync and fallback logic

## CLI integration tests

- `cli/tests/agent_cli_flows.rs`

Coverage focus:

- init/config/reindex/search/read flows
- create/tag/folder operations
- JSON output contract and deferred command behavior
- auto-tagging success/failure non-fatal behavior

## Frontend tests

- No first-party unit/integration test suite is currently checked in.

## 2) Required Pre-PR Commands

Run from repo root:

```bash
cargo test -p tentacle-core
cargo test -p tentacle-cli
cargo check -p app
```

Run frontend checks:

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

For desktop runtime changes:

```bash
cd frontend
npm run tauri:dev
```

## 3) Feature-Specific Smoke Tests

## Document CRUD + search

1. Create doc in app.
2. Edit title/body/tags.
3. Confirm appears in list and search.
4. Delete doc and confirm moved to `.trash`.

## Folder operations

1. Create folder.
2. Move doc to folder.
3. Rename folder.
4. Delete folder and verify cache/list consistency.

## Embedding startup

1. Launch app fresh.
2. Observe startup gate progress.
3. Confirm app proceeds when model status reaches ready.
4. Verify retry path on forced failure.

## CLI JSON contract

1. `tentacle init --json`
2. `tentacle status --json`
3. `tentacle search "..." --json`
4. invalid/deferred command check error envelope + exit code

## 4) Release/Distribution Validation

CLI:

- `cargo build -p tentacle-cli --release`
- run `./target/release/tentacle --help`

Desktop:

- `cd frontend && npm run tauri:build`
- validate output bundles in `frontend/src-tauri/target/release/bundle/`

CI workflows to watch:

- `.github/workflows/cli-release.yml`
- `.github/workflows/app-release.yml`

## 5) Known Validation Gaps

1. No dedicated frontend unit/component test suite.
2. No end-to-end UI automation for Tauri flows.
3. Limited automated checks for Supabase-integrated auth/notification paths.
4. Limited regression harness for ranking quality over large corpora.

## 6) Optional Stress and Performance Checks

Synthetic corpus generator:

- `scripts/seed_stresstest_data.sh`

Use it to:

1. seed many realistic markdown docs,
2. run reindex/search repeatedly,
3. observe latency and ranking stability.

## 7) Contributor Rule of Thumb

If your PR changes behavior in CLI, core, or Tauri command contracts, include:

1. at least one automated test adjustment, and
2. a short manual smoke checklist in the PR description.
