# Implementation Plan: TEN-8 - Create Tauri Desktop App

## Overview

This plan implements the Tauri desktop application migration in 5 incremental phases, each delivering a working application state. Each phase maps to specific acceptance criteria and can be validated independently.

**Total Estimated Time**: 5-7 days (40-56 hours)

**Critical Path**: Phase 1 → Phase 2 → Phase 3 (must be sequential)
**Parallel Work**: Phase 4 can partially overlap with Phase 3

## Phase 1: Infrastructure Setup & Static Export

**Goal**: Tauri project structure created, Next.js configured for static export, application launches.

**Duration**: 1-2 days (8-16 hours)

**Acceptance Criteria**: AC-1, AC-2, AC-3, AC-7

### Stage 1.1: Install Prerequisites

**Tasks**:
1. Verify Rust installation: `rustc --version` (should be 1.70+)
   - If missing: Install via `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. Verify Node.js 20+: `node --version`
3. Install Tauri CLI globally: `cargo install tauri-cli` (optional, can use npm version)

**Validation**: All commands return version numbers without errors.

**Time**: 30 minutes

---

### Stage 1.2: Initialize Tauri Project

**Tasks**:
1. Navigate to repository root: `cd /Users/nicolas/Code/polvera/tentacle-app`
2. Initialize Tauri:
   ```bash
   cd frontend
   npm install --save-dev @tauri-apps/cli@^2.0.0
   npm install @tauri-apps/api@^2.0.0 @tauri-apps/plugin-shell@^2.0.0
   npx tauri init
   ```

3. Answer Tauri init prompts:
   - App name: `Tentacle`
   - Window title: `Tentacle`
   - Dev server URL: `http://localhost:3000`
   - Frontend build command: `npm run build`
   - Frontend dist directory: `../out`

4. Verify structure created:
   ```
   frontend/
   ├── src-tauri/
   │   ├── src/main.rs
   │   ├── Cargo.toml
   │   ├── tauri.conf.json
   │   ├── build.rs
   │   └── icons/
   ```

**Files Created**:
- `frontend/src-tauri/src/main.rs`
- `frontend/src-tauri/Cargo.toml`
- `frontend/src-tauri/tauri.conf.json`
- `frontend/src-tauri/build.rs`

**Validation**: `ls frontend/src-tauri/` shows all expected files.

**Time**: 30 minutes

**Maps to**: AC-1 (Tauri project structure)

---

### Stage 1.3: Configure Next.js for Static Export

**Tasks**:
1. Update `frontend/next.config.ts`:
   ```typescript
   import type { NextConfig } from "next";

   const nextConfig: NextConfig = {
     output: 'export',
     images: {
       unoptimized: true,
     },
     // Tauri expects files in 'out' directory
     distDir: 'out',
   };

   export default nextConfig;
   ```

2. Test static build:
   ```bash
   cd frontend
   npm run build
   ```

3. Verify `out/` directory created with HTML files:
   ```bash
   ls -la out/
   # Should see: _next/, app/, index.html, etc.
   ```

4. Test static server locally:
   ```bash
   npx serve out
   # Visit http://localhost:3000
   ```

**Expected Issues**:
- Build may fail due to server-side code in middleware
- API routes will show build warnings (expected, will be removed in Phase 2)

**Temporary Fix** (if build fails):
- Comment out `proxy.ts` export temporarily
- Rename `app/api/` to `app/api.disabled/` temporarily
- We'll properly remove these in Phase 2

**Files Modified**:
- `frontend/next.config.ts`

**Validation**:
- `npm run build` completes successfully
- `out/` directory contains static HTML/CSS/JS files
- Static server loads pages without errors

**Time**: 1 hour (including troubleshooting)

**Maps to**: AC-2 (Static export configuration)

---

### Stage 1.4: Configure Tauri Build

**Tasks**:
1. Update `frontend/src-tauri/tauri.conf.json`:
   ```json
   {
     "productName": "Tentacle",
     "version": "0.1.0",
     "identifier": "com.tentacle.app",
     "build": {
       "beforeDevCommand": "npm run dev",
       "beforeBuildCommand": "npm run build",
       "devUrl": "http://localhost:3000",
       "frontendDist": "../out"
     },
     "app": {
       "windows": [
         {
           "title": "Tentacle",
           "width": 1024,
           "height": 768,
           "minWidth": 800,
           "minHeight": 600,
           "resizable": true,
           "fullscreen": false
         }
       ],
       "security": {
         "csp": "default-src 'self'; connect-src 'self' https://*.supabase.co; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' 'unsafe-inline'"
       }
     },
     "bundle": {
       "active": true,
       "targets": "all",
       "icon": [
         "icons/32x32.png",
         "icons/128x128.png",
         "icons/128x128@2x.png",
         "icons/icon.icns",
         "icons/icon.ico"
       ]
     },
     "plugins": {
       "shell": {
         "open": true
       }
     }
   }
   ```

2. Add placeholder icons (use default Tauri icons temporarily):
   ```bash
   # Icons will be in src-tauri/icons/ from init
   # Replace in Phase 5 with actual app icons
   ```

**Files Modified**:
- `frontend/src-tauri/tauri.conf.json`

**Validation**: Configuration file is valid JSON and includes all required fields.

**Time**: 30 minutes

**Maps to**: AC-1 (Tauri configuration)

---

### Stage 1.5: Add Tauri Scripts to package.json

**Tasks**:
1. Update `frontend/package.json`:
   ```json
   {
     "scripts": {
       "dev": "next dev",
       "build": "next build",
       "start": "next start",
       "lint": "eslint",
       "tauri": "tauri",
       "tauri:dev": "tauri dev",
       "tauri:build": "tauri build"
     }
   }
   ```

**Files Modified**:
- `frontend/package.json`

**Validation**: `npm run tauri --help` displays Tauri CLI help.

**Time**: 10 minutes

**Maps to**: AC-1 (Tauri scripts)

---

### Stage 1.6: First Launch Test

**Tasks**:
1. Start Tauri dev server:
   ```bash
   cd frontend
   npm run tauri:dev
   ```

2. Wait for compilation (first build takes 2-5 minutes for Rust compilation)

3. Application window should open displaying the Next.js app

