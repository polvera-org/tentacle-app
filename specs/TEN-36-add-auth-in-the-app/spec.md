# TEN-36: Add Account Modal and Home Auth Redirect

## Goal

Add an in-app account modal for profile name management and plan/waitlist UI, plus automatic redirect from the landing page to `/app` for authenticated users.

---

## Implementation Steps

### Step 1: Add Profile Data Access and Waitlist Config

**Goal:** Create typed client-side helpers for reading/updating the authenticated user's profile name in Supabase and centralize the Pro waitlist URL configuration.

**Context:**
- Supabase client modules use `'use client'` + `createClient()` from `frontend/lib/auth/supabase-client.ts`
- Reference `frontend/lib/notifications/api.ts` for query style, defensive parsing, and error logging
- Auth state is available from `useAuth()` in `frontend/lib/auth/auth-context.tsx` (`user`, `isLoading`)
- Supabase schema in `supabase/migrations/001_initial_schema.sql`: table `public.profiles` has `id`, `email`, `full_name`, `updated_at`
- RLS allows users to select/update their own row
- Currently no profile helper module and no waitlist config key

**Instructions:**
1. Create `frontend/lib/account/profile.ts` with:
   - Typed profile shape
   - `fetchProfileByUserId(userId: string): Promise<{ id: string; email: string; full_name: string | null; updated_at: string } | null>`
   - `saveProfileName(params: { userId: string; email: string; fullName: string }): Promise<{ id: string; email: string; full_name: string | null; updated_at: string } | null>`
   - `saveProfileName` must trim input, coerce empty string to `null`, and upsert into `profiles` with `onConflict: 'id'`

2. Create `frontend/lib/account/pro-plan.ts` with:
   - `getProWaitlistUrl(): string | null` that reads `process.env.NEXT_PUBLIC_PRO_WAITLIST_URL`, trims it, and returns `null` when absent/empty

3. Update `.env.example` by adding optional commented entry for `NEXT_PUBLIC_PRO_WAITLIST_URL`

**Verification:**
```bash
cd frontend && npx tsc --noEmit && npm run lint && rg -n 'fetchProfileByUserId|saveProfileName|getProWaitlistUrl|NEXT_PUBLIC_PRO_WAITLIST_URL' lib/account ../.env.example
```

---

### Step 2: Create My Account Modal Component

**Goal:** Build a reusable modal that lets authenticated users edit their profile name, shows Free plan status, and exposes a Pro waitlist CTA.

**Context:**
- Modal pattern exists in `frontend/components/settings/settings-modal.tsx` and `frontend/components/ui/confirm-dialog.tsx`
- Close on backdrop and Escape, use `h-11` rounded controls for touch targets
- Auth user data from `useAuth()` (`user` includes `id`, `email`, optional `user_metadata.full_name`)
- Mobile-first design with thumb-friendly spacing

**Instructions:**
1. Create `frontend/components/account/my-account-modal.tsx` as `'use client'` component
2. Export `MyAccountModal` with props `{ open: boolean; onClose: () => void }`
3. Use `useAuth()` to read `user` and `isLoading`
4. On open, if `user` exists, load profile via `fetchProfileByUserId(user.id)`
5. Initialize name input using priority: `profile.full_name` → `user.user_metadata.full_name` → empty string
6. Render dialog titled "My account" with:
   - Editable "Full name" input
   - Read-only email line
   - Plan section with "Free plan" indicator (note: cloud sync is in Pro)
   - "Join Pro waitlist" button/link using `getProWaitlistUrl()` (opens in new tab when URL exists; disabled when missing)
7. Add "Save" and "Close" actions
8. "Save" calls `saveProfileName` with loading/error/success feedback inline

**Verification:**
```bash
cd frontend && npx tsc --noEmit && npm run lint && rg -n 'My account|Full name|Free plan|Join Pro waitlist|saveProfileName' components/account/my-account-modal.tsx
```

---

### Step 3: Add Account Icon and Modal Wiring in App Header

**Goal:** Add a second header icon button to the right of the existing settings cog and wire it to open/close the My Account modal.

**Context:**
- `frontend/app/app/page.tsx` is the dashboard shell
- Currently renders header logo and settings cog button that toggles `isSettingsOpen`
- Mounts `<SettingsModal open={isSettingsOpen} ... />`
- **Requirement:** Account icon must be to the right of the existing cog icon

**Instructions:**
1. Modify only `frontend/app/app/page.tsx`
2. Keep existing search/folder/document behavior untouched
3. Add local state `isAccountOpen`
4. Import `MyAccountModal`
5. Render right-side icon button group where:
   - Settings cog remains first
   - New account icon button is second in DOM order (appears on right)
