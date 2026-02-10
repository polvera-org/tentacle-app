# Architecture: Authentication System (TEN-5)

## 1. System Overview

Tentacle's authentication system provides secure, frictionless user access to voice-powered note-taking functionality. Built on Supabase Auth, the system enables email/password authentication with automatic session persistence, protecting user notes and ensuring data privacy across mobile devices.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         TENTACLE APP                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   /login     │  │   /signup    │  │ /app/*       │          │
│  │   (public)   │  │   (public)   │  │ (protected)  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                  │
│         └─────────────────┴─────────────────┘                  │
│                           │                                     │
│                    ┌──────▼──────┐                             │
│                    │ Auth Context │                             │
│                    │  (React)     │                             │
│                    └──────┬──────┘                             │
│                           │                                     │
│                    ┌──────▼──────┐                             │
│                    │ Supabase SSR │                             │
│                    │   Client     │                             │
│                    └──────┬──────┘                             │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    ┌──────▼──────┐                             │
│                    │   SUPABASE   │                             │
│                    │              │                             │
│                    │ ┌──────────┐ │                             │
│                    │ │ Auth API │ │                             │
│                    │ └──────────┘ │                             │
│                    │ ┌──────────┐ │                             │
│                    │ │  Users   │ │                             │
│                    │ │   Table  │ │                             │
│                    │ └──────────┘ │                             │
│                    │ ┌──────────┐ │                             │
│                    │ │ Sessions │ │                             │
│                    │ └──────────┘ │                             │
│                    └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Server-Side Rendering (SSR) First**: Use Supabase SSR package for secure server-side auth checks
- **Middleware Protection**: Next.js middleware for route-level protection
- **Context Pattern**: React Context for client-side auth state synchronization
- **Automatic Token Refresh**: Supabase handles access token refresh automatically
- **Mobile-Optimized**: Touch-friendly forms with 48px minimum touch targets

---

## 2. Technology Stack

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.48.0 | Main Supabase client |
| `@supabase/ssr` | ^0.5.2 | SSR-aware Supabase client for Next.js App Router |
| `next` | 16.1.6 | Framework (already installed) |
| `react` | 19.2.3 | UI library (already installed) |
| `tailwindcss` | ^4 | Styling (already installed) |

### Installation Commands

```bash
# Install Supabase auth packages
cd /a0/usr/projects/agency/code/tentacle-app/frontend
npm install @supabase/supabase-js @supabase/ssr

# Dev dependencies (if needed for testing)
npm install -D @testing-library/react @testing-library/jest-dom
```

### Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- iOS Safari 14+

---

## 3. Data Flow

### Authentication Flows

#### 3.1 Signup Flow

```
┌────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│  User  │     │ Signup Form  │     │  Supabase    │     │   Session   │
└───┬────┘     └──────┬───────┘     └──────┬───────┘     └──────┬──────┘
    │                 │                    │                    │
    │ Enter email/pwd │                    │                    │
    │──────────────>│                    │                    │
    │                 │  signUp()          │                    │
    │                 │───────────────────>│                    │
    │                 │                    │ Create user        │
    │                 │                    │───────────────────>│
    │                 │  {user, session}   │                    │
    │                 │<───────────────────│                    │
    │                 │                    │                    │
    │ Redirect to /app                    │                    │
    │<─────────────────────────────────────────────────────────│
```

#### 3.2 Login Flow

```
┌────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│  User  │     │  Login Form  │     │  Supabase    │     │   Session   │
└───┬────┘     └──────┬───────┘     └──────┬───────┘     └──────┬──────┘
    │                 │                    │                    │
    │ Enter email/pwd │                    │                    │
    │──────────────>│                    │                    │
    │                 │  signInWithPassword()                  │
    │                 │───────────────────>│                    │
    │                 │                    │ Verify credentials │
    │                 │                    │───────────────────>│
    │                 │  {session}         │                    │
    │                 │<───────────────────│                    │
    │                 │                    │                    │
    │  Redirect to    │                    │                    │
    │  returnUrl or   │                    │                    │
    │  /app           │                    │                    │
    │<─────────────────────────────────────────────────────────│
```