**Expected Behavior**:
- Desktop window opens with Tentacle UI
- Home page loads (may show auth errors - expected)
- Browser DevTools accessible via right-click → Inspect

**Expected Issues**:
- Authentication will not work (middleware removed/commented)
- API calls will fail (routes disabled)
- These are expected and will be fixed in Phase 2

**Validation Checklist**:
- [ ] Desktop application window opens
- [ ] Window shows correct title "Tentacle"
- [ ] Window has correct dimensions (1024x768)
- [ ] Home page content visible (even if auth fails)
- [ ] DevTools accessible
- [ ] No Tauri-specific errors in console (Supabase errors expected)

**Time**: 1 hour (including first Rust build)

**Maps to**: AC-3 (Desktop application launch), AC-7 (Development workflow)

---

### Stage 1.7: Hot Reload Verification

**Tasks**:
1. With `npm run tauri:dev` running, edit a file:
   ```typescript
   // frontend/app/page.tsx
   // Change any text, e.g., heading color
   ```

2. Save file and observe window

**Expected Behavior**:
- Next.js detects change and rebuilds
- Tauri window automatically reloads
- Change visible within 1-2 seconds
- No manual restart required

**Validation**: Changes appear automatically without restarting `tauri:dev` command.

**Time**: 15 minutes

**Maps to**: AC-7 (Hot reload works)

---

### Phase 1 Completion Criteria

**Deliverables**:
- [ ] Tauri project structure exists (AC-1)
- [ ] Next.js configured for static export (AC-2)
- [ ] Application launches in Tauri window (AC-3)
- [ ] Hot reload functions properly (AC-7)
- [ ] DevTools accessible for debugging (AC-7)

**Known Issues at Phase 1 End**:
- Authentication not working (fixed in Phase 2)
- API routes disabled (fixed in Phase 2)
- Protected routes not enforcing auth (fixed in Phase 2)

**Commit Message**:
```
TEN-8: Initialize Tauri project with static export

- Add Tauri v2 project structure with Rust backend
- Configure Next.js for static export (output: 'export')
- Add Tauri dev and build scripts to package.json
- Configure Tauri window settings and CSP headers
- Verify hot reload functionality in development

AC-1, AC-2, AC-3, AC-7 partial progress

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Phase 2: Authentication Migration

**Goal**: Remove server-side authentication, implement client-only auth, restore login functionality.

**Duration**: 1-2 days (8-16 hours)

**Acceptance Criteria**: AC-4, AC-10 (partial)

### Stage 2.1: Remove Server-Side Auth Infrastructure

**Tasks**:
1. Delete server-side middleware files:
   ```bash
   rm frontend/proxy.ts
   rm frontend/lib/auth/supabase-middleware.ts
   rm frontend/lib/auth/supabase-server.ts
   ```

2. Remove API routes:
   ```bash
   rm -rf frontend/app/api/
   ```

3. Remove `@supabase/ssr` dependency:
   ```bash
   cd frontend
   npm uninstall @supabase/ssr
   ```

4. Clean up package imports:
   - Search for `@supabase/ssr` imports: should find none after removal
   - Search for `supabase-middleware` imports: should find none
   - Search for `supabase-server` imports: should find none

**Files Deleted**:
- `frontend/proxy.ts`
- `frontend/lib/auth/supabase-middleware.ts`
- `frontend/lib/auth/supabase-server.ts`
- `frontend/app/api/` (entire directory)

**Files Modified**:
- `frontend/package.json` (dependency removed)

**Validation**:
```bash
grep -r "@supabase/ssr" frontend/
# Should return no results

