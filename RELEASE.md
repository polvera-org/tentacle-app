# Release Guide

This guide walks you through creating releases for both the Tentacle CLI and Desktop App.

## Quick Release Checklist

- [ ] Update version numbers
- [ ] Test builds locally
- [ ] Create and push git tag
- [ ] Monitor GitHub Actions
- [ ] Publish draft release
- [ ] Update landing page with download links

## Version Numbering

We use semantic versioning (MAJOR.MINOR.PATCH):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes

Current versions:
- CLI: Check `cli/Cargo.toml`
- Desktop App: Check `frontend/src-tauri/tauri.conf.json` and `frontend/src-tauri/Cargo.toml`

## Release Process

### 1. Update Version Numbers

Before creating a release, update the version in these files:

#### For CLI Release:
```bash
# Update cli/Cargo.toml
version = "0.1.0"  # Change this
```

#### For Desktop App Release:
```bash
# Update frontend/src-tauri/tauri.conf.json
"version": "0.1.0"  # Change this

# Update frontend/src-tauri/Cargo.toml
version = "0.1.0"  # Change this
```

Then update the lockfile:
```bash
cargo update -p tentacle-cli  # For CLI
# or
cargo update -p tentacle-app  # For desktop app
```

Commit these changes:
```bash
git add .
git commit -m "Bump version to X.Y.Z"
git push origin main
```

### 2. Create and Push Tags

#### For CLI Release:
```bash
# Create annotated tag
git tag -a v0.1.0 -m "Release CLI v0.1.0"

# Push the tag
git push origin v0.1.0
```

#### For Desktop App Release:
```bash
# Create annotated tag with "app-" prefix
git tag -a app-v0.1.0 -m "Release Desktop App v0.1.0"

# Push the tag
git push origin app-v0.1.0
```

**Important**: The tag prefix determines which workflow runs:
- `v*` or `tentacle-v*` → CLI release workflow
- `app-v*` → Desktop app release workflow

### 3. Monitor GitHub Actions

After pushing the tag, GitHub Actions will automatically:

1. **Build for all platforms** (in parallel):
   - macOS ARM (M1/M2/M3)
   - macOS Intel
   - Linux x86_64
   - Windows x86_64

2. **Create release artifacts**:

   **CLI artifacts:**
   - Shell installer scripts (.sh for macOS/Linux, .ps1 for Windows)
   - Compressed binaries for each platform

   **Desktop app artifacts:**
   - macOS: `.dmg` installers
   - Windows: `.msi` and `.exe` installers
   - Linux: `.AppImage` and `.deb` packages

3. **Create a draft GitHub release** with all artifacts attached

Monitor the workflow:
```bash
# Open in browser
https://github.com/YOUR_USERNAME/tentacle/actions

# Or use GitHub CLI
gh run list --workflow=cli-release.yml
gh run list --workflow=app-release.yml
```

### 4. Publish the Release

Once the workflow completes:

1. Go to GitHub Releases: `https://github.com/YOUR_USERNAME/tentacle/releases`
2. Find your draft release
3. Edit the release notes if needed
4. Click **"Publish release"**

### 5. Get Download Links

After publishing, your release will have direct download links:

```
# CLI installers
https://github.com/YOUR_USERNAME/tentacle/releases/download/v0.1.0/tentacle-installer.sh
https://github.com/YOUR_USERNAME/tentacle/releases/download/v0.1.0/tentacle-installer.ps1

# Desktop app installers
https://github.com/YOUR_USERNAME/tentacle/releases/download/app-v0.1.0/Tentacle_0.1.0_aarch64.dmg
https://github.com/YOUR_USERNAME/tentacle/releases/download/app-v0.1.0/Tentacle_0.1.0_x64.dmg
https://github.com/YOUR_USERNAME/tentacle/releases/download/app-v0.1.0/Tentacle_0.1.0_x64-setup.exe
https://github.com/YOUR_USERNAME/tentacle/releases/download/app-v0.1.0/Tentacle_0.1.0_x64_en-US.msi
https://github.com/YOUR_USERNAME/tentacle/releases/download/app-v0.1.0/tentacle_0.1.0_amd64.AppImage
https://github.com/YOUR_USERNAME/tentacle/releases/download/app-v0.1.0/tentacle_0.1.0_amd64.deb
```

Use these URLs on your landing page!

## Local Testing (Optional but Recommended)

Before creating a release, test the builds locally:

### Test CLI Build:
```bash
# Build for your current platform
cd cli
cargo build --release

# Test the binary
./target/release/tentacle --version
./target/release/tentacle --help
```

### Test Desktop App Build:
```bash
# Build the Tauri app
cd frontend
npm install
npm run tauri:build

# The bundled app will be in:
# macOS: src-tauri/target/release/bundle/macos/
# Windows: src-tauri/target/release/bundle/nsis/
# Linux: src-tauri/target/release/bundle/appimage/
```

## Troubleshooting

### Build Fails on GitHub Actions

1. Check the workflow logs in GitHub Actions
2. Common issues:
   - Missing dependencies (especially on Linux)
   - Version mismatches in Cargo.toml files
   - Network timeouts downloading dependencies

### Release Doesn't Trigger

1. Ensure you pushed the tag: `git push origin <tag-name>`
2. Check the tag format matches the workflow trigger pattern
3. Verify GitHub Actions are enabled in repository settings

### Missing Artifacts

1. Check if all platform builds completed successfully
2. Verify the artifact upload steps didn't fail
3. Look for "if-no-files-found: error" in the logs

## Manual Release (Advanced)

If you need to create a release manually:

### CLI:
```bash
cargo install cargo-dist --locked
cargo dist build --artifacts=all --output-format=json
```

### Desktop App:
```bash
cd frontend
npm run tauri:build
# Installers will be in src-tauri/target/release/bundle/
```

## First Release Notes Template

For your v0.1.0 release, consider this template:

```markdown
# Tentacle v0.1.0 - Initial Release

We're excited to announce the first public release of Tentacle! 🎉

## What is Tentacle?

[Brief description of what Tentacle does]

## Features

- Local-first knowledge base
- Semantic search powered by embeddings
- Auto-tagging with AI
- Cross-platform (macOS, Windows, Linux)
- Both CLI and Desktop GUI available

## Installation

### Desktop App
Download the installer for your platform below.

### CLI
macOS/Linux:
\`\`\`bash
curl -fsSL https://github.com/YOUR_USERNAME/tentacle/releases/download/v0.1.0/tentacle-installer.sh | sh
\`\`\`

Windows (PowerShell):
\`\`\`powershell
irm https://github.com/YOUR_USERNAME/tentacle/releases/download/v0.1.0/tentacle-installer.ps1 | iex
\`\`\`

## What's Next?

Check out our [README](https://github.com/YOUR_USERNAME/tentacle) for documentation.

Report issues: https://github.com/YOUR_USERNAME/tentacle/issues
```

## Updating Your Landing Page

Add download buttons with these links:

```html
<!-- Desktop App -->
<a href="https://github.com/YOUR_USERNAME/tentacle/releases/latest">
  Download for macOS
</a>
<a href="https://github.com/YOUR_USERNAME/tentacle/releases/latest">
  Download for Windows
</a>
<a href="https://github.com/YOUR_USERNAME/tentacle/releases/latest">
  Download for Linux
</a>

<!-- CLI -->
<a href="https://github.com/YOUR_USERNAME/tentacle/releases/latest">
  Install CLI
</a>
```

Or use GitHub's "latest release" badge:
```markdown
![GitHub release (latest by date)](https://img.shields.io/github/v/release/YOUR_USERNAME/tentacle)
```