#### 3.3 Session Restoration Flow

```
┌────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│  User  │     │   Layout     │     │   Middleware │     │  Supabase   │
└───┬────┘     └──────┬───────┘     └──────┬───────┘     └──────┬──────┘
    │                 │                    │                    │
    │ Open PWA        │                    │                    │
    │────────────────>│                    │                    │
    │                 │ getSession()       │                    │
    │                 │────────────────────────────────────────>│
    │                 │                    │                    │
    │                 │  {session} or null │                    │
    │                 │<────────────────────────────────────────│
    │                 │                    │                    │
    │  Render protected│                   │                    │
    │  or public view  │                   │                    │
    │<──────────────────────────────────────────────────────────│
```

#### 3.4 Password Reset Flow

```
┌────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  User  │     │ Reset Page   │     │  Supabase    │     │   Email      │
└───┬────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
    │                 │                    │                    │
    │ Request reset   │                    │                    │
    │────────────────>│                    │                    │
    │                 │ resetPasswordForEmail()                  │
    │                 │───────────────────>│                    │
    │                 │                    │ Send reset email   │
    │                 │                    │───────────────────>│
    │                 │ Success message    │                    │
    │<──────────────────────────────────────────────────────────│
    │                 │                    │                    │
    │ Check email     │                    │                    │
    │────────────────────────────────────────────────────────>│
    │                 │                    │                    │
    │ Click link      │                    │                    │
    │────────────────────────────────────────────────────────>│
    │                 │                    │                    │
    │ Redirect to     │                    │                    │
    │ /reset-password │                    │                    │
    │/confirm?token=.. │                   │                    │
    │<──────────────────────────────────────────────────────────│
```

---

## 4. Component Architecture

### File Structure

```
frontend/
├── app/
│   ├── login/
│   │   └── page.tsx              # Login page (Server Component)
│   ├── signup/
│   │   └── page.tsx              # Signup page (Server Component)
│   ├── reset-password/
│   │   ├── page.tsx              # Reset request page
│   │   └── confirm/
│   │       └── page.tsx          # New password page
│   ├── app/
│   │   ├── page.tsx              # Protected dashboard (Server Component)
│   │   └── layout.tsx            # Protected layout
│   ├── api/
│   │   └── auth/
│   │       └── callback/
│   │           └── route.ts      # Auth callback handler
│   ├── layout.tsx                # Root layout with AuthProvider
│   └── page.tsx                  # Landing page (public)
├── components/
│   └── auth/
│       ├── login-form.tsx        # Login form (Client Component)
│       ├── signup-form.tsx       # Signup form (Client Component)
│       ├── password-reset-form.tsx    # Reset request form
│       ├── password-reset-confirm.tsx # New password form
│       └── auth-guard.tsx        # Client-side auth guard
├── lib/
│   └── auth/
│       ├── supabase-client.ts    # Browser client
│       ├── supabase-server.ts    # Server client (SSR)
│       ├── supabase-middleware.ts # Middleware client
│       └── auth-context.tsx      # React Context for auth
├── middleware.ts                 # Next.js middleware (route protection)
└── types/
    └── auth.ts                   # TypeScript types
```

### Component Details

#### 4.1 Server Components

**`app/login/page.tsx`**
- Server Component (no 'use client')
- Checks for existing session, redirects to /app if authenticated
- Renders LoginForm client component

**`app/signup/page.tsx`**
- Server Component
- Checks for existing session
- Renders SignupForm client component

**`app/app/page.tsx`**
- Server Component (protected)
- Middleware ensures authentication before reaching this component

#### 4.2 Client Components

