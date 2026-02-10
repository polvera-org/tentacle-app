# Create Tauri Desktop App

**Linear**: TEN-8

## Problem Statement

Tentacle is currently built as a Next.js web application, but the product vision is to be an open-source desktop and CLI application with paid cloud sync features in the future. Running as a web application creates several challenges:

- **Distribution Model Mismatch**: The product roadmap targets desktop-first users (consultants, researchers, founders) who expect native desktop applications with offline capabilities, not web apps requiring browser tabs
- **Local-First Architecture**: The stated philosophy is "Privacy-first, local-first architecture, you own your data" - this is better served by a desktop app with local storage rather than a web app
- **Platform Integration**: Desktop applications can integrate with OS-level features (system tray, native notifications, file system, keyboard shortcuts) that enhance the voice-first, frictionless capture experience
- **Monetization Strategy**: The future paid cloud sync model works better with a freemium desktop app (local storage free, sync paid) than a web app where all features require infrastructure costs

Converting to Tauri now, while the codebase is still relatively small and the product is in early development, prevents costly refactoring later and aligns the technical implementation with the product vision.

## Goals and Success Metrics

### Primary Outcomes
- **Desktop App Distribution**: Users can download and install Tentacle as a native desktop application for macOS, Windows, and Linux
- **Feature Parity**: All existing features (authentication, document list, document editing) work identically in the desktop app
- **Build Performance**: Development build time under 30 seconds, production build time under 2 minutes
- **Bundle Size**: Application installer under 50MB for optimal download experience

### Baseline
- Current state: Web-only Next.js application requiring browser
- Current build time: ~10 seconds for Next.js dev server
- Current deployment: Vercel hosting with server-side rendering

### Success Metrics
- [ ] Application launches on macOS, Windows, and Linux
- [ ] All pages render correctly in Tauri webview
- [ ] Authentication flow works end-to-end with Supabase
- [ ] Document list loads from Supabase database
- [ ] Document creation, editing, and deletion work without errors
- [ ] Hot reload during development works smoothly

### Guardrails
- No degradation in application performance (load times should remain under 2 seconds)
- No loss of existing functionality
- Development experience remains smooth (hot reload, debugging capabilities)

## Stakeholders and Alignment

- **Decision Owner**: Product Owner (Nicolas)
- **Key Stakeholders**: Development team, future users expecting desktop app
- **Reviewers**: System Architect (for technical architecture), Development Agent (for implementation)
- **Communication Cadence**: Sync updates in Linear issue, async spec reviews via spec files

## Assumptions, Risks, and Dependencies

### Assumptions
1. Next.js static export (SSG) mode will support all current features (authentication, document list, document editing)
2. Supabase client-side SDK will work within Tauri's webview for network requests to Supabase cloud backend
3. The Tiptap editor will render correctly in Tauri's webview
4. Current authentication flow can be adapted to work without server-side middleware (client-side auth with Supabase network requests)
5. Network requests to Supabase will work reliably from desktop app (not a local-only app)

### Risks and Mitigations
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Supabase SSR features incompatible with static export | High | Medium | Migrate to client-only auth pattern, store session in Tauri's secure storage |
| Next.js middleware won't work in static export | Medium | High | Move auth checks to client-side, use Tauri's native secure storage for tokens |
| Network connectivity issues blocking app functionality | Medium | Medium | Desktop app requires network for Supabase auth and database - this is expected behavior, add clear error messages for offline state |
| Build size exceeds target due to embedded webview | Medium | Low | Optimize bundle, use code splitting, consider lazy loading |
| Loss of SSR benefits for performance | Low | High | Accept tradeoff - desktop apps load from disk, SSR less critical |

### Dependencies
- **Tauri v2**: Latest stable version with Next.js support
- **Rust toolchain**: Required for Tauri backend compilation
- **Next.js 14+**: Static export capabilities
- **Supabase client SDK**: Must work in client-only mode
- **Operating Systems**: macOS (primary development), Windows and Linux (CI/CD testing)

## Requirements

### Functional Requirements

