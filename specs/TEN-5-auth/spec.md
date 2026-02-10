# Authentication System (Supabase Auth Integration)

**Linear**: TEN-5  
**Priority**: Urgent  
**Timeline**: Day 1-3 of MVP Sprint  
**Status**: Spec Complete → Ready for System Architect

---

## Overview

Tentacle's authentication system provides secure, frictionless access to voice-to-intelligence workflows. Built on Supabase Auth, it enables email/password authentication with session persistence, protecting user notes and ensuring data privacy. The system is designed for mobile-first PWA deployment with dark mode support and accessibility standards.

### Why This Matters

Without authentication, Tentacle cannot guarantee data persistence across devices, enable cross-platform sync, or protect sensitive voice notes. This is a Day 1-3 MVP blocker—no subsequent features (capture, transcription, semantic linking) can be personalized without user identity.

---

## Goals and Success Metrics

### Primary Goals
1. Enable secure user account creation and access within <30 seconds
2. Maintain authentication state across PWA sessions (persistence)
3. Protect authenticated routes from unauthorized access
4. Provide password recovery without support intervention

### Success Metrics
| Metric | Target | Baseline | Measurement |
|--------|--------|----------|-------------|
| Signup completion rate | ≥85% | N/A | Funnel analytics on /signup |
| Login success rate | ≥95% | N/A | Auth event tracking |
| Session persistence (7d) | ≥90% | N/A | Session analytics |
| Time to first capture (post-auth) | <10s | N/A | Onboarding timer |
| Password reset success | ≥80% | N/A | Reset flow completion |

### Guardrails
- Zero authentication-related data breaches
- No increase in bounce rate on auth pages
- Lighthouse accessibility score ≥95 on auth flows

---

## Stakeholders and Alignment

| Role | Name | Responsibility |
|------|------|----------------|
| **Decision Owner** | Nicolas Leão | Final approval on auth UX and security scope |
| **Tech Lead** | TBD (Backend Developer) | Supabase integration and session architecture |
| **UI/UX Review** | Frontend Developer | Mobile-first implementation and accessibility |
| **Security Review** | TBD | Audit before production deployment |

### Communication Cadence
- Daily standup updates during Days 1-3
- Design review checkpoint after Day 2
- Security sign-off required before merging to main

---

## User Stories

### Story 1: First-Time User Onboarding
**As a** new Tentacle user,  
**I want** to create an account with my email and password,  
**so that** I can securely save my voice notes across devices.

**Acceptance Criteria:**
- Given I'm on the landing page, when I tap "Get Started", then I'm taken to the signup page
- Given I'm on the signup page, when I enter a valid email and 8+ character password, then my account is created and I'm redirected to the dashboard
- Given I enter an invalid email format, when I submit, then I see a clear error message without losing my password input
- Given the email is already registered, when I submit, then I see a helpful message suggesting login

### Story 2: Returning User Access
**As a** returning Tentacle user,  
**I want** to quickly log in with my credentials,  
**so that** I can access my notes within seconds.

**Acceptance Criteria:**
- Given I'm on the login page, when I enter valid credentials, then I'm authenticated and redirected to my notes
- Given I enter invalid credentials, when I submit, then I see a generic error (security through obscurity) suggesting to check credentials or reset password
- Given I was previously logged in, when I reopen the PWA within 7 days, then I'm automatically authenticated (session persistence)
- Given I close and reopen the PWA, when I wait <500ms, then auth state is restored from cache

### Story 3: Secure Session Management
**As a** privacy-conscious user,  
**I want** to log out and know my data is secure,  
**so that** I feel confident using Tentacle on shared devices.

**Acceptance Criteria:**
- Given I'm logged in, when I tap "Logout" in settings, then my session is terminated and I'm redirected to login
- Given I log out, when I try to access a protected route, then I'm redirected to login
- Given I log out, when I check local storage, then no auth tokens or sensitive data remains
- Given I'm inactive for 30 days, when I return, then I'm prompted to re-authenticate