npm run build
# Should complete without middleware errors
```

**Time**: 30 minutes

**Maps to**: AC-4 (Authentication preparation)

---

### Stage 2.2: Update Supabase Client Configuration

**Tasks**:
1. Update `frontend/lib/auth/supabase-client.ts`:
   ```typescript
   'use client'

   import { createBrowserClient } from '@supabase/ssr'

   export function createClient() {
     const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
     const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

     if (!supabaseUrl || !supabaseAnonKey) {
       throw new Error('Missing Supabase environment variables')
     }

     return createBrowserClient(supabaseUrl, supabaseAnonKey)
   }
   ```

2. Verify environment variables in `frontend/.env.local`:
   ```bash
   cat frontend/.env.local | grep NEXT_PUBLIC_SUPABASE
   ```

**Files Modified**:
- `frontend/lib/auth/supabase-client.ts`

**Validation**: Import `createClient` in a component and verify it returns a Supabase client.

**Time**: 15 minutes

---

### Stage 2.3: Add Route Protection to AuthContext

**Tasks**:
1. Update `frontend/lib/auth/auth-context.tsx` to add `requireAuth` utility:
   ```typescript
   'use client'

   import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
   import { User, Session, AuthError } from '@supabase/supabase-js'
   import { createClient } from './supabase-client'
   import { useRouter, usePathname } from 'next/navigation'

   interface AuthContextType {
     user: User | null
     session: Session | null
     isLoading: boolean
     signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
     signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>
     signInWithGoogle: () => Promise<{ error: AuthError | null }>
     signOut: () => Promise<{ error: AuthError | null }>
     resetPassword: (email: string) => Promise<{ error: AuthError | null }>
     updatePassword: (password: string) => Promise<{ error: AuthError | null }>
     requireAuth: () => void  // New utility
   }

   const AuthContext = createContext<AuthContextType | undefined>(undefined)

   // Public routes that don't require authentication
   const publicRoutes = ['/', '/login', '/signup', '/reset-password', '/auth/callback']

   export function AuthProvider({ children }: { children: ReactNode }) {
     const [user, setUser] = useState<User | null>(null)
     const [session, setSession] = useState<Session | null>(null)
     const [isLoading, setIsLoading] = useState(true)
     const router = useRouter()
     const pathname = usePathname()
     const supabase = createClient()

     useEffect(() => {
       // Get initial session
       const getSession = async () => {
         const { data: { session } } = await supabase.auth.getSession()
         setSession(session)
         setUser(session?.user ?? null)
         setIsLoading(false)
       }

       getSession()

       // Listen for auth changes
       const { data: { subscription } } = supabase.auth.onAuthStateChange(
         (_event, session) => {
           setSession(session)
           setUser(session?.user ?? null)
           setIsLoading(false)
         }
       )

       return () => subscription.unsubscribe()
     }, [])

     // Automatic route protection
     useEffect(() => {
       if (isLoading) return

       const isPublicRoute = publicRoutes.some(route =>
         pathname === route || pathname.startsWith(route + '/')
       )

       // Redirect to login if accessing protected route without auth
       if (!isPublicRoute && !user) {
         const loginUrl = `/login?returnUrl=${encodeURIComponent(pathname)}`
         router.push(loginUrl)
       }

       // Redirect to app if logged in and accessing auth pages
       if (user && (pathname === '/login' || pathname === '/signup')) {
         router.push('/app')
       }
     }, [user, isLoading, pathname, router])

     const signIn = async (email: string, password: string) => {
       const { error } = await supabase.auth.signInWithPassword({
         email,
         password,
       })
       return { error }
     }

     const signUp = async (email: string, password: string) => {
       const { error } = await supabase.auth.signUp({
         email,
         password,
         options: {
           emailRedirectTo: `${window.location.origin}/app`,
         },
       })
       return { error }
     }

     const signInWithGoogle = async () => {
       const { error } = await supabase.auth.signInWithOAuth({
         provider: 'google',
         options: {
           redirectTo: `${window.location.origin}/auth/callback`,
         },
       })
       return { error }
     }

     const signOut = async () => {
       const { error } = await supabase.auth.signOut()
       return { error }
     }

     const resetPassword = async (email: string) => {
       const { error } = await supabase.auth.resetPasswordForEmail(email, {
         redirectTo: `${window.location.origin}/reset-password/confirm`,
       })
       return { error }
     }

     const updatePassword = async (password: string) => {
       const { error } = await supabase.auth.updateUser({
         password,
       })
       return { error }
     }

     // Manual route protection utility (for additional checks)
     const requireAuth = () => {
       if (!user && !isLoading) {
         router.push('/login')
       }
     }

     const value = {
       user,
       session,
       isLoading,
       signIn,
       signUp,
       signInWithGoogle,
       signOut,
       resetPassword,
       updatePassword,
       requireAuth,
     }

     return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
   }

   export function useAuth() {
     const context = useContext(AuthContext)
     if (context === undefined) {
       throw new Error('useAuth must be used within an AuthProvider')
     }
     return context
   }
   ```

**Files Modified**:
- `frontend/lib/auth/auth-context.tsx`

**Validation**: Auth context provides automatic route protection and redirect logic.

**Time**: 1 hour

**Maps to**: AC-4 (Authentication flow)

---

### Stage 2.4: Migrate API Calls to Direct Supabase

**Tasks**:
1. Update `frontend/lib/documents/api.ts`:
   ```typescript
   import { createClient } from '@/lib/auth/supabase-client'
   import type { Document, DocumentListItem, CreateDocumentPayload, UpdateDocumentPayload } from '@/types/documents'

   export async function fetchDocuments(): Promise<DocumentListItem[]> {
     const supabase = createClient()
     const { data, error } = await supabase
       .from('documents')
       .select('id, title, body, banner_image_url, created_at, updated_at')
       .is('deleted_at', null)
       .order('updated_at', { ascending: false })

     if (error) throw new Error(error.message)
     return data || []
   }

   export async function createDocument(payload?: CreateDocumentPayload): Promise<Document> {
     const supabase = createClient()
     const { data, error } = await supabase
       .from('documents')
       .insert({ title: payload?.title || 'Untitled' })
       .select()
       .single()

     if (error) throw new Error(error.message)
     return data
   }

   export async function fetchDocument(id: string): Promise<Document> {
     const supabase = createClient()
     const { data, error } = await supabase
       .from('documents')
       .select('*')
       .eq('id', id)
       .single()

     if (error) throw new Error(error.message)
     return data
   }

   export async function updateDocument(id: string, payload: UpdateDocumentPayload): Promise<Document> {
     const supabase = createClient()
     const { data, error } = await supabase
       .from('documents')
       .update(payload)
       .eq('id', id)
       .select()
       .single()

     if (error) throw new Error(error.message)
     return data
   }

   export async function deleteDocument(id: string): Promise<void> {
     const supabase = createClient()
     const { error } = await supabase
       .from('documents')
       .update({ deleted_at: new Date().toISOString() })
       .eq('id', id)

     if (error) throw new Error(error.message)
   }
   ```

**Files Modified**:
- `frontend/lib/documents/api.ts`

**Validation**: All document operations work through direct Supabase calls.

**Time**: 1 hour

**Maps to**: AC-6 (Document operations)

---

### Stage 2.5: Test Authentication Flow

**Tasks**:
1. Start Tauri dev server:
   ```bash
   npm run tauri:dev
   ```

2. Test login flow:
   - Navigate to login page
   - Enter valid credentials
   - Verify redirect to `/app` on success
   - Verify session persists (check localStorage in DevTools)

3. Test protected route access:
   - Without logging in, try to access `/app`
   - Should redirect to `/login?returnUrl=/app`
   - After login, should redirect back to `/app`

4. Test logout:
   - Click logout button
   - Verify redirect to `/login`
   - Verify session cleared from localStorage

5. Test session persistence:
   - Log in
   - Close application
   - Reopen application
   - Should remain logged in (no login prompt)

**Test Cases**:
- [ ] Login with valid credentials succeeds
- [ ] Login with invalid credentials shows error
- [ ] Protected routes redirect to login when not authenticated
- [ ] returnUrl parameter works correctly
- [ ] Logout clears session and redirects
- [ ] Session persists after app restart
- [ ] Logged-in users can't access /login or /signup (redirect to /app)

**Expected Issues**:
- Session may not persist if localStorage not working in Tauri
- If issue occurs, document and plan Tauri store plugin for Phase 5

**Time**: 1.5 hours

**Maps to**: AC-4 (Authentication flow end-to-end)

---

### Stage 2.6: Implement Security Headers

**Tasks**:
1. Verify CSP headers in `frontend/src-tauri/tauri.conf.json`:
   ```json
   {
     "app": {
       "security": {
         "csp": "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'"
       }
     }
   }
   ```

2. Test CSP by attempting to load external scripts:
   - Should be blocked by CSP
   - Check console for CSP violation warnings

**Files Modified**:
- `frontend/src-tauri/tauri.conf.json` (verify/update CSP)

**Validation**:
- Supabase requests succeed
- External script loading blocked
- No CSP violations for legitimate requests

**Time**: 30 minutes

**Maps to**: AC-10 (Security requirements)

---

### Phase 2 Completion Criteria

**Deliverables**:
- [ ] Server-side auth infrastructure removed
- [ ] Client-only authentication working (AC-4)
- [ ] Login/logout flow functional
- [ ] Session persistence working
- [ ] Protected routes enforce authentication
- [ ] CSP headers configured (AC-10 partial)
- [ ] Direct Supabase calls replace API routes

**Known Issues at Phase 2 End**:
- Voice recording not yet tested (tested in Phase 3)
- Document editor not yet tested in Tauri (tested in Phase 3)
- Only macOS tested (cross-platform in Phase 4)

**Commit Message**:
```
TEN-8: Migrate to client-side authentication

