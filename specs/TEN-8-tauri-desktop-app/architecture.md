# Architecture: Create Tauri Desktop App

## Technical Approach

The migration from Next.js web application to Tauri desktop application follows a **progressive enhancement** strategy that maintains all existing functionality while adapting the architecture to work within Tauri's constraints. The core change is shifting from a server-side rendering (SSR) model with server-side authentication to a static site generation (SSG) model with client-side authentication.

### High-Level Solution Design

**Architecture Pattern**: Static Frontend + Rust Backend Wrapper
- **Frontend Layer**: Next.js application configured for static export (SSG mode)
- **Backend Layer**: Tauri Rust backend providing native OS integration and IPC bridge
- **Authentication Layer**: Client-side Supabase authentication with secure token storage
- **Data Layer**: Direct Supabase database access from client (maintained as-is)

**Key Technical Transformation**:
```
Before (Web):
Browser → Next.js SSR → Middleware Auth → Supabase API
                     ↓
                  API Routes

After (Desktop):
Tauri Window → Next.js Static → Client Auth → Supabase API
             ↓
        Rust Backend (future native features)
```

This approach enables:
1. Immediate desktop distribution without rewriting application logic
2. Progressive migration path toward native features (system tray, file system access)
3. Preservation of existing Next.js development workflow
4. Foundation for future local-first architecture with SQLite

## Decision Summary

### ADR-001: Choose Tauri Over Electron
**Decision**: Use Tauri v2 as the desktop framework instead of Electron.

**Context**: Need native desktop application for local-first architecture vision.

**Alternatives Considered**:
- **Electron**: Mature ecosystem, large bundle size (100MB+), higher memory usage
- **Native (Swift/Kotlin)**: Maximum performance but requires complete rewrite per platform
- **PWA**: Maintains web architecture but doesn't align with desktop-first product vision
- **Neutralino**: Smaller than Tauri but less mature ecosystem

**Trade-offs**:
- Benefit: 5-10MB bundle size vs 100MB+ for Electron
- Benefit: Uses system webview (native feel, security updates from OS)
- Benefit: Rust backend enables future native integrations
- Cost: Requires Rust toolchain for development
- Cost: Smaller ecosystem than Electron, fewer community examples

**Rationale**: Tauri aligns with product philosophy (lightweight, privacy-first, native integration) and provides better foundation for local-first features. The codebase is small enough that migration is low-risk.

**Status**: Accepted

---

### ADR-002: Static Export Over SSR
**Decision**: Configure Next.js for static export (output: 'export') instead of maintaining SSR.

**Context**: Tauri cannot run Node.js server runtime; requires pre-rendered static files.

**Alternatives Considered**:
- **Hybrid approach**: Keep SSR for web, build static for desktop (rejected: maintenance burden)
- **Embedded Node server**: Run Node.js inside Tauri (rejected: defeats bundle size benefits)

**Trade-offs**:
- Benefit: Single build artifact, no server runtime complexity
- Benefit: Faster load times (no network roundtrips for pages)
- Benefit: Simplified deployment model
- Cost: Loss of SSR benefits (SEO, initial page load for web) - acceptable for desktop app
- Cost: Cannot use Next.js middleware or API routes

**Consequences**:
- Must migrate all middleware logic to client-side
- Must remove API routes and replace with direct Supabase calls
- Must handle authentication entirely on client
- Images require `unoptimized: true` configuration

**Status**: Accepted

---

### ADR-003: Client-Side Authentication Only
**Decision**: Migrate from server-side authentication (@supabase/ssr) to client-only authentication (@supabase/supabase-js) with localStorage for session persistence.

**Context**: Static export eliminates server-side middleware and cookie-based authentication.

**Alternatives Considered**:
1. **Tauri Secure Storage (plugin-store)**: Platform-specific keychain integration
   - Benefit: Maximum security, OS-level encryption
   - Cost: Requires Tauri plugin setup, complicates auth flow
   - Decision: Defer to Phase 2 (post-MVP)

2. **localStorage**: Standard browser storage API
   - Benefit: Minimal code changes, Supabase SDK handles automatically
   - Benefit: Works immediately without additional setup
   - Cost: Less secure than OS keychain
   - Decision: Use for MVP, enhance in Phase 2

