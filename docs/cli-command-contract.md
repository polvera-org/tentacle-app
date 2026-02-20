# CLI Command Contract

This document is the behavioral contract for `tentacle` (`cli/` crate), especially for agent automation.

## 1) Global CLI Contract

Binary:

- `tentacle`

Global flags:

- `--json`: emit machine-readable JSON payloads
- `--help`, `--version`

Output contract:

- Success payloads are command-specific and `snake_case`.
- Errors in `--json` mode always use:

```json
{
  "error": {
    "code": "invalid_arguments",
    "message": "...",
    "suggestion": "..."
  }
}
```

## 2) Command Availability

Implemented commands:

- `init`
- `config [get|set]`
- `status`
- `reindex`
- `list`
- `search`
- `read`
- `create`
- `tag`
- `folder list|create|rename|delete`

Deferred (intentionally not implemented yet):

- `edit`
- `import`
- `export`
- `delete`

Deferred commands return `not_implemented` with exit code `4`.

## 3) Config Keys

Supported keys for `config get/set`:

- `documents_folder` (alias accepted: `storage_path` on parse)
- `editor`
- `default_folder`
- `auto_tag` (`true|false|1|0|yes|no|on|off`)

Defaults when unset:

- `documents_folder`: `~/Tentacle`
- `editor`: `vi`
- `default_folder`: `inbox`
- `auto_tag`: `true`

## 4) Command Semantics

## `init`

- Ensures app data dir and `config.db`.
- Initializes `documents_folder` default if missing.
- Ensures cache DB can open for configured folder.

## `status`

- Reads index stats from `KnowledgeBaseService::status`.
- JSON includes docs/folders/tags/last indexed/index size.

## `reindex [--folder <path>]`

- Rebuilds cache from markdown files.
- Syncs embeddings in batch.
- Non-JSON mode shows progress bars on TTY.

## `list [--folder --limit --sort --desc]`

- Enumerates stored docs from filesystem store.
- Default sort: modified descending.

## `search <query> [--folder --tags --limit --snippets]`

- Uses hybrid search from core knowledge base.
- `--tags` is comma-separated AND filter.
- `--snippets` performs extra read pass for snippet extraction.

## `read <document_id> [--metadata]`

- Returns full document body.
- `--metadata` adds title/folder/tags/modified in text mode.

## `create [--title --folder --tags]`

Input behavior:

- If stdin is piped, body is read from stdin.
- If stdin is TTY, opens configured editor with temp markdown file.

Post-create behavior:

1. Writes markdown document via `document_store`.
2. Attempts auto-tagging (non-fatal).
3. Triggers folder-scope cache+embedding sync.

`--json` response includes `auto_tagging` payload:

- `attempted`
- `applied_tags`
- `skipped_reason` (optional)
- `warning` (optional)

## `tag <document_id> [tags] [--remove|--replace]`

- No tags argument: read current tags.
- With tags: add/remove/replace semantics.
- Triggers folder-scope cache+embedding sync.

## `folder` subcommands

- `folder list`
- `folder create <name>`
- `folder rename <old_name> <new_name>`
- `folder delete <name> [--force]`

Special behavior for `folder delete`:

- Refuses to delete `inbox` (default move target).
- Moves affected documents to `inbox` before deletion.
- Non-interactive sessions require `--force`.

## 5) Exit Codes

Mapped in `cli/src/errors.rs`:

- `0`: success/help/version
- `1`: general
- `2`: document not found
- `3`: folder not found
- `4`: invalid arguments or not implemented
- `5`: permission denied

## 6) Agent-Safe Usage Guidance

1. Prefer `--json` for all automation.
2. Treat absent/empty optional fields as valid.
3. Handle non-fatal `create.auto_tagging.warning` without failing pipeline.
4. Do not parse human output tables.
5. Expect deterministic stable error envelope.

## 7) Known Compatibility Constraints

- `documents_folder` must be configured (`init` + optional `config set`) before most commands.
- Query/search behavior depends on local cache freshness; run `reindex` when operating directly on markdown files outside CLI.
