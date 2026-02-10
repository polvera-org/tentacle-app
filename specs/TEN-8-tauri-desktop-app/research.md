# Research: Tauri Desktop App Integration

## Overview

This document captures research findings for converting the Tentacle Next.js web application into a Tauri-based desktop application.

## Tauri Architecture

### What is Tauri?

Tauri is a framework for building desktop applications using web technologies (HTML, CSS, JavaScript) with a Rust backend. Unlike Electron, Tauri uses the system's native webview instead of bundling Chromium, resulting in smaller bundle sizes and better performance.

**Key Components:**
- **Core**: Rust-based backend providing OS integrations and native APIs
- **Webview**: System webview (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux)
- **IPC**: Inter-process communication between frontend and Rust backend
- **API**: JavaScript bindings for accessing native functionality

### Benefits for Tentacle

1. **Small Bundle Size**: ~5-10MB vs 100MB+ for Electron apps
2. **Security**: Rust's memory safety and explicit capability system
3. **Performance**: No bundled browser, uses native webview
4. **Native Integration**: Easy access to file system, OS dialogs, system tray
5. **Cross-Platform**: Single codebase for macOS, Windows, Linux
6. **Local-First Ready**: Built-in support for local storage, SQLite plugins available

## Next.js Integration with Tauri

### Static Export Requirement

**Critical**: Tauri requires Next.js to be configured for static export because there's no Node.js runtime in the desktop application.

```javascript
// next.config.js
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // For development, point to dev server
  // assetPrefix: isDev ? 'http://localhost:3000' : undefined,
};
```

### Implications of Static Export

**What Works:**
- All client-side React code
- Static Site Generation (SSG) with `getStaticProps`
- Client-side data fetching
- CSS, images, fonts
- Client-side routing

**What Doesn't Work:**
- Server-side rendering (SSR) with `getServerSideProps`
- Next.js API routes (middleware, /api directory)
- Server-side middleware
- Incremental Static Regeneration (ISR)
- Image optimization (must set `unoptimized: true`)
- Dynamic routes need `getStaticPaths` with `fallback: false`

### Impact on Tentacle Codebase

**Current Dependencies:**
- Supabase SSR package (`@supabase/ssr`) - Used for server-side auth
- Next.js middleware (`proxy.ts`) - Used for auth checks
- Server-side Supabase client - Used in middleware

**Required Changes:**
1. **Remove server-side auth**: Migrate from `@supabase/ssr` to `@supabase/supabase-js` client-only
2. **Remove middleware**: Move auth checks to client-side (useEffect, component-level)
3. **Client-only patterns**: Ensure all Supabase calls happen in browser context
4. **Secure storage**: Use Tauri's secure storage API for auth tokens instead of cookies

## Authentication Architecture

### Current Implementation
```typescript
// Uses server-side middleware for auth checks
// frontend/proxy.ts (middleware)
// Uses @supabase/ssr for server-side session management
```

### Tauri-Compatible Implementation

**Option 1: Client-Only Auth (Recommended for Initial Migration)**
```typescript
// Use @supabase/supabase-js directly
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Store session in localStorage (or Tauri secure storage)
```

**Option 2: Tauri Secure Storage (Enhanced Security)**
```typescript
// Use Tauri's plugin-store for secure token storage
import { Store } from '@tauri-apps/plugin-store';

const store = new Store('auth.dat');
await store.set('session', session);
```

**Protected Route Pattern:**
```typescript
// Client-side auth check
useEffect(() => {
  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
    }
  };
  checkAuth();
}, []);
```

## Network Requirements

### Desktop App with Cloud Backend

**IMPORTANT**: This desktop app is NOT a local-only application. It requires network connectivity to function.

**Network Dependencies:**
- **Supabase Authentication**: All login/logout operations require network requests to Supabase servers
- **Database Operations**: Document list, create, read, update, delete all require network requests to Supabase
- **Real-time Subscriptions**: If used, require persistent WebSocket connections to Supabase
- **User Session**: Session management and token refresh require network access

**Offline Behavior:**
- App will NOT work offline in initial implementation
- Network errors should display clear messages: "No internet connection - Tentacle requires network access for authentication and data sync"
- Future enhancement: Local-first architecture with offline support (separate ticket)

**Architecture:**
- Desktop app (Tauri) → Network requests → Supabase cloud backend
- This is expected and intentional behavior
- "Local-first" is a future roadmap item, not part of TEN-8 scope

