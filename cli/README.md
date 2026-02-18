# Tentacle CLI

`tentacle` is the command-line interface for Tentacle knowledge workflows, designed for humans and coding agents.

## Install

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/polvera/tentacle-app/releases/latest/download/tentacle-installer.sh | sh
```

```powershell
# Windows
irm https://github.com/polvera/tentacle-app/releases/latest/download/tentacle-installer.ps1 | iex
```

```bash
# Rust developers
cargo install --git https://github.com/polvera/tentacle-app --locked tentacle-cli
```

## First run

```bash
tentacle init --json
tentacle status --json
```

## Agent workflows

### 1) Search -> read -> tag

```bash
results=$(tentacle search "api design" --limit 3 --json)
doc_id=$(echo "$results" | jq -r '.results[0].id')

tentacle read "$doc_id" --json | jq -r '.content'
tentacle tag "$doc_id" "api,reviewed,agent" --json
```

### 2) Create from stdin (non-interactive)

```bash
echo "# Sync Notes\n\n- Added migration plan" | \
  tentacle create --title "Sync Notes" --folder inbox --tags "meetings,sync" --json
```

### 3) JSON pipeline for batch processing

```bash
tentacle list --json | \
  jq -r '.documents[] | select(.tags | length == 0) | .id' | \
  while read -r doc_id; do
    tentacle tag "$doc_id" "needs-review" --json
  done
```

## Useful flags

- `--json`: machine-friendly output for pipelines and agents
- `--help`: command usage
- `--version` / `-V`: CLI version

## Auto-tagging on `create`

- `tentacle create` can auto-tag new notes when `auto_tag=true` (default).
- API key resolution order: `openai_api_key` in config DB, then `OPENAI_API_KEY` from env.
- If auto-tagging cannot run (missing key, API failure, etc.), note creation still succeeds.
- In `--json` mode, create responses include `auto_tagging` metadata with:
  - `attempted`
  - `applied_tags`
  - `skipped_reason` (optional)
  - `warning` (optional)

## Output contract (JSON)

- Success payloads are command-specific and use `snake_case` fields.
- Errors always use:

```json
{
  "error": {
    "code": "invalid_arguments",
    "message": "...",
    "suggestion": "..."
  }
}
```

This keeps automation deterministic across scripts and agent loops.
