# Tentacle

Voice-first note-taking with automatic semantic organization.

## What is Tentacle?

Tentacle captures your thoughts via voice, transcribes them instantly, and automatically organizes them using AI-powered semantic analysis. Built for consultants, researchers, founders, and anyone who needs frictionless knowledge capture.

**Available as a native desktop application for macOS, Windows, and Linux.**

## Download

[Download the latest release](https://github.com/polvera/tentacle-app/releases)

- **macOS**: Download `.dmg` file (macOS 11+)
- **Windows**: Download `.exe` installer (Windows 10+)
- **Linux**: Download `.AppImage` (Ubuntu 20.04+)

### Installation

#### macOS
1. Download the `.dmg` file from releases
2. Open the DMG and drag Tentacle to your Applications folder
3. Launch from Applications (first launch: right-click → Open to bypass Gatekeeper if unsigned)

#### Windows
1. Download the `.exe` installer from releases
2. Run the installer (you may see a SmartScreen warning - click "More info" → "Run anyway")
3. Launch from Start Menu or Desktop shortcut

#### Linux
1. Download the `.AppImage` file from releases
2. Make it executable: `chmod +x Tentacle*.AppImage`
3. Run: `./Tentacle*.AppImage`

## Core Philosophy

**Capture → Transcribe → Organize**

- **Frictionless voice capture** - Zero friction recording
- **Automatic organization** - AI categorizes and links notes
- **Privacy-first** - Local-first architecture, you own your data
- **Native desktop app** - Fast, secure, cross-platform

## System Requirements

- **macOS**: macOS 11 (Big Sur) or higher
- **Windows**: Windows 10 (version 1809) or higher
- **Linux**: Ubuntu 20.04, Fedora 36, or equivalent
- **Network**: Not required for local document editing. Internet is only needed for optional cloud features.

## Features

- Rich text document editor with Tiptap
- Local-first document create, read, update, delete operations
- Markdown files stored directly in a user-selected folder
- Soft delete behavior (documents move to `.trash/`)
- Cross-platform desktop application
- Fast cold start (under 3 seconds)
- No required login for local document workflows
- Optional Supabase integration for future cloud sync/auth flows

## Tech Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS
- **Desktop**: Tauri v2 (Rust backend)
- **Local Storage**: Markdown files on local filesystem via Tauri FS plugin
- **Editor**: Tiptap
- **Optional Cloud (future)**: Supabase (PostgreSQL + pgvector + Auth)

## Project Structure

```
tentacle-app/
├── frontend/              # Next.js application
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── lib/              # Utilities, hooks
│   ├── src-tauri/        # Tauri Rust backend
│   │   ├── src/main.rs  # Rust entry point
│   │   └── tauri.conf.json  # Tauri configuration
│   └── package.json
├── specs/                # Specification documents
├── .github/workflows/    # CI/CD pipelines
├── BUILD.md              # Build instructions for developers
├── CONTRIBUTING.md       # Contribution guidelines
└── README.md             # This file
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed setup instructions.

### Quick Start

```bash
# Clone repository
git clone https://github.com/polvera/tentacle-app.git
cd tentacle-app

# Install dependencies
cd frontend
npm install

# Run development server
npm run tauri:dev
```

The desktop application will launch with hot reload enabled.

On first launch:
1. Open **Settings**
2. Choose a local documents folder
3. Create/edit documents (saved as `.md` files in that folder)

### Environment Variables

Environment variables are optional for local-first documents mode.

If you want to experiment with Supabase-backed features, copy `.env.example` to `.env.local` in the `frontend/` directory and set:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Building for Production

See [BUILD.md](BUILD.md) for comprehensive build instructions.

```bash
cd frontend
npm run tauri:build
```

Installers will be generated in `frontend/src-tauri/target/release/bundle/`.

## Troubleshooting

### Application Won't Launch
- Check console output for errors
- Verify Rust and Node dependencies are installed
- If documents do not load, open Settings and select a valid local folder
- Supabase environment variables are only required for optional cloud features
- Try running with debug logs: `RUST_LOG=debug npm run tauri:dev`

### Build Errors on macOS
- Install Xcode Command Line Tools: `xcode-select --install`
- Update Rust: `rustup update stable`

### Build Errors on Windows
- Install Visual C++ Build Tools
- Ensure WebView2 runtime installed (pre-installed on Windows 11)

### Build Errors on Linux
- Install required dependencies (see BUILD.md)
- Update system: `sudo apt update && sudo apt upgrade`

For more troubleshooting help, see [BUILD.md](BUILD.md) or open an issue.

## Contributing

This is a personal project currently under active development. Issues and pull requests welcome!

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Setting up your development environment
- Running the app locally
- Code style guidelines
- Pull request process

## Documentation

- [BUILD.md](BUILD.md) - Comprehensive build instructions for all platforms
- [specs/TEN-8-tauri-desktop-app/](specs/TEN-8-tauri-desktop-app/) - Technical specifications
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

## License

MIT License - see LICENSE file for details