### Story 4: Password Recovery
**As a** user who forgot my password,  
**I want** to reset it via email,  
**so that** I can regain access without creating a new account.

**Acceptance Criteria:**
- Given I'm on the login page, when I tap "Forgot Password", then I see a password reset form
- Given I enter my email, when I submit, then I receive a reset link within 2 minutes
- Given I click the reset link, when I enter a new 8+ character password, then my password is updated
- Given my reset token expires (24h), when I try to use it, then I see an error with option to request new link

### Story 5: Mobile-First Quick Capture
**As a** mobile user on-the-go,  
**I want** auth flows optimized for one-handed use,  
**so that** I can start capturing voice notes immediately.

**Acceptance Criteria:**
- Given I'm on a mobile device, when I view auth pages, then all touch targets are ≥44px
- Given I'm on iOS Safari, when I use the PWA, then the keyboard doesn't obscure input fields
- Given I'm in signup flow, when I complete registration, then I'm taken directly to capture screen (not an empty dashboard)

---

## Requirements

### Functional Requirements

#### FR-1: Signup Flow
- **FR-1.1**: Support email/password registration via Supabase Auth
- **FR-1.2**: Enforce password minimum: 8 characters, 1 uppercase, 1 lowercase, 1 number
- **FR-1.3**: Validate email format and check for existing accounts
- **FR-1.4**: Send welcome email via Supabase (configurable)
- **FR-1.5**: Auto-login after successful signup
- **FR-1.6**: Redirect to onboarding/dashboard post-signup

#### FR-2: Login Flow
- **FR-2.1**: Support email/password authentication via Supabase
- **FR-2.2**: Implement "Remember Me" option (7-day session persistence)
- **FR-2.3**: Show loading states during authentication
- **FR-2.4**: Handle network errors gracefully with retry option
- **FR-2.5**: Redirect to original requested URL post-login (if deep-linked)

#### FR-3: Logout Flow
- **FR-3.1**: Clear Supabase session and local auth state
- **FR-3.2**: Clear sensitive data from localStorage/sessionStorage
- **FR-3.3**: Redirect to login page with success message
- **FR-3.4**: Invalidate refresh tokens server-side

#### FR-4: Password Reset
- **FR-4.1**: Request reset link via email (Supabase built-in)
- **FR-4.2**: Reset token validity: 24 hours
- **FR-4.3**: New password must meet same requirements as signup
- **FR-4.4**: Invalidate all existing sessions on password change
- **FR-4.5**: Send confirmation email after password reset

#### FR-5: Session Management
- **FR-5.1**: Store auth tokens securely (httpOnly cookies preferred)
- **FR-5.2**: Implement automatic token refresh (Supabase handles this)
- **FR-5.3**: Session timeout: 7 days of inactivity
- **FR-5.4**: Handle session expiration gracefully with re-auth prompt
- **FR-5.5**: Support multiple concurrent sessions (desktop + mobile)