**`components/auth/login-form.tsx`**
```typescript
'use client'

// Form state with useState
// Real-time validation
// Supabase signInWithPassword
// Error handling with toast notifications
// Loading states with spinner
// 'Remember Me' checkbox (affects session persistence)
```

**`components/auth/signup-form.tsx`**
```typescript
'use client'

// Password strength indicator
// Real-time validation
// Terms acceptance checkbox
// Supabase signUp
// Auto-login after signup
// Error handling for existing emails
```

**`lib/auth/auth-context.tsx`**
```typescript
'use client'

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}
```

#### 4.3 Utility Functions

**`lib/auth/supabase-client.ts`** (Browser Client)
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`lib/auth/supabase-server.ts`** (Server Client)
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}
```

**`lib/auth/supabase-middleware.ts`** (Middleware Client)
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  return { user, response: supabaseResponse }
}
```

---

## 5. Database Schema

### Supabase Auth Tables (Managed by Supabase)

Supabase Auth automatically manages these tables:

**`auth.users`**
```sql
-- Managed by Supabase, read-only for application
-- Columns include:
-- id (uuid, PK)
-- email (text)
-- encrypted_password (text)
-- email_confirmed_at (timestamptz)
-- created_at (timestamptz)
-- updated_at (timestamptz)
-- last_sign_in_at (timestamptz)
-- raw_app_meta_data (jsonb)
-- raw_user_meta_data (jsonb)
```

**`auth.sessions`**
```sql
-- Managed by Supabase
-- id (uuid, PK)
-- user_id (uuid, FK to auth.users)
-- created_at (timestamptz)
-- updated_at (timestamptz)
-- factor_id (uuid, nullable)
-- aal (text) - Authentication Assurance Level
-- not_after (timestamptz)
```

**`auth.refresh_tokens`**
```sql
-- Managed by Supabase for session persistence
```

### Application Tables

**`public.profiles`** (Custom user data)
```sql
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- RLS Policies
-- Users can only read/update their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);
```

**`public.notes`** (Example app data)
```sql
create table public.notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  content text,
  audio_url text,
  transcription text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.notes enable row level security;

-- RLS Policy: Users can only access their own notes
create policy "Users can CRUD own notes"
  on public.notes for all
  using (auth.uid() = user_id);
```

---

## 6. API Integration

### Supabase Client Configuration

**Environment Variables**
```bash
# .env.local (never commit this file)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Server-only
```

**`.env.example`** (committed to repo)
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Optional: Analytics
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

### Auth API Methods

**Sign Up**
```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'SecurePass123',
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
})
```

**Sign In**
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'SecurePass123',
})
```

**Sign Out**
```typescript
const { error } = await supabase.auth.signOut()
```

**Reset Password**
```typescript
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password/confirm`,
})
```

**Update Password**
```typescript
const { error } = await supabase.auth.updateUser({
  password: 'NewSecurePass123',
})
```

**Get Session**
```typescript
const { data: { session } } = await supabase.auth.getSession()
```

**Get User**
```typescript
const { data: { user } } = await supabase.auth.getUser()
```

### Auth State Change Listener

```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === 'SIGNED_IN') {
        setUser(session?.user ?? null)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
      } else if (event === 'PASSWORD_RECOVERY') {
        // Handle password recovery flow
      }
    }
  )

  return () => subscription.unsubscribe()
}, [])
```

---

## 7. Security Considerations

### 7.1 Row Level Security (RLS)

**Principle**: Every table with user data must have RLS enabled with policies restricting access to the authenticated user.

**Example Policies**:
```sql
-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.notes enable row level security;

-- Users can only access their own data
create policy "Users can only access own data"
  on public.notes for all
  using (auth.uid() = user_id);
```

### 7.2 Session Management

- **Access Token**: Short-lived (1 hour by default), stored in memory
- **Refresh Token**: Long-lived (7 days with "Remember Me"), stored in secure httpOnly cookie
- **Session Persistence**: Handle via Supabase SSR cookie management