#### FR-1: Tauri Application Structure
- The application must be structured as a Tauri project with Rust backend and Next.js frontend
- Tauri configuration must define application metadata (name, version, bundle ID)
- Must support multiple target platforms (macOS, Windows, Linux)

#### FR-2: Next.js Static Export
- Next.js must be configured for static export (output: 'export')
- All pages must be pre-rendered at build time
- No server-side rendering or API routes
- Images must use unoptimized mode for compatibility

#### FR-3: Authentication Adaptation
- Supabase authentication must work without server-side middleware
- Session management must use client-side storage (Tauri's secure storage preferred)
- Protected routes must implement client-side auth checks
- Auth tokens must persist securely between app launches

#### FR-4: Development Workflow
- Development server must support hot reload
- Developers must be able to debug frontend code using browser dev tools
- Rust backend logs must be accessible during development
- Build process must be documented and reproducible

#### FR-5: Application Distribution
- Must generate platform-specific installers (DMG for macOS, EXE for Windows, AppImage/DEB for Linux)
- Application must be code-signed (initially for macOS)
- Update mechanism infrastructure (stub for future auto-update feature)

### Non-Functional Requirements

#### NFR-1: Performance
- Application cold start time: under 3 seconds on modern hardware
- Page navigation: instant client-side routing (note: data fetching requires network requests to Supabase)
- Document list loading: under 2 seconds with network connection
- Memory footprint: under 300MB idle

#### NFR-2: Compatibility
- Support macOS 11+ (Big Sur and later)
- Support Windows 10+ (version 1809 or later)
- Support major Linux distributions (Ubuntu 20.04+, Fedora 36+)
- WebView versions: Use system webview on each platform

#### NFR-3: Security
- Application code must be signed with developer certificate
- Sensitive data (auth tokens) must use platform secure storage
- No execution of untrusted code
- CSP headers must be maintained in Tauri configuration

#### NFR-4: Maintainability
- Maintain separation between Tauri backend (src-tauri/) and Next.js frontend
- Document Tauri-specific configuration and commands
- Version Tauri dependencies explicitly
- Keep platform-specific code isolated

#### NFR-5: Developer Experience
- Single command to start development: `npm run tauri dev`
- Single command to build production: `npm run tauri build`
- Clear error messages for configuration issues
- TypeScript type safety for Tauri API calls

## Acceptance Criteria

### AC-1: Tauri Project Structure
**Given** the repository structure
**When** a developer reviews the codebase
**Then** they should see:
- `src-tauri/` directory containing Rust backend code
- `tauri.conf.json` with proper configuration
- Updated `package.json` with Tauri scripts
- Cargo.toml with Tauri dependencies

### AC-2: Static Export Configuration
**Given** the Next.js configuration
**When** the application is built
**Then**:
- Next.js must generate static HTML/CSS/JS in `out/` directory
- No server-side rendering must occur
- All routes must be pre-rendered
- Images must be optimized for static export

### AC-3: Desktop Application Launch
**Given** a built application
**When** a user launches the desktop app
**Then**:
- Application window must open with correct dimensions (default 1024x768)
- Application must load the home page
- UI must render without console errors
- Application must be responsive to user interactions

### AC-4: Authentication Flow
**Given** an unauthenticated user
**When** they navigate to the login page and enter valid credentials
**Then**:
- User must be authenticated successfully
- Session must persist after closing and reopening the app
- Protected routes must be accessible after authentication
- Logout must clear the session and redirect to login

### AC-5: Document Editor
**Given** an authenticated user viewing a document
**When** they edit the document content
**Then**:
- Tiptap editor must render correctly
- Text formatting controls must work
- Content must save to Supabase
- Changes must persist across app restarts

### AC-6: Development Workflow
**Given** a developer running `npm run tauri dev`
**When** they modify frontend code
**Then**:
- Changes must hot reload automatically
- Application must not require manual restart
- Console logs must be visible
- Debugging must work via browser dev tools

### AC-7: Cross-Platform Builds
**Given** the build command is executed
**When** targeting each platform (macOS, Windows, Linux)
**Then**:
- Platform-specific installer must be generated
- Application must launch successfully on target platform
- All features must work identically across platforms
- Bundle size must be under 50MB

### AC-8: Error Handling and Network Requirements
**Given** various error conditions (network failure, invalid auth, etc.)
**When** errors occur
**Then**:
- Application must display user-friendly error messages
- Application must not crash
- Network errors must clearly indicate "No internet connection - Tentacle requires network access for authentication and data sync"
- Errors must be logged for debugging
- User must be able to retry failed network requests

### AC-9: Security Requirements
**Given** the application handles sensitive data
**When** auth tokens are stored
**Then**:
- Tokens must use platform secure storage (Keychain on macOS)
- Tokens must not be stored in plain text
- Tokens must not be accessible to other applications
- Application must implement CSP headers

## Scope

### In Scope
- Tauri v2 project setup and configuration
- Next.js static export configuration
- Client-side Supabase authentication (requires network requests)
- Desktop application packaging for macOS (primary), Windows, and Linux
- Development workflow with hot reload
- Migration of existing features to desktop environment:
  - User authentication (login/logout)
  - Document list view (fetched from Supabase)
  - Document editor (Tiptap)
  - Document CRUD operations (create, read, update, delete via Supabase)
- Basic installer generation
- Documentation for running and building the desktop app
- Network connectivity to Supabase cloud backend for all data operations

### Out of Scope
- Voice recording and transcription features (not yet implemented in web app - future ticket)
- Local-first/offline mode (app requires network connection to Supabase - future enhancement)
- Auto-update mechanism (infrastructure stub only, full implementation later)
- System tray integration (future enhancement)
- Native OS notifications (can use web notifications initially)
- CLI tool development (separate future ticket)
- Cloud sync features (future paid feature - currently all data is cloud-based via Supabase)
- Application store distribution (Mac App Store, Microsoft Store)
- Advanced native integrations (global keyboard shortcuts, touch bar)
- Mobile app development (iOS/Android)
- Significant UI redesign (maintain current design)

## Open Questions

1. **Auth Token Storage**: Should we use Tauri's secure storage API immediately, or start with localStorage and migrate later?
   - **Owner**: System Architect
   - **Deadline**: Before implementation begins
   - **Context**: Impacts security architecture

2. **Database Strategy**: Continue using Supabase cloud, or prepare for local-first with SQLite?
   - **Owner**: Product Owner + System Architect
   - **Deadline**: Before planning cloud sync feature
   - **Context**: Affects future local-first architecture but doesn't block Tauri migration (currently using Supabase cloud with network requests)

3. **Build Pipeline**: Use GitHub Actions for cross-platform builds, or require manual builds initially?
   - **Owner**: System Architect
   - **Deadline**: Before first release
   - **Context**: Affects release cadence

4. **Code Signing**: Obtain developer certificates for all platforms now, or start with macOS only?
   - **Owner**: Product Owner
   - **Deadline**: Before first public release
   - **Context**: Windows/Linux can ship unsigned initially for early adopters

## Definition of Done

- [ ] Tauri project structure created and configured
- [ ] Next.js configured for static export (output: 'export')
- [ ] Development server launches successfully with `npm run tauri dev`
- [ ] Production build completes without errors using `npm run tauri build`
- [ ] Application launches on macOS and displays home page
- [ ] Authentication flow works end-to-end (login, logout, session persistence) with Supabase network requests
- [ ] Protected routes enforce authentication correctly
- [ ] Document list loads from Supabase database
- [ ] Document editor (Tiptap) renders and functions correctly
- [ ] Document CRUD operations work with Supabase (create, read, update, delete)
- [ ] Network connectivity errors display helpful messages
- [ ] Hot reload works during development
- [ ] Application installers generated for macOS (.dmg)
- [ ] Application installers generated for Windows (.exe) and Linux (.AppImage)
- [ ] Documentation updated with Tauri setup, build, and run instructions
- [ ] No console errors during normal application usage
- [ ] Performance meets targets (3s cold start, instant navigation)
- [ ] Security requirements met (secure token storage, CSP headers)
- [ ] Linear issue updated with implementation summary and release notes