## Development Workflow

### Project Structure
```
tentacle-app/
├── frontend/              # Next.js application
│   ├── app/              # App router
│   ├── components/       # React components
│   ├── lib/              # Utilities
│   └── package.json
├── src-tauri/            # NEW: Tauri backend
│   ├── src/
│   │   └── main.rs      # Rust entry point
│   ├── Cargo.toml       # Rust dependencies
│   ├── tauri.conf.json  # Tauri configuration
│   └── icons/           # App icons
└── package.json          # Root workspace
```

### Development Commands

**Start Development Server:**
```bash
npm run tauri dev
# This runs both Next.js dev server and Tauri app
```

**Build for Production:**
```bash
npm run tauri build
# Generates platform-specific installers in src-tauri/target/release/bundle/
```

**Hot Reload:**
- Next.js hot reload works normally
- Tauri window reloads automatically when frontend changes
- Rust changes require recompilation (slower)

### Debugging

**Frontend Debugging:**
- Right-click → Inspect Element (opens DevTools)
- Console logs appear in DevTools console
- React DevTools extension works

**Backend Debugging:**
- Rust logs appear in terminal running `tauri dev`
- Use `println!()` or `log` crate in Rust

## Build and Distribution

### Installers Generated

**macOS:**
- `.app` bundle
- `.dmg` disk image
- `.tar.gz` archive

**Windows:**
- `.exe` installer (NSIS)
- `.msi` installer

**Linux:**
- `.deb` package (Debian/Ubuntu)
- `.AppImage` (universal)
- `.rpm` package (Fedora/RHEL)

### Bundle Sizes (Estimated)

- **macOS**: 15-25 MB (uses system WebKit)
- **Windows**: 30-40 MB (includes WebView2 installer)
- **Linux**: 25-35 MB (depends on WebKitGTK)

Much smaller than Electron (100MB+).

### Code Signing

**macOS:**
- Requires Apple Developer account ($99/year)
- Sign with Developer ID Application certificate
- Notarization required for distribution outside Mac App Store

**Windows:**
- Code signing certificate recommended but not required initially
- Windows Defender SmartScreen warning without signature

**Linux:**
- No code signing requirement

## Dependencies and Prerequisites

### Development Environment

**Required:**
- Node.js 18+ (currently using 20)
- Rust 1.70+ (install via rustup)
- System dependencies (platform-specific)

**macOS:**
```bash
# Already have Xcode Command Line Tools
xcode-select --install
```

**Windows:**
```bash
# Microsoft Visual Studio C++ Build Tools
# WebView2 runtime (usually pre-installed on Windows 11)
```