#### FR-6: Protected Routes
- **FR-6.1**: Middleware protection for all /app/* routes
- **FR-6.2**: Redirect unauthenticated users to /login with return URL
- **FR-6.3**: Allow public access to landing page, /login, /signup, /reset-password
- **FR-6.4**: Display loading state while auth status is being determined
- **FR-6.5**: Support server-side auth checks (Next.js middleware)

### Non-Functional Requirements

#### Performance
- **NFR-1.1**: Initial auth page load <2s on 3G connection
- **NFR-1.2**: Authentication API response <500ms (p95)
- **NFR-1.3**: Session restoration from cache <100ms
- **NFR-1.4**: Password strength validation <50ms (client-side)

#### Security
- **NFR-2.1**: All auth communications over HTTPS only
- **NFR-2.2**: Rate limiting: 5 failed attempts → 15min lockout per IP
- **NFR-2.3**: Password hashing: bcrypt (handled by Supabase)
- **NFR-2.4**: No sensitive data in URL params (use POST body)
- **NFR-2.5**: CSRF protection on all state-changing requests
- **NFR-2.6**: Secure session cookies (HttpOnly, Secure, SameSite=Strict)

#### Accessibility
- **NFR-3.1**: WCAG 2.1 AA compliance on all auth pages
- **NFR-3.2**: Keyboard navigation support (Tab order logical)
- **NFR-3.3**: Screen reader labels on all form elements
- **NFR-3.4**: Error messages linked to form fields via aria-describedby
- **NFR-3.5**: Focus management on error/success states
- **NFR-3.6**: Color contrast ≥4.5:1 for all text

#### Mobile/PWA
- **NFR-4.1**: Touch targets minimum 44×44px
- **NFR-4.2**: Support iOS Safari safe areas (env(safe-area-inset-*))
- **NFR-4.3**: Keyboard-aware layout (no obscured inputs)
- **NFR-4.4**: Offline detection and graceful degradation
- **NFR-4.5**: Viewport meta tag: width=device-width, initial-scale=1.0

#### Browser Support
- **NFR-5.1**: Chrome/Edge 90+, Firefox 88+, Safari 14+, iOS Safari 14+
- **NFR-5.2**: Graceful degradation for older browsers (functional if not pixel-perfect)

---

## UI/UX Requirements

### Design Principles (Tentacle Brand)
- **Minimalist**: One primary action per screen
- **Fast**: Voice-to-note in <10s applies to auth too
- **Dark-first**: Default dark mode, light mode optional
- **Human**: Friendly microcopy, no jargon

### Page Specifications

#### Login Page (/login)
- **Layout**: Centered card, max-width 400px on mobile
- **Elements**:
  - Email input (auto-focus, type=email)
  - Password input (toggle visibility)
  - "Remember Me" checkbox (checked by default)
  - "Log In" primary button (full width)
  - "Forgot Password?" link
  - "Don't have an account? Sign up" link
- **States**: Loading (spinner), Error (inline message), Success (redirect)

#### Signup Page (/signup)
- **Layout**: Same as login, progressive disclosure
- **Elements**:
  - Email input
  - Password input with strength indicator
  - Confirm password input
  - Terms acceptance checkbox
  - "Create Account" primary button
  - "Already have an account? Log in" link
- **Validation**: Real-time password requirements checklist

#### Password Reset (/reset-password)
- **Layout**: Simple centered form
- **Elements**:
  - Email input
  - "Send Reset Link" button
  - Success message with email confirmation

#### Reset Confirmation (/reset-password/confirm)
- **Layout**: New password form
- **Elements**:
  - New password input
  - Confirm password input
  - "Update Password" button

### Visual Design
- **Colors**:
  - Background: #0A0A0B (dark) / #FFFFFF (light)
  - Primary: #7C3AED (violet-600)
  - Error: #EF4444 (red-500)
  - Success: #22C55E (green-500)
  - Text: #F3F4F6 (gray-100) / #111827 (gray-900)
- **Typography**:
  - Font: Inter (system fallback)
  - Headings: 24px/32px font-semibold
  - Body: 16px/24px font-normal
  - Small: 14px/20px font-normal
- **Spacing**:
  - Page padding: 24px (mobile), 32px (tablet+)
  - Input height: 48px (touch-friendly)
  - Button height: 48px
  - Gap between elements: 16px

### Animation/Interaction
- **Form validation**: Real-time with subtle shake on error
- **Page transitions**: Fade in 200ms
- **Button states**: Scale 0.98 on active, spinner on loading
- **Focus states**: 2px violet outline with 2px offset

---

## Acceptance Criteria

### Signup Flow
```gherkin
Given a new user visits /signup
When they enter "user@example.com" and password "SecurePass123"
And click "Create Account"
Then a Supabase user is created
And they are redirected to /app/dashboard
And a session is established

Given a user enters an existing email
When they submit the signup form
Then they see "This email is already registered. Try logging in instead."
And the password field is cleared

Given a user enters a password shorter than 8 characters
When they blur the password field
Then they see "Password must be at least 8 characters"
And the submit button is disabled
```

### Login Flow
```gherkin
Given a registered user visits /login
When they enter valid credentials
And click "Log In"
Then they are authenticated
And redirected to /app/dashboard

Given a user enters invalid credentials
When they submit
Then they see "Invalid email or password. Please try again."
And the password field is cleared

Given a user checks "Remember Me"
When they successfully log in
Then their session persists for 7 days
And they are not asked to log in again on app reopen

Given an unauthenticated user visits /app/notes
When the page loads
Then they are redirected to /login?returnUrl=/app/notes
```

### Logout Flow
```gherkin
Given an authenticated user on /app/settings
When they tap "Log Out"
Then the Supabase session is terminated
And local auth state is cleared
And they are redirected to /login with message "You've been logged out"

Given a logged-out user
When they attempt to access /app/dashboard
Then they are redirected to /login
```

### Password Reset
```gherkin
Given a user on /login
When they click "Forgot Password?"
Then they are taken to /reset-password

Given a user enters "user@example.com" on /reset-password
When they click "Send Reset Link"
Then they see "Check your email for reset instructions"
And a reset email is sent via Supabase

Given a user clicks an expired reset link
When they visit /reset-password/confirm?token=xyz
Then they see "This link has expired. Request a new one."
And a link to request a new reset

Given a user with a valid reset token
When they enter matching passwords on /reset-password/confirm
And click "Update Password"
Then their password is updated
And they are redirected to /login with success message
```

### Session Management
```gherkin
Given an authenticated user with an expired access token
When they make an API request
Then the token is automatically refreshed
And the request succeeds

Given a user with an expired refresh token (7+ days)
When they open the app
Then they are redirected to /login with message "Session expired. Please log in again."
```

### Protected Routes
```gherkin
Given an unauthenticated user
When they visit any /app/* route
Then they are redirected to /login

Given an authenticated user
When they visit /app/dashboard
Then the page loads with user data

Given an unauthenticated user with slow connection
When they visit /app/notes
Then they see a loading state briefly
Then are redirected to /login
```

### Edge Cases
```gherkin
Given a user with poor connection
When they attempt to log in
Then they see "Connection error. Please try again." after 10s timeout
And a retry button is available

Given a user rapidly clicks the login button
When the first request is in flight
Then subsequent clicks are ignored (debounced)

Given a user enters email with spaces
When they submit
Then spaces are trimmed and validation proceeds

Given a user enters password with leading/trailing spaces
When they submit
Then password is accepted as-is (spaces may be intentional)
```

---

## Scope

### In Scope (MVP - Days 1-3)
- Email/password authentication via Supabase
- Signup, login, logout flows
- Password reset via email
- Session persistence and management
- Protected routes middleware
- Mobile-first responsive UI
- Dark mode default
- Basic form validation and error handling
- Accessibility compliance (WCAG 2.1 AA)

### Out of Scope (Post-MVP)
- Social login (Google, Apple, etc.)
- Two-factor authentication (2FA)
- Magic link authentication
- Biometric authentication (Face ID, Touch ID)
- Account deletion flow
- Email verification enforcement
- Admin user management
- SSO/SAML enterprise authentication
- Session management UI (view active devices)
- Brute force protection UI (captcha)

**Rationale**: Social auth and advanced security features add complexity and external dependencies. Focus on core email/password auth for fastest MVP path. Biometric auth can be added once PWA capabilities expand.

---

## Assumptions, Risks, and Dependencies

### Assumptions
- **A1**: Supabase Auth will handle rate limiting and security best practices
- **A2**: Users have reliable email access for password reset
- **A3**: Mobile browser compatibility with Supabase JavaScript client
- **A4**: No need for email verification in MVP (can be added later)

### Risks
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Supabase Auth downtime | High | Low | Implement offline detection, graceful error states |
| Session persistence issues on iOS | Medium | Medium | Test thoroughly on iOS Safari, use localStorage fallback |
| Email deliverability issues | Medium | Low | Use Supabase's default mailer, monitor bounce rates |
| Users forgetting passwords frequently | Low | High | Prominent "Forgot Password" link, consider magic links post-MVP |

### Dependencies
- **D1**: Supabase project provisioned and configured
- **D2**: Database schema for users table (handled by Supabase Auth)
- **D3**: Environment variables for Supabase URL and anon key
- **D4**: DNS/email configuration for password reset emails

---

## Open Questions

| Question | Owner | Due Date | Status |
|----------|-------|----------|--------|
| Do we need email verification before first use? | Nicolas Leão | Day 1 | Open - default to no for MVP speed |
| Should we enforce password complexity (special chars)? | Tech Lead | Day 1 | Open - 8 chars + 1 upper + 1 lower + 1 number |
| What custom claims/metadata do we store in JWT? | Tech Lead | Day 2 | Open - start with minimal |
| Do we need separate mobile app auth vs PWA? | Product Owner | Day 2 | Open - PWA only for MVP |

---

## Definition of Done

### Technical Checklist
- [ ] All pages implemented at /login, /signup, /reset-password
- [ ] Supabase Auth integrated and tested
- [ ] Middleware protecting /app/* routes
- [ ] Session persistence working (7 days)
- [ ] Password reset flow end-to-end tested
- [ ] Dark mode and light mode both functional
- [ ] Mobile responsive on iOS and Android
- [ ] Form validation with real-time feedback
- [ ] Error handling for all edge cases

### Quality Checklist
- [ ] Lighthouse accessibility score ≥95
- [ ] No console errors or warnings
- [ ] All acceptance criteria passing in QA
- [ ] Security review completed
- [ ] Performance budget met (initial load <2s)
- [ ] Analytics instrumentation in place (signup/login events)

### Documentation
- [ ] Spec.md updated with final implementation details
- [ ] Environment variables documented in .env.example
- [ ] Auth flow diagram created (optional)
- [ ] Handoff notes for future social auth work

---

## Analytics Instrumentation

### Events to Track
```javascript
// Authentication events
auth:signup_started      // User lands on signup
auth:signup_completed    // Successful account creation
auth:signup_failed       // Validation or API error
auth:login_started       // User lands on login
auth:login_completed     // Successful login
auth:login_failed        // Invalid credentials
auth:logout              // User logs out
auth:password_reset_requested
auth:password_reset_completed
auth:session_restored    // Auto-login from persistence

// Properties to include
- device_type (mobile/desktop)
- auth_method (email/password)
- time_to_complete (ms)
- error_type (if failed)
```

---

## Links and References

- **Linear Issue**: [TEN-5](https://linear.app/tentacle-app/issue/TEN-5/add-signuplogin-pages-and-integrate-with-supabase-auth)
- **Git Branch**: nicolasnleao/ten-5-add-signuplogin-pages-and-integrate-with-supabase-auth
- **Supabase Auth Docs**: https://supabase.com/docs/guides/auth
- **Next.js Middleware**: https://nextjs.org/docs/app/building-your-application/routing/middleware
- **Tentacle Brand Guidelines**: /a0/usr/projects/agency/BRAND.md
- **Tentacle Architecture**: AGENTS.md (Tentacle App section)

---

**Spec Version**: 1.0  
**Last Updated**: 2026-02-10  
**Author**: Product Owner (Tentacle Team)  
**Reviewers**: System Architect, Backend Developer, Frontend Developer
