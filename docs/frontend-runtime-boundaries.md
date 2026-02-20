# Frontend Runtime Boundaries

This document defines what frontend code can run in each environment and where contributors should place logic.

## 1) Runtime Targets

The frontend has two practical runtimes:

1. Tauri desktop runtime (primary)
2. Browser-only Next.js dev/runtime (limited)

`frontend/next.config.ts` uses `output: 'export'` (static export).

## 2) Capability Matrix

## Tauri desktop runtime

Available:

- Tauri `invoke` commands
- Tauri FS/dialog/shell plugins
- Local markdown CRUD and folder operations
- Local cache + embeddings via Rust backend

## Browser-only runtime

Available:

- UI rendering and most pure client logic
- Supabase auth pages (if env configured)

Unavailable/limited:

- Local document storage operations that require Tauri (`isTauri()` checks)
- Tauri plugin-backed settings/file pickers

## 3) Tauri-Bound Frontend Modules

These modules expect desktop runtime:

- `frontend/lib/documents/api.ts`
- `frontend/lib/documents/cache.ts`
- `frontend/lib/documents/folders.ts`
- `frontend/lib/documents/embeddings-cache.ts`
- `frontend/lib/settings/documents-folder.ts`
- `frontend/lib/settings/openai-config.ts`
- `frontend/lib/embeddings/model-runtime.ts`

Pattern to preserve:

- Runtime checks occur before local storage operations.
- Errors should be explicit and actionable when invoked outside Tauri.

## 4) Provider Topology in `app/layout.tsx`

Global provider order:

1. `AuthProvider`
2. `AppNotificationsProvider`
3. `EmbeddingModelStartupGate`
4. children + toaster

Implication:

- App routes may be gated by embedding model readiness state before core workflows are shown.

## 5) Auth and Cloud Integration Boundaries

Supabase client (`frontend/lib/auth/supabase-client.ts`):

- Uses env vars when present.
- Falls back to placeholder client for build/runtime resilience.

Auth flows are frontend-only and do not mediate local markdown CRUD.

## 6) Notifications Boundary

Update notifications path:

- Reads from Supabase `notifications` table.
- Compares `version_id` vs local app version.
- Shows popup in provider layer.

This is optional and orthogonal to local document functionality.

## 7) Voice and AI Boundaries

Voice capture (`use-voice-recording`) and frontend auto-tagging:

- Run in browser context inside desktop webview.
- Call OpenAI APIs directly via `fetch`.
- API key is read from local config via Tauri `get_config`.

CLI has separate Rust-side auto-tagging path.

## 8) Contributor Guidelines

1. Keep local file/cache logic behind Tauri-aware service functions in `frontend/lib`.
2. Keep page/components focused on UI and orchestration.
3. If adding a new desktop-only capability, add explicit runtime guard and clear error message.
4. Avoid introducing server-only dependencies into client paths.
5. Update this doc when runtime assumptions change (new plugins, new providers, new environment fallbacks).

## 9) Frequent Pitfalls

- Testing document features in plain browser mode and treating failures as bugs.
- Mixing Supabase/cloud assumptions into local document paths.
- Duplicating business rules in components instead of shared libs/core.
