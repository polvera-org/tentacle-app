<div align="center">

# 🐙 Tentacle CLI

**Semantic memory for your AI agents. Local-first. No vector DB.**

Your notes, searchable by meaning — not just keywords.

[Install](#install) · [Quick Start](#quick-start) · [Agent Integration](#agent-integration) · [Desktop App](#desktop-app)

</div>

---

## The Problem

Your AI agents forget everything between sessions. Your notes are scattered across apps that can't talk to each other. And every "smart search" solution wants you to spin up a vector database, manage embeddings pipelines, and send your data to someone else's cloud.

**Tentacle fixes this in one command.**

## What It Does

Tentacle is a local-first CLI that gives you (and your AI agents) semantic search over your notes and documents.

- **Search by meaning** — find notes about "authentication flow" even if you wrote "login system"
- **Auto-tags on save** — stop manually organizing; AI categorizes for you
- **Works with any agent** — Cursor, Claude Code, Windsurf, or any tool that can call a CLI
- **Your data stays local** — markdown files in a folder you choose. No cloud required. No API keys for core features.

## Install

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/polvera-org/tentacle-app/releases/latest/download/tentacle-installer.sh | sh

# Windows
irm https://github.com/polvera-org/tentacle-app/releases/latest/download/tentacle-installer.ps1 | iex

# Rust users
cargo install --git https://github.com/polvera-org/tentacle-app --locked tentacle-cli
```

Direct binary archives available on each [GitHub release](https://github.com/polvera-org/tentacle-app/releases) for aarch64-apple-darwin, x86_64-unknown-linux-gnu, and x86_64-pc-windows-msvc.

## Quick Start

```bash
# Initialize Tentacle
tentacle init

# Search by meaning, not keywords
tentacle search "how we handle auth"

# Create a note from the terminal
echo "Meeting notes: decided to use OAuth2 for the API" | tentacle create --title "Auth Decision" --folder inbox
```

That's it. No database to configure. No embeddings to manage. Just your files, searchable by meaning.

## Who It's For

### 🔧 Engineers who outgrew Apple Notes
You've got notes in six apps and none of them talk to each other. Tentacle works on plain markdown files in a folder. Bring your own editor. Search everything semantically.

### 🌪️ Founders drowning in ideas
Voice memos, meeting notes, shower thoughts — scattered everywhere. Tentacle captures and auto-organizes so nothing falls through the cracks.

### 🔬 Researchers buried in data
Papers, references, project notes piling up. Tentacle's semantic search surfaces the relevant context when you need it, not when you remember the exact filename.

## Agent Integration

Tentacle is built for AI agents. Every command supports `--json` output for easy piping.

### MCP Server (Cursor, Claude Code, Windsurf)

Tentacle runs as an MCP server — any agent that supports the Model Context Protocol gets semantic memory for free.

### Pipeline Example

```bash
# Agent searches for relevant context
doc_id=$(tentacle search "voice capture latency" --limit 1 --json | jq -r '.results[0].id')

# Reads the full document
tentacle read "$doc_id" --json | jq -r '.content'

# Tags it for tracking
tentacle tag "$doc_id" "reviewed,agent-checked" --json
```

### Non-Interactive Pipelines

```bash
# Pipe content directly
cat meeting-notes.md | tentacle create --title "Standup 2026-02-23" --folder inbox --json

# Check status programmatically
tentacle status --json
```

## How It Works

```
Your Files (markdown) → Local Embeddings → Semantic Index → Search by Meaning
```

- Notes stored as **plain markdown files** in a folder you choose
- Embeddings computed and cached **locally** (no external API calls)
- Semantic index stored in `.document-data.db` alongside your files
- Soft delete moves files to `.trash/` — nothing is permanently lost
- Optional BYOK auto-tagging enriches notes on save while preserving your manual tags

## Desktop App

> **Coming soon.** A native desktop app (macOS, Windows, Linux) with voice capture, rich text editing, and full semantic search — built on Tauri v2.
>
> [Join the waitlist →](https://tentaclenote.app/waitlist)

The CLI and desktop app share the same local storage format. Start with the CLI today, and the desktop app will work with your existing notes when it lands.

## Tech Stack

- **CLI:** Rust (fast cold start, single binary)
- **Embeddings:** Local computation, no external dependencies
- **Storage:** Plain markdown files + SQLite index
- **Desktop (coming soon):** Tauri v2 + Next.js + Tiptap editor
- **Cloud (coming soon):** Optional Supabase sync for cross-device access

## Development

```bash
git clone https://github.com/polvera-org/tentacle-app.git
cd tentacle-app

# CLI development
cargo build --release
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup details and guidelines.
See [BUILD.md](BUILD.md) for platform-specific build instructions.

## Troubleshooting

| Issue | Fix |
|---|---|
| `tentacle: command not found` | Restart your shell or add the install path to `$PATH` |
| Search returns no results | Run `tentacle init` first, then `tentacle create --title "First note"` |
| Build errors on macOS | `xcode-select --install` then `rustup update stable` |
| Build errors on Linux | Install deps from BUILD.md, `sudo apt update && sudo apt upgrade` |

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

**[tentaclenote.app](https://tentaclenote.app)** · Built by [Nicolas](https://github.com/polvera)

</div>