- Remove server-side middleware and API routes
- Implement client-only Supabase authentication
- Add automatic route protection in AuthContext
- Migrate document API calls to direct Supabase
- Configure CSP headers for security
- Verify session persistence in localStorage

AC-4, AC-10 (partial) complete

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Phase 3: Feature Verification

**Goal**: Test all existing features in Tauri environment, ensure feature parity.

**Duration**: 1 day (8 hours)

**Acceptance Criteria**: AC-5, AC-6, AC-8, AC-9, AC-11, AC-15

### Stage 3.1: Document Editor Testing

**Tasks**:
1. Launch Tauri app and log in
2. Create new document
3. Test Tiptap editor functionality:
   - [ ] Editor renders without errors
   - [ ] Typing works smoothly
   - [ ] Bold formatting (Cmd+B)
   - [ ] Italic formatting (Cmd+I)
   - [ ] Headings (H1, H2, H3)
   - [ ] Bullet lists
   - [ ] Numbered lists
   - [ ] Undo/Redo
   - [ ] Content saves automatically (debounced)

4. Test document operations:
   - [ ] Create document
   - [ ] Edit title
   - [ ] Edit body content
   - [ ] Delete document
   - [ ] Changes persist after app restart

5. Monitor console for errors:
   ```
   Right-click → Inspect → Console tab
   # Should see no errors during normal usage
   ```

**Expected Issues**:
- Possible font rendering differences (acceptable)
- Possible CSS styling issues (fix if critical)

**Validation Checklist**:
- [ ] Tiptap editor loads and renders correctly (AC-6)
- [ ] All formatting controls work
- [ ] Content saves to Supabase
- [ ] Changes persist across app restarts
- [ ] No console errors related to editor
- [ ] Document CRUD operations work end-to-end

**Time**: 2 hours

**Maps to**: AC-6 (Document editor), AC-15 (No console errors)

---

### Stage 3.2: Network Connectivity and Error Handling Testing

**Tasks**:
1. Test Supabase network operations:
   - [ ] Authentication requires network connection
   - [ ] Document list fetching requires network connection
   - [ ] Document CRUD operations require network connection
   - [ ] All operations work when online

2. Test offline behavior:
   - [ ] Disconnect network
   - [ ] Attempt to login - should show clear error: "No internet connection - Tentacle requires network access for authentication and data sync"
   - [ ] Attempt to fetch documents - should show appropriate network error
   - [ ] Error messages are user-friendly and actionable

3. Test network error recovery:
   - [ ] Disconnect network
   - [ ] Trigger an operation (login, fetch documents)
   - [ ] Reconnect network
   - [ ] Retry operation - should succeed
   - [ ] User can recover without restarting app

**Error Message Guidelines**:
- Network errors must explicitly state network requirement
- "No internet connection - Tentacle requires network access for authentication and data sync"
- Provide retry option where applicable
- Log technical details to console for debugging

**Validation Checklist**:
- [ ] All Supabase operations work when online (AC-15)
- [ ] Network errors display clear, helpful messages (AC-8)
- [ ] Application doesn't crash on network failures (AC-9)
- [ ] User can retry after network restored
- [ ] Network requirement clearly communicated to users

**Time**: 1 hour

**Maps to**: AC-8 (Network error handling), AC-9 (Error handling), AC-15 (Supabase operations)

---

### Stage 3.3: Navigation and Performance Testing

**Tasks**:
1. Test all routes:
   - [ ] `/` (home page)
   - [ ] `/login`
   - [ ] `/signup`
   - [ ] `/reset-password`
   - [ ] `/app` (dashboard)
   - [ ] `/app/documents/[id]` (document editor)

2. Test navigation patterns:
   - [ ] Link clicks navigate correctly
   - [ ] Browser back/forward buttons work
   - [ ] Programmatic navigation (router.push) works

3. Measure performance:
   - **Cold start**: Time from app launch to interactive
     - Target: < 3 seconds
     - Measure: `time npm run tauri:dev` and click UI
   - **Page navigation**: Time between route changes
     - Target: Instant (no visible delay)
     - Measure: Click link and observe transition
   - **Memory usage**: Check Activity Monitor (macOS)
     - Target: < 300MB idle
     - Measure: After app runs for 5 minutes

4. Document results:
   ```
   Performance Metrics:
   - Cold start: X seconds
   - Page navigation: Instant ✓
   - Memory usage: XMB
   ```

**Validation Checklist**:
- [ ] All routes load correctly
- [ ] Navigation is smooth and instant
- [ ] Cold start under 3 seconds (AC-10)
- [ ] Memory usage under 300MB (NFR-1)

**Time**: 1.5 hours

**Maps to**: AC-10 (Cold start time), AC-11 (Document list loading performance)

---

### Stage 3.4: Additional Error Handling Testing

**Tasks**:
1. Test additional error scenarios:
   - **Invalid auth**: Manually corrupt localStorage session
     - Should redirect to login
     - Should not show raw error
   - **Missing document**: Navigate to `/app/documents/invalid-id`
     - Should redirect to dashboard
     - Should show error message or 404 state
   - **Database error**: Try to create document with invalid data
     - Should show validation error
     - Should not crash

2. Check error boundaries:
   - Verify React error boundaries catch rendering errors
   - Verify errors logged to console (for debugging)

3. Test recovery:
   - After error, user should be able to continue using app
   - No need to restart application