6. Match current button sizing/touch target (`h-11 w-11`)
7. Add accessibility: `aria-label='Open my account'`
8. Mount `<MyAccountModal open={isAccountOpen} onClose={() => setIsAccountOpen(false)} />` near existing `<SettingsModal />`

**Verification:**
```bash
cd frontend && npx tsc --noEmit && npm run lint && rg -n 'isAccountOpen|Open my account|MyAccountModal|Open settings' app/app/page.tsx
```

---

### Step 4: Redirect Authenticated Users from Landing Page

**Goal:** Ensure authenticated users who visit `/` are automatically redirected to `/app` instead of seeing the marketing landing CTAs.

**Context:**
- Current landing page is `frontend/app/page.tsx` (static UI with logo and links)
- Auth status only available in client components via `useAuth()`
- Reference async auth-loading pattern in `frontend/components/providers/app-notifications-provider.tsx`

**Instructions:**
1. Modify only `frontend/app/page.tsx`
2. Convert to client component (`'use client'`)
3. Use `useAuth()`, `useRouter()`, and `useEffect()`
4. When `isLoading` is false and `user` is present, call `router.replace('/app')`
5. Preserve current landing layout and CTA links for logged-out users
6. While auth state is loading (or after redirect), render minimal placeholder shell (avoid flash of incorrect content)

**Verification:**
```bash
cd frontend && npx tsc --noEmit && npm run lint && rg -n 'useAuth|router\.replace|isLoading' app/page.tsx
```

---

### Step 5: Run End-to-End Validation

**Goal:** Confirm code quality and validate the new user-facing behaviors for account editing, plan/waitlist UI, and home-page auth redirect.

**Expected Changed Files:**
- `frontend/lib/account/profile.ts`
- `frontend/lib/account/pro-plan.ts`
- `frontend/components/account/my-account-modal.tsx`
- `frontend/app/app/page.tsx`
- `frontend/app/page.tsx`
- `.env.example`

**Validation Commands:**
```bash
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

**Manual Smoke Tests:**
1. Sign in, open `/`, confirm redirect lands on `/app`
2. In `/app` header, confirm account icon is immediately to the right of settings cog
3. Open "My account", change full name, save, close/reopen, verify updated name persists
4. Confirm "Free plan" indicator is visible
5. Confirm "Join Pro waitlist" control is visible and, when `NEXT_PUBLIC_PRO_WAITLIST_URL` is configured, opens that URL in a new tab

---

## Acceptance Criteria

### ✅ 1. Profile Helpers Target Supabase Profiles Table
`frontend/lib/account/profile.ts` exists, uses `createClient()`, and exports `fetchProfileByUserId` and `saveProfileName` that read/write `profiles.full_name`.

**Verify:** Code inspection + `cd frontend && npx tsc --noEmit`

### ✅ 2. Pro Waitlist URL Config is Centralized
`frontend/lib/account/pro-plan.ts` exports `getProWaitlistUrl()` and `.env.example` includes optional `NEXT_PUBLIC_PRO_WAITLIST_URL`.

**Verify:** `rg -n 'getProWaitlistUrl|NEXT_PUBLIC_PRO_WAITLIST_URL' frontend/lib/account/pro-plan.ts .env.example`

### ✅ 3. My Account Modal Exposes Required Fields and Actions
`frontend/components/account/my-account-modal.tsx` renders:
- "My account" title
- Editable "Full name" input
- Visible "Free plan" indicator
- "Join Pro waitlist" control
- Save/close actions

**Verify:** Code inspection + lint/type checks

### ✅ 4. Profile Name Save Flow is Wired from Modal
Saving from `MyAccountModal` calls `saveProfileName` and handles loading plus error/success feedback.

**Verify:** Code inspection + manual save/reopen test in running app

### ✅ 5. App Header Shows Account Icon Right of Settings
`frontend/app/app/page.tsx` renders both settings and account icon buttons, with account button after settings button in header action group.

**Verify:** `rg -n 'Open settings|Open my account' frontend/app/app/page.tsx` + visual check

### ✅ 6. Homepage Redirects Authenticated Users to App
`frontend/app/page.tsx` performs `router.replace('/app')` when auth is loaded and `user` exists, while preserving landing CTAs for logged-out users.

**Verify:** Code inspection + manual navigation test

### ✅ 7. No Auth Flow Regressions on Existing Pages
The following files remain functionally unchanged:
- `frontend/app/login/page.tsx`
- `frontend/app/signup/page.tsx`
- `frontend/lib/auth/auth-context.tsx`

**Verify:** `git diff -- frontend/app/login/page.tsx frontend/app/signup/page.tsx frontend/lib/auth/auth-context.tsx`

### ✅ 8. Frontend Quality Gates Pass
All quality checks complete without errors:

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```