### 7.3 CSRF Protection

- Next.js App Router handles CSRF protection automatically
- Use POST for all state-changing operations
- Supabase tokens are stored in httpOnly cookies, not localStorage

### 7.4 Rate Limiting

Supabase Auth provides built-in rate limiting:
- 5 failed login attempts → 15-minute lockout per IP
- 3 password reset requests per hour per email

### 7.5 Secure Headers

Add to `next.config.ts`:
```typescript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },
}
```

### 7.6 Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- Optional: 1 special character (to be decided)

### 7.7 Error Handling

**Security Through Obscurity**:
- Invalid email or password → "Invalid email or password" (don't reveal which)
- Existing email on signup → "This email is already registered. Try logging in instead."
- Rate limited → "Too many attempts. Please try again later."

---

## 8. State Management

### Auth Context Pattern

**Why Context over Redux/Zustand?**
- Auth state is relatively simple (user + session + loading)
- Supabase manages the underlying session state
- Context provides sufficient reactivity for auth state
- Simpler dependency tree, fewer potential issues

**Context Structure**:
```typescript
// lib/auth/auth-context.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from './supabase-client'

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

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

  const value = {
    user,
    session,
    isLoading,
    signIn: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      return { error }
    },
    signUp: async (email: string, password: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })
      return { error }
    },
    signOut: async () => {
      await supabase.auth.signOut()
    },
    resetPassword: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password/confirm`,
      })
      return { error }
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

### Server Component Access

In Server Components, use the server client directly:
```typescript
import { createClient } from '@/lib/auth/supabase-server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }
  
  // User is authenticated, render dashboard
}
```

---

## 9. Environment Variables

### Required Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key for client-side | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key for server operations | Supabase Dashboard > Settings > API |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics key | - |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host URL | - |

### Local Development Setup

1. Create `.env.local` in `frontend/` directory
2. Copy values from `.env.example`
3. Fill in your Supabase project credentials

### Supabase Project Setup