3. **IndexedDB**: More secure than localStorage
   - Benefit: Better security than localStorage
   - Cost: Requires custom implementation
   - Decision: Reject - over-engineering for MVP

**Trade-offs**:
- Benefit: Simpler initial implementation
- Benefit: Existing AuthContext pattern mostly works as-is
- Cost: Auth tokens in localStorage (less secure than Keychain)
- Cost: Protected routes must implement client-side checks

**Migration Strategy**:
- Remove `proxy.ts` middleware and `supabase-middleware.ts`
- Remove `supabase-server.ts` and API routes using server client
- Update `AuthContext` to handle route protection
- Add `ProtectedRoute` component wrapper for auth checks

**Enhancement Path**: Add Tauri secure storage in post-MVP phase (AC-10 security requirements can be met with CSP + localStorage initially, with upgrade path documented).

**Status**: Accepted for MVP, enhancement planned

---

### ADR-004: Remove API Routes, Use Direct Supabase Calls
**Decision**: Eliminate Next.js API routes entirely; make direct Supabase client calls from frontend.

**Context**: Static export cannot support API routes (no Node.js runtime).

**Alternatives Considered**:
- **Tauri commands**: Implement API logic in Rust backend
  - Rejected: Unnecessary complexity for database operations
  - Supabase SDK works directly from browser/webview
- **External API server**: Deploy separate API alongside desktop app
  - Rejected: Defeats purpose of desktop app (offline, local-first)

**Trade-offs**:
- Benefit: Simpler architecture (fewer abstraction layers)
- Benefit: Reduces latency (no localhost API roundtrip)
- Cost: Less abstraction between UI and data layer
- Cost: Supabase RLS policies become critical (were already important)

**Implementation**:
- Update `lib/documents/api.ts` to call Supabase directly instead of fetch('/api/...')
- Ensure Row Level Security (RLS) policies are properly configured
- Add error handling at component level

**Risk Mitigation**: Supabase RLS policies already implemented; verify and document all policies before migration.

**Status**: Accepted

---

### ADR-005: Progressive Migration Strategy
**Decision**: Implement migration in 5 incremental phases rather than big-bang rewrite.

**Context**: Minimize risk while maintaining development velocity.

**Phases**:
1. **Infrastructure Setup**: Tauri project structure, Next.js static config
2. **Authentication Migration**: Remove middleware, client-only auth
3. **Feature Verification**: Test all features in Tauri environment
4. **Build & Distribution**: Cross-platform installers
5. **Documentation & Polish**: Developer docs, app icons, optimization

**Rationale**: Each phase delivers working application; allows early testing and course correction.

**Status**: Accepted

## Components Affected

### New Files to Create
```
src-tauri/
├── src/
│   └── main.rs              # Tauri Rust entry point
├── Cargo.toml               # Rust dependencies
├── tauri.conf.json          # Tauri configuration
├── build.rs                 # Build script
└── icons/                   # Application icons
    ├── icon.png             # Source icon (1024x1024)
    ├── 32x32.png            # Windows icon
    ├── 128x128.png          # macOS icon
    └── icon.icns            # macOS bundle icon
```

### Files to Modify
```
frontend/
├── next.config.ts           # Add output: 'export', images: { unoptimized: true }
├── package.json             # Add Tauri dependencies and scripts
├── lib/auth/
│   ├── supabase-client.ts   # Update to remove build-time placeholder
│   └── auth-context.tsx     # Add route protection logic
├── lib/documents/api.ts     # Replace fetch() with direct Supabase calls
└── app/
    ├── layout.tsx           # Add client-side auth check
    └── app/                 # Add auth guard to protected pages
        └── page.tsx
```

### Files to Remove
```
frontend/
├── proxy.ts                 # Server-side middleware
├── lib/auth/
│   ├── supabase-middleware.ts  # Server-side auth logic
│   └── supabase-server.ts      # Server-side Supabase client
└── app/api/                 # All API routes (move logic to client)
    └── documents/
        ├── route.ts
        └── [id]/route.ts
```

