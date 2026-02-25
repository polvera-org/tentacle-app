# <img src="frontend/public/tentacle-spiral.png" width="36" valign="middle" alt="Tentacle Logo" /> Tentacle

**Your notes, captured effortlessly and searchable by meaning — not just keywords.**

Capture, organize, and retrieve your knowledge with AI-powered semantic search. Local-first. No cloud required.

[Download the App](#download) · [Install the CLI](#cli) · [Agent Integration](#agent-integration) · [Quick Start](#quick-start)

</div>

---

## The Problem

Your notes are scattered across apps that can't talk to each other. Search only works if you remember the exact words you used. And every "AI-powered" tool wants to send your data to someone else's cloud.

**Tentacle fixes this.**

A native desktop app for capturing and organizing your knowledge. A Rust CLI for agents and automation. Both use the same local files, the same semantic index, and neither requires a cloud account.

---

## Download

Native desktop app for macOS, Windows, and Linux.

| Platform | Download | Requirements |
|---|---|---|
| 🍎 **macOS** | [Download .dmg](https://github.com/polvera/tentacle-app/releases/latest) | macOS 11 (Big Sur)+ |
| 🪟 **Windows** | [Download .exe](https://github.com/polvera/tentacle-app/releases/latest) | Windows 10 (1809)+ |
| 🐧 **Linux** | [Download .AppImage](https://github.com/polvera/tentacle-app/releases/latest) | Ubuntu 20.04 / Fedora 36+ |

### What You Get

- **Rich text editor** — write and edit notes with a full Tiptap editor
- **Semantic search** — find notes by meaning, not just keywords ("auth flow" finds "login system")
- **Auto-tagging** — AI categorizes your notes on save (optional BYOK)
- **Voice capture** — record thoughts, get instant transcription
- **Local-first storage** — plain markdown files in a folder you choose
- **Fast** — cold start under 3 seconds, no login required

### First Launch

1. Open Tentacle
2. Go to **Settings** → choose a local documents folder
3. (Optional) Add OpenAI API key for auto-tagging
4. Start creating notes — they're saved as `.md` files in that folder
5. Search across everything semantically from the search bar

Your notes are plain markdown. Use any editor alongside Tentacle. Nothing is locked in.

---

## Agent Integration (CLI)

Tentacle ships a Rust CLI (`tentacle`) for terminal workflows, built for AI agents. Every command supports `--json` output for easy piping.

### Install

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/polvera/tentacle-app/releases/latest/download/tentacle-installer.sh | sh

# Windows
irm https://github.com/polvera/tentacle-app/releases/latest/download/tentacle-installer.ps1 | iex

# Rust users
cargo install --git https://github.com/polvera/tentacle-app --locked tentacle-cli
```

Direct binary archives available on each [GitHub release](https://github.com/polvera/tentacle-app/releases) for aarch64-apple-darwin, x86_64-apple-darwin, x86_64-unknown-linux-gnu, and x86_64-pc-windows-msvc.

### Quick Start

```bash
# Initialize Tentacle in the current directory
tentacle init

# Add your existing notes
tentacle add ./my-notes/

# Search by meaning, not keywords
tentacle search "how we handle auth"

# Create a note from the terminal
echo "Meeting notes: decided to use OAuth2 for the API" | tentacle create --title "Auth Decision" --folder inbox
```

### Non-Interactive Pipelines

```bash
# Pipe content directly
cat meeting-notes.md | tentacle create --title "Standup 2026-02-23" --folder inbox --json

# Check status programmatically
tentacle status --json
```

The CLI and desktop app share the same storage format. Use both — your notes stay in sync because they're the same files.

---

## Who It's For

### 🔧 Engineers who outgrew Apple Notes
You've got notes in six apps and none of them talk to each other. Tentacle works on plain markdown files in a folder. Bring your own editor. Search everything semantically. Give your coding agents persistent memory.

### 🌪️ Founders drowning in ideas
Voice memos, meeting notes, shower thoughts — scattered everywhere. Tentacle captures and auto-organizes so nothing falls through the cracks.

### 🔬 Researchers buried in data
Papers, references, project notes piling up. Tentacle's semantic search surfaces the relevant context when you need it, not when you remember the exact filename.

---

## How It Works

```
Your Files (markdown) → Local Embeddings → Semantic Index → Search by Meaning
```

- Notes stored as **plain markdown files** in a folder you choose
- Embeddings computed and cached **locally** — no external API calls
- Semantic index stored in `.document-data.db` alongside your files
- Soft delete moves files to `.trash/` — nothing is permanently lost
- Optional BYOK auto-tagging enriches notes on save while preserving your manual tags
- No internet required for local document workflows

---

## Tech Stack

- **Desktop App:** Tauri v2 (Rust backend) + Next.js 16 + TypeScript + Tailwind CSS + Tiptap editor
- **CLI:** Rust (fast cold start, single binary)
- **Embeddings:** Local computation, no external dependencies
- **Storage:** Plain markdown files + SQLite semantic index
- **Cloud (coming soon):** Optional Supabase sync for cross-device access

---

## Project Structure

```
tentacle-app/
├── frontend/                # Next.js application
│   ├── app/                 # App router pages
│   ├── components/          # React components
│   ├── lib/                 # Utilities, hooks
│   ├── src-tauri/           # Tauri Rust backend
│   │   ├── src/main.rs      # Rust entry point
│   │   └── tauri.conf.json  # Tauri configuration
│   └── package.json
├── specs/                   # Specification documents
├── .github/workflows/       # CI/CD pipelines
├── BUILD.md                 # Build instructions
├── CONTRIBUTING.md          # Contribution guidelines
└── README.md
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| macOS: app won't open | Right-click → Open to bypass Gatekeeper on first launch |
| Windows: SmartScreen warning | Click "More info" → "Run anyway" |
| `tentacle: command not found` | Restart your shell or add the install path to `$PATH` |
| Search returns no results | Run `tentacle init` first, then `tentacle add ./your-notes/` |
| Documents don't load in app | Open Settings and select a valid local folder |
| Build errors on macOS | `xcode-select --install` then `rustup update stable` |
| Build errors on Windows | Install Visual C++ Build Tools + WebView2 runtime |
| Build errors on Linux | Install deps from [BUILD.md](BUILD.md) |

For more help, see [BUILD.md](BUILD.md) or [open an issue](https://github.com/polvera/tentacle-app/issues).

---

## Contributing

Issues and pull requests welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on setup, code style, and the PR process.

## Documentation

- [BUILD.md](BUILD.md) — Build instructions for all platforms
- [cli/README.md](cli/README.md) — CLI installation and agent workflow examples
- [specs/](specs/) — Technical specifications
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

**[tentaclenote.app](https://tentaclenote.app)** · Built by [Nicolas](https://github.com/polvera)

<br>

*Waiting for cloud sync? Join the [waitlist](https://tentaclenote.app/waitlist).*

</div>