**Linux:**
```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.0-dev \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### NPM Package Changes

**Add:**
- `@tauri-apps/cli` - Tauri CLI for building
- `@tauri-apps/api` - JavaScript API for Tauri
- `@tauri-apps/plugin-store` - Secure storage plugin (optional)

**Remove (Eventually):**
- `@supabase/ssr` - Replace with client-only SDK

## Migration Strategy

### Phase 1: Setup (Week 1)
1. Install Rust and Tauri prerequisites
2. Initialize Tauri project structure
3. Configure Next.js for static export
4. Verify basic app launches

### Phase 2: Authentication (Week 1-2)
1. Remove middleware and server-side auth
2. Implement client-side Supabase auth
3. Add auth state management
4. Test login/logout flows

### Phase 3: Feature Verification (Week 2)
1. Verify Tiptap editor rendering
2. Test document CRUD operations with Supabase
3. Test network error handling and messaging
4. Check all navigation flows

### Phase 4: Packaging (Week 2-3)
1. Configure Tauri build settings
2. Generate installers for all platforms
3. Test on multiple OS versions
4. Document build process

### Phase 5: Polish (Week 3)
1. Add app icons
2. Configure window settings (size, title, etc.)
3. Test performance and memory usage
4. Prepare documentation

## Known Issues and Solutions

### Issue 1: Next.js Fonts in Static Export

**Problem**: Google Fonts may not load correctly in static export.

**Solution**:
- Use `font-display: swap`
- Or bundle fonts locally in `public/` directory
- Or use Tauri's asset protocol to load fonts

### Issue 2: Environment Variables

**Problem**: `NEXT_PUBLIC_*` env vars work, but server-side env vars don't exist.

**Solution**:
- Use only `NEXT_PUBLIC_*` variables
- For sensitive keys, use Tauri's secure config or environment
- Pass secrets via Tauri commands if needed

### Issue 3: Supabase Realtime

**Problem**: Realtime subscriptions need persistent connection.

**Solution**:
- Supabase client SDK handles WebSocket connections
- Should work fine in Tauri (client-side only)
- Test realtime features explicitly

### Issue 4: Service Worker

**Problem**: Current app has service worker for PWA features.

**Solution**:
- Service workers work in Tauri
- May not be necessary for desktop app (no offline concerns)
- Can keep for consistency or remove to simplify

## Alternative Approaches Considered

### Electron
**Pros**: Larger ecosystem, more examples, Chromium bundled
**Cons**: 100MB+ bundles, slower, higher memory usage
**Decision**: Rejected - Tauri aligns better with lightweight, native feel

### Native (Swift/Kotlin/C++)
**Pros**: Maximum performance, native APIs
**Cons**: Separate codebases per platform, lose web technology stack
**Decision**: Rejected - Would require complete rewrite

### Progressive Web App (PWA)
**Pros**: Keep current architecture, no desktop work
**Cons**: Doesn't align with product vision (desktop-first, local-first)
**Decision**: Rejected - Business requirement is desktop app

### Neutralino
**Pros**: Even smaller than Tauri
**Cons**: Less mature, smaller community, fewer features
**Decision**: Rejected - Tauri has better stability and ecosystem

## References and Resources

### Official Documentation
- [Tauri Documentation](https://tauri.app/)
- [Tauri + Next.js Guide](https://tauri.app/start/frontend/nextjs/)
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)

### Community Examples
- [Tauri Next.js Template](https://github.com/kvnxiao/tauri-nextjs-template) - Reference implementation
- [Nextauri Template](https://github.com/0xle0ne/nextauri) - Another good example

### Learning Resources
- [Building Cross-Platform Apps with Next.js and Tauri](https://www.freecodecamp.org/news/build-a-cross-platform-app-with-next-and-tauri/) - Tutorial
- [Tauri Discussion: Next.js Experience](https://github.com/tauri-apps/tauri/discussions/6083) - Community feedback

### Tools
- [cargo-tauri](https://crates.io/crates/tauri-cli) - Tauri CLI for Rust
- [@tauri-apps/cli](https://www.npmjs.com/package/@tauri-apps/cli) - Tauri CLI for npm

## Architecture Decisions Made

**Date**: 2026-02-10
**Architect**: System Architect Agent

### Key Decisions
1. **Framework**: Tauri v2 selected (ADR-001)
2. **Build Mode**: Next.js static export (ADR-002)
3. **Authentication**: Client-side only with localStorage (ADR-003)
4. **API Strategy**: Direct Supabase calls, no API routes (ADR-004)
5. **Migration Approach**: 5-phase progressive implementation (ADR-005)

### Open Questions Resolved
- **Q1 (Auth Storage)**: Use localStorage for MVP, upgrade to Tauri secure storage post-MVP
- **Q2 (Database)**: Continue Supabase cloud for TEN-8 (requires network connectivity)
- **Q3 (Build Pipeline)**: GitHub Actions for automated cross-platform builds
- **Q4 (Code Signing)**: macOS signing only for initial release

### Implementation Plan
See `plan.md` for detailed 5-phase implementation plan with tasks, time estimates, and acceptance criteria mapping.

### Architecture Documentation
See `architecture.md` for complete technical architecture, ADRs, risk analysis, and component design.

## Next Steps

1. **Product Owner**: Review and approve architecture.md and plan.md
2. **Development Agent**: Begin Phase 1 implementation following plan.md
3. **All**: Validate assumptions during proof-of-concept (Phase 3)

## Research Sources

- [Next.js | Tauri](https://v2.tauri.app/start/frontend/nextjs/)
- [Tauri Next.js Template by kvnxiao](https://github.com/kvnxiao/tauri-nextjs-template)
- [Building a Cross-Platform Proxy Tester with Rust, Next.js, and Tauri](https://medium.com/@jedpatterson/building-a-cross-platform-proxy-tester-with-rust-next-js-and-tauri-d1319c9c4820)
- [Tauri GitHub Discussions: Next.js Experience](https://github.com/tauri-apps/tauri/discussions/6083)
- [How to Build a Cross-Platform Application with Next.js and Tauri - freeCodeCamp](https://www.freecodecamp.org/news/build-a-cross-platform-app-with-next-and-tauri/)