### Files Requiring Testing (No Changes)
- `components/documents/document-editor.tsx` - Tiptap editor in Tauri webview
- `components/documents/*` - All document UI components
- All authentication pages (login, signup, reset-password)

## Data Model Changes

**No database schema changes required.** This migration is purely architectural.

**Considerations**:
- RLS policies must be verified to ensure client-only access is secure
- Future enhancement: Add `device_id` column to track which desktop instance created records (local-first preparation)

**Action Items for Data Engineer**: None for this ticket. Future coordination needed for local-first sync architecture (separate ticket).

## API Changes

### Removing API Routes

**Current API Endpoints (to be removed)**:
```
GET    /api/documents          → fetchDocuments()
POST   /api/documents          → createDocument()
GET    /api/documents/[id]     → fetchDocument(id)
PATCH  /api/documents/[id]     → updateDocument(id, payload)
DELETE /api/documents/[id]     → deleteDocument(id)
```

**Replacement Pattern**:
```typescript
// Before (API route abstraction)
export async function fetchDocuments(): Promise<DocumentListItem[]> {
  const res = await fetch('/api/documents')
  return res.json()
}

// After (direct Supabase call)
import { createClient } from '@/lib/auth/supabase-client'

export async function fetchDocuments(): Promise<DocumentListItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, body, banner_image_url, created_at, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}
```

**Authentication Check Pattern**:
```typescript
// Before (handled by middleware)
export async function GET() {
  const supabase = await createClient() // server client
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // ... query database
}

// After (handled by RLS + client-side UI checks)
export async function fetchDocuments() {
  const supabase = createClient() // browser client
  // RLS policies automatically enforce user_id match
  const { data, error } = await supabase.from('documents').select('*')
  if (error) throw new Error(error.message)
  return data
}
```

**Error Handling Approach**:
- API route pattern returned HTTP status codes (401, 500)
- Client-side pattern throws errors to be caught by components
- Components must implement try/catch and error state UI

### Supabase Configuration

**Environment Variables** (no changes):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Note: `SUPABASE_SERVICE_ROLE_KEY` no longer needed (was only used server-side).

## Dependencies

### New Runtime Dependencies
```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0"
  }
}
```

### New Development Dependencies
```json
{
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0"
  }
}
```

### Dependencies to Remove
```json
{
  "dependencies": {
    "@supabase/ssr": "^0.8.0"  // Remove server-side package
  }
}
```