**Validation Checklist**:
- [ ] Auth errors redirect appropriately
- [ ] Database errors handled gracefully
- [ ] Application never crashes (AC-9)
- [ ] Errors logged to console for debugging
- [ ] User can recover from errors

**Time**: 1 hour

**Maps to**: AC-9 (Error handling)

---

### Stage 3.5: Cross-Component Integration Testing

**Tasks**:
1. Test complete user workflows:
   - **Workflow 1: New user signup**
     - Signup → Email verification → Login → Create first document
   - **Workflow 2: Returning user**
     - Launch app → Auto-login → View documents → Edit document
   - **Workflow 3: Content creation**
     - Create document → Add title → Add content → Auto-save → Close → Reopen
   - **Workflow 4: Content deletion**
     - Select document → Delete → Confirm → Verify removed from list

2. Monitor console during workflows:
   - Note any warnings or errors
   - Verify no memory leaks (memory usage stable over time)

3. Test data consistency:
   - Changes in one window/tab reflected in Supabase
   - Reopening app shows latest data
   - No orphaned or corrupted data

**Validation**: All workflows complete successfully without errors or crashes.

**Time**: 1.5 hours

**Maps to**: AC-15 (No console errors), General feature parity

---

### Phase 3 Completion Criteria

**Deliverables**:
- [ ] Document editor fully functional (AC-5)
- [ ] Network connectivity requirements validated (AC-15)
- [ ] Network error handling works properly (AC-8)
- [ ] All navigation routes work correctly
- [ ] Performance metrics meet targets (AC-10, AC-11)
- [ ] Error handling works properly (AC-9)
- [ ] No console errors during normal usage (AC-14)
- [ ] All user workflows validated

**Known Issues at Phase 3 End**:
- Only tested on macOS (cross-platform in Phase 4)
- Production build not yet tested (tested in Phase 4)
- Installers not yet generated (Phase 4)

**Commit Message**:
```
TEN-8: Verify all features in Tauri environment

- Test document editor with Tiptap in Tauri webview
- Verify Supabase network connectivity requirements
- Test network error handling with clear user messages
- Test all navigation routes and performance
- Validate error handling across error scenarios
- Confirm no console errors during normal usage
- Measure cold start time and memory usage

AC-5, AC-8, AC-9, AC-10, AC-11, AC-14, AC-15 complete

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Phase 4: Build & Distribution

**Goal**: Generate production builds, create installers for all platforms, validate cross-platform compatibility.

**Duration**: 1-2 days (8-16 hours)

**Acceptance Criteria**: AC-7, AC-12

### Stage 4.1: Production Build Configuration

**Tasks**:
1. Test production build locally:
   ```bash
   cd frontend
   npm run tauri:build
   ```

2. First build will take 5-10 minutes (Rust optimization)

3. Verify build output:
   ```bash
   ls -lh src-tauri/target/release/bundle/
   ```

4. Expected outputs (macOS):
   - `dmg/` - Disk image installer
   - `macos/` - .app bundle
   - Check file sizes (should be < 50MB)

5. Test built application:
   - Mount DMG
   - Drag .app to Applications
   - Launch from Applications folder
   - Verify all features work (same tests as Phase 3)

**Validation**:
- [ ] Build completes without errors
- [ ] Bundle size under 50MB (AC-12)
- [ ] Built app launches successfully
- [ ] All features work in production build

**Time**: 2 hours

**Maps to**: AC-7 (Cross-platform builds), AC-12 (Bundle size)

---

### Stage 4.2: macOS Code Signing

**Tasks**:
1. Verify Apple Developer account credentials
2. Install developer certificate:
   ```bash
   # Download Developer ID Application certificate from Apple Developer portal
   # Import to Keychain Access
   ```

3. Update `tauri.conf.json` for signing:
   ```json
   {
     "bundle": {
       "macOS": {
         "signing": {
           "identity": "Developer ID Application: Your Name (TEAM_ID)"
         }
       }
     }
   }
   ```

4. Build signed app:
   ```bash
   npm run tauri:build -- --target universal-apple-darwin
   ```

5. Verify signature:
   ```bash
   codesign -dv --verbose=4 src-tauri/target/release/bundle/macos/Tentacle.app
   ```

6. Test signed app:
   - Right-click .app → Open
   - Should not show "unidentified developer" warning

**Optional: Notarization**
```bash
# Notarize with Apple (requires Apple Developer account)
xcrun notarytool submit src-tauri/target/release/bundle/dmg/Tentacle_0.1.0_aarch64.dmg \
  --apple-id YOUR_EMAIL \
  --password APP_SPECIFIC_PASSWORD \
  --team-id TEAM_ID \
  --wait