1. Go to [supabase.com](https://supabase.com) and create new project
2. Navigate to Project Settings > API
3. Copy `URL` and `anon public` key
4. Add to `.env.local`

### Production Deployment

Set environment variables in your hosting platform (Vercel, Netlify, etc.):

**Vercel**:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

---

## 10. Implementation Phases

### Phase 1: Supabase Setup (Day 1, Morning)

**Tasks**:
- [ ] Create Supabase project
- [ ] Configure email templates (optional for MVP)
- [ ] Set up environment variables
- [ ] Install Supabase packages
- [ ] Create database schema (profiles, notes tables)
- [ ] Configure RLS policies

**Deliverables**:
- Working Supabase project with auth enabled
- `.env.local` configured
- Database migrations applied

### Phase 2: Auth Infrastructure (Day 1, Afternoon)

**Tasks**:
- [ ] Create `lib/auth/supabase-client.ts` (browser)
- [ ] Create `lib/auth/supabase-server.ts` (server)
- [ ] Create `lib/auth/supabase-middleware.ts` (middleware)
- [ ] Create `lib/auth/auth-context.tsx` (React context)
- [ ] Update `app/layout.tsx` with AuthProvider
- [ ] Create `middleware.ts` for route protection

**Deliverables**:
- All auth utilities created and tested
- Auth context wrapping the app
- Middleware protecting `/app/*` routes

### Phase 3: Auth Pages (Day 2)

**Tasks**:
- [ ] Create `app/login/page.tsx`
- [ ] Create `components/auth/login-form.tsx`
- [ ] Create `app/signup/page.tsx`
- [ ] Create `components/auth/signup-form.tsx`
- [ ] Create `app/reset-password/page.tsx`
- [ ] Create `components/auth/password-reset-form.tsx`
- [ ] Create `app/reset-password/confirm/page.tsx`
- [ ] Create `components/auth/password-reset-confirm.tsx`
- [ ] Add form validation (email format, password strength)
- [ ] Add error handling and loading states

**Deliverables**:
- Functional login page
- Functional signup page
- Password reset flow working
- All forms validated and accessible

### Phase 4: Protected Routes & Polish (Day 3)

**Tasks**:
- [ ] Create `app/app/page.tsx` (protected dashboard)
- [ ] Implement logout functionality
- [ ] Add session persistence testing
- [ ] Add "Remember Me" functionality
- [ ] Implement return URL redirect after login
- [ ] Add loading states and skeletons
- [ ] Mobile responsiveness testing
- [ ] Dark mode verification
- [ ] Accessibility audit (keyboard nav, screen readers)
- [ ] Add analytics instrumentation

**Deliverables**:
- Protected dashboard accessible only to authenticated users
- Session persistence working across reloads
- Mobile-optimized UI
- Accessibility compliance (WCAG 2.1 AA)
- Analytics events tracking

### Phase 5: QA & Security Review (Day 3, Afternoon)

**Tasks**:
- [ ] Test all auth flows end-to-end
- [ ] Verify RLS policies are working
- [ ] Test session expiration handling
- [ ] Test password reset expiration
- [ ] Rate limiting verification
- [ ] Security headers check
- [ ] Performance audit (Lighthouse)
- [ ] Cross-browser testing
- [ ] Mobile device testing (iOS Safari, Chrome Android)

**Deliverables**:
- All acceptance criteria passing
- Security review completed
- Performance budget met
- Ready for merge

---

## 11. Code Examples

### Complete Login Form

```typescript
// components/auth/login-form.tsx
'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { signIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('returnUrl') || '/app'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const { error } = await signIn(email, password)
    
    if (error) {
      setError('Invalid email or password. Please try again.')
      setIsLoading(false)
      return
    }

    router.push(returnUrl)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
          {error}
        </div>
      )}
      
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <div className="flex items-center">
        <input
          id="remember"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="remember" className="text-sm">
          Remember me
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2 px-4 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50"
      >
        {isLoading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  )
}
```

### Complete Middleware

```typescript
// middleware.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/auth/supabase-middleware'

// Public routes that don't require authentication
const publicRoutes = ['/', '/login', '/signup', '/reset-password']

export async function middleware(request: NextRequest) {
  const { user, response } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Check if the route is public
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  )

  // Allow public routes
  if (isPublicRoute) {
    // If user is logged in and tries to access login/signup, redirect to app
    if (user && (pathname === '/login' || pathname === '/signup')) {
      return Response.redirect(new URL('/app', request.url))
    }
    return response
  }

  // Protected route - redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('returnUrl', pathname)
    return Response.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### Protected Page Example

```typescript
// app/app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/auth/supabase-server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2">Welcome, {user.email}!</p>
    </div>
  )
}
```

---

## 12. Testing Strategy

### Unit Tests

Test auth utilities and context in isolation:
- Form validation logic
- Password strength checker
- Auth context state changes

### Integration Tests

Test complete flows:
- Signup → Login → Access protected page
- Password reset flow
- Session persistence across reloads

### E2E Tests

Use Playwright or Cypress:
- User journey: Signup → Create note → Logout
- Mobile viewport testing
- Cross-browser testing

### Manual Testing Checklist

- [ ] Signup with valid email/password
- [ ] Signup with existing email (error message)
- [ ] Login with valid credentials
- [ ] Login with invalid credentials (generic error)
- [ ] Password reset request
- [ ] Password reset with expired token
- [ ] Session persists after page reload
- [ ] Session expires after 7 days
- [ ] Logout clears session
- [ ] Protected routes redirect when not logged in
- [ ] Mobile touch targets are 48px+
- [ ] Keyboard navigation works
- [ ] Screen reader announces errors

---

## 13. Performance Considerations

### Bundle Size

- Supabase client: ~30KB gzipped
- Keep auth forms lightweight (no heavy dependencies)
- Lazy load non-critical auth components

### Loading States

- Show skeleton screens while checking auth state
- Immediate feedback on button clicks
- Debounce form submissions to prevent double-clicks

### Network Optimization

- Supabase client handles token refresh automatically
- Use server components where possible to reduce client JS

---

## 14. Monitoring & Analytics

### Events to Track

```typescript
// lib/analytics/auth-events.ts