### Rust Dependencies (Cargo.toml)
```toml
[dependencies]
tauri = { version = "2.0", features = [] }
tauri-plugin-shell = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

### System Prerequisites
- **Rust**: 1.70+ (install via rustup.rs)
- **Node.js**: 20+ (already installed)
- **Platform-Specific**:
  - macOS: Xcode Command Line Tools (already installed)
  - Windows: Microsoft Visual C++ Build Tools
  - Linux: WebKit2GTK development libraries

## Risks & Mitigations

### Technical Risks

**Risk 1: Supabase Auth Session Persistence**
- **Impact**: High - Users must re-login on every app restart
- **Likelihood**: Medium - localStorage session may not persist in Tauri webview
- **Mitigation**:
  - Test early in Phase 2 (AC-4)
  - Fallback: Implement basic Tauri store plugin (2 hours additional work)
  - Document session behavior clearly

**Risk 2: Tiptap Editor Compatibility**
- **Impact**: High - Document editing is core feature
- **Likelihood**: Low - Tiptap is DOM-based, should work in any webview
- **Mitigation**:
  - Test immediately in Phase 3 (AC-6)
  - Have proof-of-concept ready before removing API routes
  - Tiptap community reports Tauri compatibility

**Risk 3: Supabase Network Connectivity Required**
- **Impact**: Medium - Desktop app requires network connection for all operations
- **Likelihood**: High - Intentional design, using cloud backend
- **Mitigation**:
  - Display clear error messages when offline: "No internet connection - Tentacle requires network access for authentication and data sync"
  - Document network requirement in README and user-facing messages
  - This is expected behavior, not a bug (local-first is future enhancement)
  - Handle network errors gracefully with retry options

**Risk 4: Font Loading in Static Export**
- **Impact**: Low - UI degradation but not functionality
- **Likelihood**: Medium - Google Fonts may not load correctly
- **Mitigation**:
  - Next.js 16 handles font optimization in static export
  - Already using `next/font/google` (optimized)
  - Fallback: Bundle fonts locally in `public/fonts/`

**Risk 5: Next.js Image Optimization**
- **Impact**: Low - Slightly larger bundle size
- **Likelihood**: High - Static export requires `unoptimized: true`
- **Mitigation**:
  - Accept trade-off (images already small in current app)
  - Pre-optimize images during build if needed
  - Current app uses minimal images (icons only)

**Risk 6: Environment Variables at Build Time**
- **Impact**: Medium - Build fails without env vars
- **Likelihood**: Medium - Static export requires build-time env vars
- **Mitigation**:
  - Use `NEXT_PUBLIC_*` variables exclusively (already done)
  - Document environment setup in build instructions
  - CI/CD must inject env vars before build

**Risk 7: Cross-Platform Build Complexity**
- **Impact**: Medium - Cannot test Windows/Linux on macOS
- **Likelihood**: High - Different webview implementations per platform
- **Mitigation**:
  - Primary development and testing on macOS (AC-3)
  - Use GitHub Actions for Windows/Linux builds (AC-8)
  - Accept initial macOS-only release, expand platforms iteratively

**Risk 8: Bundle Size Exceeds Target (50MB)**
- **Impact**: Low - Slower download, not critical
- **Likelihood**: Low - Tauri bundles typically 10-30MB
- **Mitigation**:
  - Monitor bundle size during development
  - Remove unused dependencies
  - Enable code splitting in Next.js config
  - Current app is minimal, unlikely to exceed target

### Operational Risks

**Risk 9: Developer Onboarding Complexity**
- **Impact**: Medium - Slower development velocity
- **Likelihood**: Medium - Rust toolchain setup varies by platform
- **Mitigation**:
  - Comprehensive setup documentation (AC-14)
  - Single-command install script for macOS
  - Document common issues and solutions

**Risk 10: Build Time Increase**
- **Impact**: Low - Developer experience degradation
- **Likelihood**: Medium - Rust compilation slower than Node.js
- **Mitigation**:
  - Target dev build time < 30s (spec requirement)
  - Use `--target` flag for platform-specific builds
  - Rust incremental compilation (default)
  - Hot reload still works (Next.js dev server)

### Security Risks

**Risk 11: localStorage Token Security**
- **Impact**: Medium - Tokens accessible to malicious code
- **Likelihood**: Low - Desktop app controls entire webview
- **Mitigation**:
  - Implement CSP headers in Tauri config (AC-10)
  - No third-party scripts in app (controlled environment)
  - Plan upgrade to Tauri secure storage post-MVP
  - Document security model in README

**Risk 12: Code Signing Availability**
- **Impact**: Medium - Unsigned apps trigger OS warnings
- **Likelihood**: High - Code signing setup takes time
- **Mitigation**:
  - Obtain macOS Developer ID immediately (in progress)
  - Windows: ship unsigned initially for early adopters
  - Linux: no signing required
  - Document security warnings for users

## ADRs

### ADR-001: Choose Tauri Over Electron
**Outcome**: Use Tauri v2 for 5-10MB bundle size and native webview benefits.

### ADR-002: Static Export Over SSR
**Outcome**: Configure Next.js for static export; eliminates server runtime requirements.

### ADR-003: Client-Side Authentication Only
**Outcome**: Use @supabase/supabase-js with localStorage for MVP; upgrade to Tauri secure storage post-MVP.

### ADR-004: Remove API Routes, Use Direct Supabase Calls
**Outcome**: Frontend makes direct Supabase calls; rely on RLS for security.

### ADR-005: Progressive Migration Strategy
**Outcome**: 5-phase implementation plan minimizes risk and enables early testing.

## Open Questions

### Q1: Auth Token Storage Strategy
**Question**: Should we use Tauri's secure storage API immediately, or start with localStorage and migrate later?

**Recommendation**: Start with localStorage for MVP (ADR-003), upgrade to Tauri secure storage in Phase 2 after core functionality validated.

**Rationale**:
- localStorage requires zero additional setup, proven pattern
- Tauri plugin adds complexity during high-risk migration phase
- Security adequate for MVP with CSP headers and controlled environment
- Clear upgrade path documented

**Decision**: Use localStorage for MVP (aligns with spec Open Question #1).

**Owner**: System Architect (answered)

---

### Q2: Database Strategy
**Question**: Continue using Supabase cloud, or prepare for local-first with SQLite?

**Recommendation**: Continue Supabase cloud for TEN-8; defer local-first to separate ticket.

**Rationale**:
- Mixing database migration with desktop migration creates excessive risk
- Supabase client SDK works identically in desktop environment
- Local-first requires sync logic, conflict resolution (significant scope)
- Current architecture sets foundation (direct client calls prepare for local-first)

**Future Path**: Tauri has `tauri-plugin-sql` for SQLite; can migrate incrementally after desktop app validated.

**Decision**: Keep Supabase cloud for TEN-8.

**Owner**: Product Owner + System Architect (answered)

---

### Q3: Build Pipeline Strategy
**Question**: Use GitHub Actions for cross-platform builds, or require manual builds initially?

**Recommendation**: GitHub Actions for automated cross-platform builds (AC-8 requires testing on all platforms).

**Implementation**:
```yaml
# .github/workflows/build.yml
name: Build Desktop App
on: [push, pull_request]
jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm run tauri build
```

**Benefits**:
- Validates builds on all platforms automatically
- Provides artifacts for testing without local environment
- Prepares for automated release process

**Cost**: ~1 hour to configure and test workflow.

**Decision**: Implement GitHub Actions in Phase 4.

**Owner**: System Architect (answered)

---

### Q4: Code Signing Scope
**Question**: Obtain developer certificates for all platforms now, or start with macOS only?

**Recommendation**: macOS code signing for initial release; Windows/Linux unsigned.

**Rationale**:
- macOS: Apple Developer account available, signing critical for Gatekeeper
- Windows: Code signing expensive ($200-400/year), can ship unsigned with warning
- Linux: No code signing requirement

**Distribution Strategy**:
- macOS: Signed .dmg via notarization
- Windows: Unsigned .exe with README explaining SmartScreen warning
- Linux: Unsigned .AppImage (standard practice)

**Future**: Obtain Windows certificate before wider distribution.

**Decision**: macOS signing only for TEN-8 (aligns with spec Open Question #5).

**Owner**: Product Owner (answered)

## Success Criteria

### Performance Targets
- **Cold start time**: < 3 seconds (AC-11)
- **Page navigation**: Instant, no network requests (AC-12)
- **Bundle size**: < 50MB per platform (AC-13)
- **Memory footprint**: < 300MB idle (NFR-1)
- **Dev build time**: < 30 seconds (spec requirement)
- **Prod build time**: < 2 minutes (spec requirement)

### Functional Validation
- All 15 acceptance criteria pass (AC-1 through AC-15)
- No console errors during normal usage (AC-15)
- Feature parity with current web app (spec success metric)
- Hot reload functions properly (AC-7)

### Quality Gates
1. **Phase 1 Complete**: Application launches and displays home page (AC-3)
2. **Phase 2 Complete**: Authentication flow works end-to-end (AC-4)
3. **Phase 3 Complete**: All features verified (AC-5, AC-6, AC-15)
4. **Phase 4 Complete**: Installers generated for all platforms (AC-8)
5. **Phase 5 Complete**: Documentation updated, no console errors (AC-14, AC-15)

### Definition of Done
- [ ] All acceptance criteria met
- [ ] Architecture document reviewed and approved
- [ ] Implementation plan created and validated
- [ ] Risk mitigation strategies documented
- [ ] Security requirements addressed (AC-10)
- [ ] Performance benchmarks validated
- [ ] Documentation complete and accurate
- [ ] Linear issue updated with summary

## Next Steps

1. **Review this architecture document** - Product Owner approval
2. **Create detailed plan.md** - System Architect (this agent)
3. **Implementation begins** - Development Agent follows plan.md
4. **Weekly checkpoint** - Validate progress against acceptance criteria
5. **Post-implementation review** - Document lessons learned, update ADRs if needed
