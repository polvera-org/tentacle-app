# Development Setup Modes

This guide defines the supported ways to work on the repo, with exact commands that match current manifests.

## 1) Prerequisites

Required on all platforms:

- Node.js 20+
- npm 10+
- Rust stable toolchain
- Git

Platform-specific dependencies for desktop builds are in `BUILD.md`.

## 2) Choose a Working Mode

## Mode A: Full Desktop App (Recommended)

Use this mode for most feature work (documents, editor, search, settings, embeddings).

```bash
cd frontend
npm ci
npm run tauri:dev
```

What this starts:

- Next.js dev server (`beforeDevCommand` in Tauri config)
- Rust Tauri backend
- Native desktop window

After first launch:

1. Open Settings.
2. Choose documents folder.
3. Add OpenAI key only if testing voice/auto-tagging.

## Mode B: CLI Development

Use this mode for automation and agent workflows.

```bash
# from repo root
cargo run -p tentacle-cli -- --help
cargo run -p tentacle-cli -- init --json
cargo run -p tentacle-cli -- status --json
```

Typical local setup:

```bash
cargo run -p tentacle-cli -- config set documents_folder ~/Tentacle
cargo run -p tentacle-cli -- reindex --json
cargo run -p tentacle-cli -- search "test query" --json
```

## Mode C: Core Library Development

Use this when changing shared Rust logic used by both CLI and desktop app.

```bash
# from repo root
cargo check -p tentacle-core
cargo test -p tentacle-core
```

If changes affect command wiring:

```bash
cargo check -p tentacle-cli
cargo check -p app
```

## Mode D: Frontend-Only Browser Preview (Limited)

Use only for UI styling/layout work that does not require local filesystem or Tauri commands.

```bash
cd frontend
npm ci
npm run dev
```

Important limitation:

- Document CRUD/search/settings integrations rely on Tauri and will fail or no-op in plain browser mode.

## 3) Environment Variables

## Required for local-first workflows

None.

## Optional (feature-dependent)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_WEBSITE_URL` (used by update popup download URL)
- `OPENAI_API_KEY` (used by CLI auto-tagging fallback)

Notes:

- Desktop UI stores OpenAI API key and input device in local config DB via Tauri `set_config`.
- Missing Supabase env vars trigger placeholder client behavior for build/runtime fallback.

## 4) Daily Verification Commands

Run before opening a PR for mixed Rust/frontend changes:

```bash
# repo root
cargo test -p tentacle-core
cargo test -p tentacle-cli
```

```bash
# frontend
cd frontend
npm run lint
npm run build
```

There is no `npm run type-check` script currently; use:

```bash
cd frontend
npx tsc --noEmit
```

## 5) Build and Release Local Smoke

Desktop production bundle:

```bash
cd frontend
npm run tauri:build
```

CLI release binary (local):

```bash
cargo build -p tentacle-cli --release
./target/release/tentacle --version
```

## 6) Common Setup Pitfalls

- Running frontend in browser and expecting local file operations to work.
- Missing Linux desktop dependencies for Tauri/WebKit.
- Stale assumptions from older docs (always verify against `package.json`, `Cargo.toml`, and source).
- Forgetting to configure `documents_folder` before CLI status/reindex/search.