```

**Files Modified**:
- `frontend/src-tauri/tauri.conf.json` (signing config)

**Validation**:
- Signed app runs without security warnings
- Gatekeeper accepts application

**Time**: 1-2 hours (depending on certificate setup)

**Maps to**: AC-9 (Security requirements), AC-7 (macOS installer)

---

### Stage 4.3: GitHub Actions CI/CD Setup

**Tasks**:
1. Create workflow file:
   ```bash
   mkdir -p .github/workflows
   ```

2. Create `.github/workflows/build-desktop.yml`:
   ```yaml
   name: Build Desktop App

   on:
     push:
       branches: [main, nicolasnleao/ten-8-*]
     pull_request:
       branches: [main]

   jobs:
     build:
       strategy:
         fail-fast: false
         matrix:
           include:
             - platform: 'macos-latest'
               target: 'universal-apple-darwin'
             - platform: 'ubuntu-22.04'
               target: 'x86_64-unknown-linux-gnu'
             - platform: 'windows-latest'
               target: 'x86_64-pc-windows-msvc'

       runs-on: ${{ matrix.platform }}

       steps:
         - uses: actions/checkout@v4

         - name: Install Rust
           uses: dtolnay/rust-toolchain@stable
           with:
             targets: ${{ matrix.target }}

         - name: Install Linux dependencies
           if: matrix.platform == 'ubuntu-22.04'
           run: |
             sudo apt-get update
             sudo apt-get install -y libwebkit2gtk-4.0-dev \
               libssl-dev \
               libgtk-3-dev \
               libayatana-appindicator3-dev \
               librsvg2-dev

         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: '20'

         - name: Install frontend dependencies
           working-directory: frontend
           run: npm ci

         - name: Build Tauri app
           working-directory: frontend
           env:
             NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
             NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
           run: npm run tauri:build -- --target ${{ matrix.target }}

         - name: Upload artifacts
           uses: actions/upload-artifact@v4
           with:
             name: tentacle-${{ matrix.platform }}
             path: |
               frontend/src-tauri/target/release/bundle/dmg/*.dmg
               frontend/src-tauri/target/release/bundle/deb/*.deb
               frontend/src-tauri/target/release/bundle/appimage/*.AppImage
               frontend/src-tauri/target/release/bundle/nsis/*.exe
               frontend/src-tauri/target/release/bundle/msi/*.msi
             if-no-files-found: warn
   ```

3. Add repository secrets:
   - Go to GitHub repository → Settings → Secrets
   - Add `NEXT_PUBLIC_SUPABASE_URL`
   - Add `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. Push workflow and test:
   ```bash
   git add .github/workflows/build-desktop.yml
   git commit -m "Add GitHub Actions build workflow"
   git push
   ```

5. Monitor workflow execution in GitHub Actions tab

**Files Created**:
- `.github/workflows/build-desktop.yml`

**Validation**:
- [ ] Workflow runs successfully on push
- [ ] Builds complete for all platforms (macOS, Windows, Linux)
- [ ] Artifacts uploaded for each platform
- [ ] No build errors in CI logs

**Time**: 2 hours (including troubleshooting)

**Maps to**: AC-7 (Cross-platform builds)

---

### Stage 4.4: Test Cross-Platform Installers

**Tasks**:
1. Download artifacts from GitHub Actions

2. **macOS Testing** (already done in Stage 4.1):
   - .dmg installer
   - .app bundle

3. **Windows Testing** (requires Windows machine or VM):
   - Download .exe installer from artifacts
   - Run installer on Windows 10/11
   - Test application launch
   - Verify features work (auth, documents, editor)
   - Expected: SmartScreen warning (unsigned)

4. **Linux Testing** (requires Linux machine or VM):
   - Download .AppImage from artifacts
   - Make executable: `chmod +x Tentacle*.AppImage`
   - Run: `./Tentacle*.AppImage`
   - Verify features work

**Platform-Specific Notes**:
- **Windows**: Installer may show SmartScreen warning (expected, unsigned)
- **Linux**: May need to install dependencies on fresh system
- **macOS**: Should work smoothly (signed)

**Validation Checklist**:
- [ ] macOS .dmg installs and runs
- [ ] Windows .exe installs and runs (AC-8)
- [ ] Linux .AppImage runs (AC-8)
- [ ] All platform builds under 50MB (AC-13)
- [ ] Features work identically across platforms (AC-8)

**Time**: 2-3 hours (requires access to multiple platforms)

**Maps to**: AC-8 (Cross-platform installers), AC-13 (Bundle size)

---

### Stage 4.5: Bundle Size Optimization (If Needed)

**Only if bundles exceed 50MB target**

**Tasks**:
1. Analyze bundle size:
   ```bash
   du -sh src-tauri/target/release/bundle/dmg/*.dmg
   ```

2. Optimization strategies:
   - Remove unused dependencies:
     ```bash
     npm run build -- --analyze
     ```
   - Enable Rust strip in `Cargo.toml`:
     ```toml
     [profile.release]
     strip = true
     opt-level = "z"
     lto = true
     codegen-units = 1
     ```
   - Reduce icon sizes (src-tauri/icons/)
   - Remove unused fonts from Next.js

3. Rebuild and retest

**Expected Results**:
- macOS: 15-25 MB (uses system WebKit)
- Windows: 30-40 MB (includes WebView2)
- Linux: 25-35 MB (depends on WebKitGTK)

**Time**: 1-2 hours (only if optimization needed)

**Maps to**: AC-13 (Bundle size under 50MB)

---

### Phase 4 Completion Criteria

**Deliverables**:
- [ ] Production builds working on macOS (AC-8)
- [ ] macOS code signing configured (AC-10)
- [ ] GitHub Actions CI/CD pipeline functional
- [ ] Installers generated for Windows and Linux (AC-8)
- [ ] Bundle sizes under 50MB for all platforms (AC-13)
- [ ] Cross-platform testing completed

**Known Issues at Phase 4 End**:
- Documentation not yet updated (Phase 5)
- App icons still default placeholders (Phase 5)

**Commit Message**:
```
TEN-8: Configure builds and cross-platform distribution

- Add production build configuration for all platforms
- Configure macOS code signing with Developer ID
- Set up GitHub Actions for automated cross-platform builds
- Generate installers for macOS (.dmg), Windows (.exe), Linux (.AppImage)
- Validate bundle sizes under 50MB target
- Test installers on all target platforms

AC-8, AC-13, AC-10 (partial) complete

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Phase 5: Documentation & Polish

**Goal**: Update documentation, finalize application icons, perform final validation.

**Duration**: 4-8 hours

**Acceptance Criteria**: AC-14, AC-15 (final validation)

### Stage 5.1: Update README Documentation

**Tasks**:
1. Update root `README.md`:
   ```markdown
   # Tentacle

   Voice-first note-taking with automatic semantic organization.

   ## What is Tentacle?

   Tentacle captures your thoughts via voice, transcribes them instantly, and automatically organizes them using AI-powered semantic analysis. Built for consultants, researchers, founders, and anyone who needs frictionless knowledge capture.

   **Available as a native desktop application for macOS, Windows, and Linux.**

   ## Download

   [Download the latest release](https://github.com/username/tentacle-app/releases)

   - **macOS**: Download `.dmg` file (macOS 11+)
   - **Windows**: Download `.exe` installer (Windows 10+)
   - **Linux**: Download `.AppImage` (Ubuntu 20.04+)

   ## Core Philosophy

   **Capture → Transcribe → Organize**

   - **Frictionless voice capture** - Zero friction recording
   - **Automatic organization** - AI categorizes and links notes
   - **Privacy-first** - Local-first architecture, you own your data
   - **Native desktop app** - Fast, secure, offline-capable

   ## Tech Stack

   - **Frontend**: Next.js 16 + TypeScript + Tailwind CSS
   - **Desktop**: Tauri v2 (Rust backend)
   - **Database**: Supabase (PostgreSQL + pgvector)
   - **Auth**: Supabase Auth (client-side)
   - **Voice**: Whisper API (planned)
   - **Vector Search**: pgvector + embeddings

   ## Development

   ### Prerequisites

   - Node.js 20+
   - Rust 1.70+ (install via [rustup](https://rustup.rs))
   - Platform-specific dependencies:
     - **macOS**: Xcode Command Line Tools
     - **Windows**: Microsoft Visual C++ Build Tools
     - **Linux**: WebKit2GTK, GTK3, etc. (see below)

   #### Linux Dependencies

   ```bash
   # Ubuntu/Debian
   sudo apt install libwebkit2gtk-4.0-dev \
     libssl-dev \
     libgtk-3-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev

   # Fedora
   sudo dnf install webkit2gtk4.0-devel \
     openssl-devel \
     gtk3-devel \
     libappindicator-gtk3-devel \
     librsvg2-devel
   ```

   ### Setup

   ```bash
   # Clone repository
   git clone https://github.com/username/tentacle-app.git
   cd tentacle-app

   # Install dependencies
   cd frontend
   npm install

   # Configure environment variables
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

   ### Running Development Server

   ```bash
   cd frontend
   npm run tauri:dev
   ```

   The desktop application will launch with hot reload enabled. Changes to frontend code will automatically refresh the app.

   ### Building for Production

   ```bash
   cd frontend
   npm run tauri:build
   ```

   Installers will be generated in `frontend/src-tauri/target/release/bundle/`:
   - macOS: `.dmg` in `dmg/`
   - Windows: `.exe` in `nsis/`, `.msi` in `msi/`
   - Linux: `.AppImage` in `appimage/`, `.deb` in `deb/`

   ## Environment Variables

   Copy `.env.example` to `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

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
   ├── .github/workflows/    # CI/CD pipelines
   └── README.md             # This file
   ```

   ## Troubleshooting

   ### Build Errors on macOS
   - Ensure Xcode Command Line Tools installed: `xcode-select --install`
   - Update Rust: `rustup update stable`

   ### Build Errors on Windows
   - Install Visual C++ Build Tools
   - Ensure WebView2 runtime installed (pre-installed on Windows 11)

   ### Build Errors on Linux
   - Install all required dependencies (see above)
   - Update system: `sudo apt update && sudo apt upgrade`

   ### Application Won't Launch
   - Check console output for errors
   - Verify environment variables in `.env.local`
   - Try running with debug logs: `RUST_LOG=debug npm run tauri:dev`

   ## Contributing

   This is a personal project currently under active development. Issues and pull requests welcome!

   ## License

   MIT License - see LICENSE file for details
   ```

2. Create `frontend/README.md` with Tauri-specific instructions:
   ```markdown
   # Tentacle Frontend

   Next.js + Tauri desktop application.

   ## Development

   ```bash
   npm install
   npm run tauri:dev
   ```

   ## Building

   ```bash
   npm run tauri:build
   ```

   ## Architecture

   - **Next.js**: Static export mode (SSG)
   - **Tauri**: Rust backend for native OS integration
   - **Auth**: Client-side Supabase authentication
   - **Database**: Direct Supabase client calls

   See `../specs/TEN-8-tauri-desktop-app/architecture.md` for details.
   ```

**Files Modified**:
- `/Users/nicolas/Code/polvera/tentacle-app/README.md`

**Files Created**:
- `/Users/nicolas/Code/polvera/tentacle-app/frontend/README.md`

**Validation**: Documentation is clear, accurate, and complete.

**Time**: 2 hours

**Maps to**: AC-14 (Documentation updated)

---

### Stage 5.2: Create Application Icons

**Tasks**:
1. Design application icon (1024x1024 PNG):
   - Tentacle theme (octopus/tentacle motif)
   - Simple, recognizable at small sizes
   - Follows platform guidelines

2. Generate icon variants:
   ```bash
   cd frontend/src-tauri/icons
   # Use online tool or ImageMagick to generate sizes:
   # 32x32.png, 128x128.png, 128x128@2x.png
   # icon.icns (macOS), icon.ico (Windows)
   ```

3. Tools:
   - [Tauri Icon Generator](https://github.com/tauri-apps/tao/tree/dev/examples/icon)
   - Or use `tauri icon` command:
     ```bash
     npm run tauri icon path/to/icon-1024.png
     ```

4. Update icons in `src-tauri/icons/` directory

5. Rebuild and verify:
   ```bash
   npm run tauri:build
   ```

6. Check icon appears:
   - macOS: Dock, Applications folder
   - Windows: Taskbar, Start menu
   - Linux: Application launcher

**Files Modified**:
- `frontend/src-tauri/icons/` (all icon files)

**Validation**: Application displays custom icon on all platforms.

**Time**: 1-2 hours (depends on design time)

---

### Stage 5.3: Final Validation & Testing

**Tasks**:
1. Run complete test suite from Phase 3 on production build
2. Verify all acceptance criteria one final time:

**AC-1: Tauri Project Structure**
- [ ] `src-tauri/` directory exists
- [ ] `tauri.conf.json` properly configured
- [ ] `package.json` has Tauri scripts
- [ ] `Cargo.toml` has dependencies

**AC-2: Static Export Configuration**
- [ ] Next.js generates static HTML in `out/`
- [ ] No server-side rendering
- [ ] All routes pre-rendered
- [ ] Images unoptimized

**AC-3: Desktop Application Launch**
- [ ] Window opens with correct dimensions
- [ ] Home page loads
- [ ] UI renders without errors
- [ ] Responsive to interactions

**AC-4: Authentication Flow**
- [ ] Login works with valid credentials
- [ ] Session persists after app restart
- [ ] Protected routes accessible after auth
- [ ] Logout clears session and redirects

**AC-5: Voice Notes Functionality**
- [ ] Microphone permission works
- [ ] Recording functions (if implemented)
- [ ] Audio capture works (if implemented)

**AC-6: Document Editor**
- [ ] Tiptap renders correctly
- [ ] Formatting controls work
- [ ] Content saves to Supabase
- [ ] Changes persist across restarts

**AC-7: Development Workflow**
- [ ] Hot reload works automatically
- [ ] No manual restart needed
- [ ] Console logs visible
- [ ] DevTools accessible

**AC-8: Cross-Platform Builds**
- [ ] macOS installer generated
- [ ] Windows installer generated
- [ ] Linux installer generated
- [ ] All features work on all platforms

**AC-9: Error Handling**
- [ ] Friendly error messages
- [ ] No crashes
- [ ] Errors logged
- [ ] User can recover

**AC-10: Security Requirements**
- [ ] Tokens stored securely (localStorage)
- [ ] No plain text token storage
- [ ] CSP headers implemented
- [ ] No external script execution

**AC-11: Cold Start Time**
- [ ] Application launches in < 3 seconds
- [ ] Measured on modern hardware

**AC-12: Navigation Performance**
- [ ] Page navigation instant
- [ ] No network requests for routing

**AC-13: Bundle Size**
- [ ] macOS installer < 50MB
- [ ] Windows installer < 50MB
- [ ] Linux installer < 50MB

**AC-14: Documentation**
- [ ] README updated
- [ ] Setup instructions clear
- [ ] Build instructions documented
- [ ] Troubleshooting section included

**AC-15: No Console Errors**
- [ ] No errors during normal usage
- [ ] No React warnings
- [ ] No Supabase errors (when online)
- [ ] Clean console output

**Final Checks**:
- [ ] All 15 acceptance criteria pass
- [ ] Performance targets met
- [ ] Security requirements satisfied
- [ ] Documentation complete

**Time**: 2 hours

**Maps to**: All acceptance criteria (final validation)

---

### Stage 5.4: Create Release Notes

**Tasks**:
1. Document release summary in Linear issue TEN-8
2. Prepare release notes for GitHub (if applicable):
   ```markdown
   # Tentacle v0.1.0 - Desktop Application

   First release of Tentacle as a native desktop application!

   ## What's New

   - **Native Desktop App**: Available for macOS, Windows, and Linux
   - **Offline Capable**: No internet required for app to run
   - **Fast Performance**: Sub-3-second cold start, instant navigation
   - **Secure**: Client-side authentication with platform security
   - **Small Bundle**: 15-40MB depending on platform

   ## Downloads

   - **macOS** (11+): [Tentacle.dmg](link)
   - **Windows** (10+): [Tentacle-setup.exe](link)
   - **Linux**: [Tentacle.AppImage](link)

   ## Installation

   ### macOS
   1. Download `.dmg` file
   2. Open and drag to Applications folder
   3. Launch from Applications

   ### Windows
   1. Download `.exe` installer
   2. Run installer (may show SmartScreen warning - click "More info" → "Run anyway")
   3. Launch from Start menu

   ### Linux
   1. Download `.AppImage` file
   2. Make executable: `chmod +x Tentacle*.AppImage`
   3. Run: `./Tentacle*.AppImage`

   ## Known Issues

   - Windows installer is unsigned (SmartScreen warning expected)
   - Linux requires WebKit2GTK dependencies

   ## Technical Details

   - **Framework**: Tauri v2 with Next.js 16
   - **Authentication**: Supabase client-side
   - **Database**: Supabase PostgreSQL
   - **Bundle Size**: 15-40MB
   - **Minimum OS**: macOS 11, Windows 10, Ubuntu 20.04

   ## Changelog

   See full details in [architecture.md](link) and [plan.md](link).
   ```

**Time**: 30 minutes

---

### Phase 5 Completion Criteria

**Deliverables**:
- [ ] Documentation fully updated (AC-14)
- [ ] Application icons finalized
- [ ] All acceptance criteria validated (AC-1 through AC-15)
- [ ] Release notes prepared
- [ ] Linear issue updated with summary

**Commit Message**:
```
TEN-8: Finalize documentation and polish

- Update README with Tauri setup and build instructions
- Add troubleshooting guide for all platforms
- Create custom application icons for desktop
- Validate all 15 acceptance criteria
- Prepare release notes and final summary

AC-14 complete, all acceptance criteria validated

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Summary of Deliverables

### Phase 1: Infrastructure Setup (1-2 days)
- Tauri project structure created
- Next.js configured for static export
- Application launches in development
- Hot reload working

### Phase 2: Authentication Migration (1-2 days)
- Server-side auth removed
- Client-only authentication working
- Protected routes enforcing auth
- API routes replaced with direct Supabase calls

### Phase 3: Feature Verification (1 day)
- Document editor tested and working
- Voice recording compatibility verified
- Performance targets validated
- Error handling confirmed
- No console errors

### Phase 4: Build & Distribution (1-2 days)
- Production builds for all platforms
- macOS code signing configured
- CI/CD pipeline automated
- Cross-platform installers generated
- Bundle sizes validated

### Phase 5: Documentation & Polish (0.5-1 day)
- Documentation updated
- Application icons created
- Final validation complete
- Release notes prepared

## Total Time Estimate

**Minimum**: 5 days (40 hours)
**Maximum**: 7 days (56 hours)
**Expected**: 6 days (48 hours)

## Risk Mitigation Checklist

- [ ] Rust toolchain installed before starting
- [ ] Supabase RLS policies verified before Phase 2
- [ ] Early testing of Tiptap in Phase 3
- [ ] Web Audio API proof-of-concept in Phase 3
- [ ] Windows/Linux testing planned for Phase 4
- [ ] Code signing certificates ready for Phase 4
- [ ] GitHub Actions secrets configured before Phase 4

## Success Criteria

All 15 acceptance criteria must pass:
- [x] AC-1: Tauri project structure
- [x] AC-2: Static export configuration
- [x] AC-3: Desktop application launch
- [x] AC-4: Authentication flow
- [x] AC-5: Document editor
- [x] AC-6: Hot reload during development
- [x] AC-7: Cross-platform builds
- [x] AC-8: Error handling and network requirements
- [x] AC-9: Security requirements
- [x] AC-10: Cold start time
- [x] AC-11: Document list loading performance
- [x] AC-12: Bundle size
- [x] AC-13: Documentation
- [x] AC-14: No console errors
- [x] AC-15: Supabase network operations

## Next Steps

1. **Product Owner**: Review and approve this plan
2. **Development Agent**: Begin Phase 1 implementation
3. **Weekly Sync**: Review progress and blockers
4. **Post-Implementation**: Update Linear issue with results and lessons learned