export const trackAuthEvent = (event: string, properties?: object) => {
  if (typeof window !== 'undefined' && (window as any).posthog) {
    ;(window as any).posthog.capture(event, properties)
  }
}

// Usage:
trackAuthEvent('auth:signup_completed', { method: 'email' })
trackAuthEvent('auth:login_failed', { reason: 'invalid_credentials' })
```

### Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Signup completion rate | ≥85% | <80% |
| Login success rate | ≥95% | <90% |
| Time to first capture | <10s | >15s |
| Session persistence (7d) | ≥90% | <80% |

---

## 15. ADRs

### ADR-001: Supabase Auth vs Custom Auth

**Context**: Need to choose between Supabase Auth, Auth0, Clerk, or custom JWT implementation.

**Decision**: Use Supabase Auth

**Rationale**:
- Already using Supabase for database
- Free tier sufficient for MVP
- Built-in session management
- Excellent Next.js SSR support via @supabase/ssr
- Row Level Security integration

**Consequences**:
- (+) Reduced complexity, single vendor
- (+) Built-in security best practices
- (+) Easy migration path if needed later
- (-) Vendor lock-in to Supabase

**Status**: Accepted

### ADR-002: Context vs Redux for Auth State

**Context**: Need to decide state management approach for auth state.

**Decision**: Use React Context

**Rationale**:
- Auth state is relatively simple
- Supabase manages underlying session
- Context sufficient for our use case
- Simpler than Redux/Zustand

**Consequences**:
- (+) Simpler codebase
- (+) Fewer dependencies
- (-) May need to migrate if auth complexity grows

**Status**: Accepted

### ADR-003: Server vs Client Auth Checks

**Context**: Need to protect routes from unauthorized access.

**Decision**: Use Next.js Middleware for initial protection + Server Components for user data

**Rationale**:
- Middleware runs on edge, fast redirects
- Server Components get fresh user data
- Client Context syncs state across components
- Defense in depth

**Consequences**:
- (+) Multiple layers of protection
- (+) Good performance
- (-) Slightly more complex setup

**Status**: Accepted

---

## 16. Open Questions

| Question | Status | Notes |
|----------|--------|-------|
| Email verification required before first use? | **DECIDED: No** | Skip for MVP speed, add post-launch |
| Password complexity (special chars required)? | **DECIDED: Optional** | 8 chars + 1 upper + 1 lower + 1 number minimum |
| Magic link authentication? | **DECIDED: Post-MVP** | Nice to have, not critical for MVP |
| Social auth (Google/Apple)? | **DECIDED: Post-MVP** | Add after core functionality stable |
| Session duration? | **DECIDED: 7 days** | With "Remember Me" option |

---

## 17. Definition of Done

### Technical
- [ ] All auth flows implemented and tested
- [ ] Middleware protecting /app/* routes
- [ ] Session persistence working (7 days)
- [ ] Password reset flow end-to-end tested
- [ ] RLS policies configured and verified
- [ ] Error handling for all edge cases
- [ ] Mobile responsive on iOS and Android
- [ ] Dark mode functional

### Quality
- [ ] Lighthouse accessibility score ≥95
- [ ] No console errors or warnings
- [ ] All acceptance criteria passing
- [ ] Security review completed
- [ ] Performance budget met (<2s initial load)

### Documentation
- [ ] Environment variables documented
- [ ] Architecture.md complete
- [ ] Handoff notes for future auth features

---

**Architecture Version**: 1.0  
**Last Updated**: 2026-02-10  
**Author**: System Architect (Tentacle Team)
