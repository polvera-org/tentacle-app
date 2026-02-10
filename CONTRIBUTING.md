# Contributing to Tentacle

Thank you for your interest in contributing to Tentacle! This document provides guidelines for setting up your development environment and contributing to the project.

## Table of Contents

1. [Development Environment Setup](#development-environment-setup)
2. [Running the App Locally](#running-the-app-locally)
3. [Project Architecture](#project-architecture)
4. [Code Style Guidelines](#code-style-guidelines)
5. [Testing](#testing)
6. [Pull Request Process](#pull-request-process)
7. [Commit Messages](#commit-messages)
8. [Reporting Issues](#reporting-issues)

---

## Development Environment Setup

### Prerequisites

Install the following software before starting:

1. **Node.js**: Version 20.x or higher
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify: `node --version`

2. **Rust**: Version 1.70 or higher
   ```bash
   # Install via rustup
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env

   # Verify
   rustc --version
   cargo --version
   ```

3. **Git**: For version control
   - macOS: Pre-installed or via Xcode Command Line Tools
   - Windows: Download from [git-scm.com](https://git-scm.com/)
   - Linux: `sudo apt install git`

### Platform-Specific Dependencies

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install
```

#### Windows
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)
- Select "Desktop development with C++" workload
- WebView2 is pre-installed on Windows 11

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.0-dev \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  build-essential
```

#### Linux (Fedora)
```bash
sudo dnf install -y \
  webkit2gtk4.0-devel \
  openssl-devel \
  gtk3-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  gcc \
  gcc-c++
```

### Clone the Repository

```bash
git clone https://github.com/polvera/tentacle-app.git
cd tentacle-app
```

### Install Dependencies

```bash
cd frontend
npm install
```

### Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` with your credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. Get Supabase credentials:
   - Create a free account at [supabase.com](https://supabase.com)
   - Create a new project
   - Copy URL and anon key from project settings

---

## Running the App Locally

### Development Mode

Start the application with hot reload:

```bash
cd frontend
npm run tauri:dev
```

**First run notes**:
- Initial Rust compilation takes 2-5 minutes
- Subsequent runs are much faster (incremental builds)
- The desktop application window will open automatically
- Changes to frontend code hot-reload instantly
- Changes to Rust code require manual restart

### Development Workflow

1. Make changes to frontend code in `frontend/app/`, `frontend/components/`, or `frontend/lib/`
2. Save the file
3. The app automatically reloads to show your changes
4. Check the DevTools console for any errors (right-click → Inspect)

### Running Specific Commands

**Lint code**:
```bash
npm run lint
```

**Type checking**:
```bash
npm run type-check
```

**Build production version**:
```bash
npm run tauri:build
```

See [BUILD.md](BUILD.md) for detailed build instructions.

---

## Project Architecture

### Tech Stack

- **Frontend**: Next.js 16 with TypeScript and Tailwind CSS
- **Desktop Runtime**: Tauri v2 with Rust
- **Database**: Supabase (PostgreSQL with pgvector)
- **Authentication**: Supabase Auth (client-side)
- **Editor**: Tiptap (rich text editor)

### Directory Structure

```
frontend/
├── app/                    # Next.js app router
│   ├── page.tsx           # Home/landing page
│   ├── login/             # Authentication pages
│   ├── signup/
│   ├── app/               # Main application (protected)
│   │   ├── page.tsx      # Document list
│   │   └── documents/[id]/ # Document editor
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── ui/               # UI primitives
│   └── documents/        # Document-specific components
├── lib/                  # Utilities and shared logic
│   ├── auth/            # Authentication context and client
│   ├── documents/       # Document API and types
│   └── utils/           # Helper functions
├── src-tauri/            # Tauri Rust backend
│   ├── src/main.rs      # Rust entry point
│   ├── tauri.conf.json  # Tauri configuration
│   └── Cargo.toml       # Rust dependencies
└── package.json          # NPM dependencies and scripts
```

### Key Concepts

1. **Static Export**: Next.js runs in static export mode (no SSR)
2. **Client-Side Auth**: All authentication is client-side via Supabase
3. **Direct Database Access**: Frontend talks directly to Supabase (no API routes)
4. **Route Protection**: `AuthContext` handles automatic route protection

### Data Flow

```
User Action → React Component → Supabase Client → Supabase Database
                                    ↓
                              Auth Context (session management)
```

---

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Define types explicitly (avoid `any`)
- Use interfaces for objects with known shapes
- Keep types co-located with their usage

**Example**:
```typescript
// Good
interface Document {
  id: string
  title: string
  body: string
  created_at: string
}

// Avoid
const document: any = { /* ... */ }
```

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract shared logic into custom hooks
- Use client components (`'use client'`) when needed

**Example**:
```typescript
'use client'

import { useState } from 'react'

export function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([])
  // ...
}
```

### File Naming

- Components: PascalCase (e.g., `DocumentEditor.tsx`)
- Utilities: kebab-case (e.g., `format-date.ts`)
- Pages: lowercase (e.g., `page.tsx`)

### Styling

- Use Tailwind CSS utility classes
- Keep custom CSS minimal
- Use CSS modules for component-specific styles
- Follow mobile-first responsive design

### Code Organization

- Group related files together
- Keep files under 300 lines
- Extract complex logic into separate functions
- Add comments for non-obvious code

---

## Testing

### Manual Testing

Before submitting a PR, test the following:

1. **Authentication Flow**:
   - Login with valid credentials
   - Logout
   - Session persists after app restart

2. **Document Operations**:
   - Create new document
   - Edit document title and body
   - Delete document
   - Changes persist after refresh

3. **Error Handling**:
   - Test with network disconnected
   - Verify user-friendly error messages
   - Ensure app doesn't crash

4. **Cross-Platform** (if applicable):
   - Test on target platform (macOS/Windows/Linux)
   - Verify UI renders correctly
   - Check for platform-specific issues

### Automated Testing

Currently, the project uses manual testing. Automated tests are planned for future implementation.

---

## Pull Request Process

### Before Submitting

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Follow code style guidelines
   - Keep commits focused and atomic
   - Test thoroughly

3. **Lint and type-check**:
   ```bash
   npm run lint
   # Fix any errors before committing
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Creating the Pull Request

1. Go to the repository on GitHub
2. Click "New Pull Request"
3. Select your feature branch
4. Fill out the PR template:
   - **Title**: Clear, descriptive summary
   - **Description**: What changed and why
   - **Testing**: How you tested the changes
   - **Screenshots**: For UI changes

### PR Review Process

1. Maintainer will review your code
2. Address any requested changes
3. Once approved, PR will be merged
4. Branch will be deleted after merge

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Changes have been tested locally
- [ ] No console errors or warnings
- [ ] Commit messages are clear and descriptive
- [ ] PR description explains the changes
- [ ] Branch is up to date with main

---

## Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
# Good
feat(editor): add markdown support to document editor
fix(auth): resolve session persistence issue on app restart
docs(readme): update installation instructions for Linux

# Avoid
Update stuff
Fix bug
WIP
```

---

## Reporting Issues

### Before Opening an Issue

1. Search existing issues to avoid duplicates
2. Verify the issue on the latest version
3. Collect relevant information (OS, version, logs)

### Issue Template

When opening an issue, include:

**Bug Reports**:
- Description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (OS, app version)
- Console logs or screenshots

**Feature Requests**:
- Clear description of the feature
- Use case or problem it solves
- Proposed solution (if any)
- Alternatives considered

---

## Getting Help

- **Documentation**: Check [BUILD.md](BUILD.md) for build issues
- **GitHub Issues**: Search existing issues or open a new one
- **Specifications**: Review `specs/` directory for technical details

---

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers and help them learn
- Focus on what is best for the community
- Show empathy towards other contributors

---

## Development Tips

### Performance

- Test cold start time (should be under 3 seconds)
- Monitor memory usage in production builds
- Keep bundle sizes small

### Security

- Never commit `.env.local` or credentials
- Use environment variables for sensitive data
- Follow Supabase security best practices

### Debugging

**Frontend debugging**:
- Right-click → Inspect to open DevTools
- Check Console tab for errors
- Use React DevTools for component inspection

**Rust debugging**:
```bash
RUST_LOG=debug npm run tauri:dev
```

### Hot Reload Issues

If hot reload stops working:
1. Stop the dev server (Ctrl+C)
2. Clear cache: `rm -rf .next/`
3. Restart: `npm run tauri:dev`

---

## Additional Resources

- [Tauri Documentation](https://tauri.app/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tiptap Documentation](https://tiptap.dev/)

---

Thank you for contributing to Tentacle!
