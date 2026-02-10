# Authentication Feature Discovery Research

**Date**: 2026-02-10  
**Feature**: Supabase Auth Integration (TEN-5)  
**Researcher**: Product Owner

---

## Problem Statement

### Current State
Tentacle currently has no authentication system. The Next.js frontend exists but has no user management, session handling, or protected routes. Users cannot:
- Create persistent accounts
- Access their notes across devices
- Secure their voice-to-text data

### User Impact
Without authentication:
- Voice notes are device-local and at risk of loss
- Cross-platform sync is impossible
- Personalization features cannot be built
- User cannot access their "second brain" from multiple devices

### Why Now (Day 1-3 of MVP)
Authentication is a foundational dependency for all subsequent features:
- Note storage requires user association
- Semantic linking requires persistent user context
- Cross-device sync requires identity
- Data privacy compliance requires user ownership

---

## User Personas and Context

### Primary: The Mobile Researcher (Consultant/Founder)
**Context**: On-the-go between meetings, needs to capture thoughts instantly
**Pain Points**:
- Current note apps require too many taps to start recording
- Auth friction prevents "voice-to-note in <10s" goal
- Fear of losing context switching between apps

**Needs from Auth**:
- One-tap access to capture after login
- Persistent session (don't ask again today)
- Works seamlessly on mobile Safari/Chrome

### Secondary: The Knowledge Worker (ADHD Community)
**Context**: Needs low-friction capture before ideas evaporate
**Pain Points**:
- Complex auth flows break creative flow
- Password anxiety ("will I remember this?")
- Decision paralysis at signup

**Needs from Auth**:
- Minimal fields (email + password only)
- Clear password requirements upfront
- Easy password reset (inevitable need)

### Tertiary: The Markdown Power User (Obsidian User)
**Context**: Privacy-conscious, wants local-first but with cloud backup
**Pain Points**:
- Concerns about where data lives
- Wants to see and understand auth implementation
- Needs export/delete capabilities (future)

**Needs from Auth**:
- Transparency about Supabase handling
- Secure session management
- Path to data ownership (export)

---

## Jobs-to-be-Done (JTBD)

### Job 1: Securely Access My Notes
**When** I open Tentacle on my phone or laptop,  
**I want** to quickly authenticate,  
**So that** I can access my voice notes and capture new ones without friction.

### Job 2: Protect My Voice Data
**When** I record sensitive voice notes,  
**I want** to know they're tied to my account and secure,  
**So that** I feel confident capturing private thoughts.

### Job 3: Maintain Continuous Access
**When** I use Tentacle daily,  
**I want** to stay logged in for extended periods,  
**So that** auth never interrupts my capture flow.

### Job 4: Recover Access Independently
**When** I forget my password,  
**I want** to reset it via email without contacting support,  
**So that** I can regain access immediately.

---

## Competitive Analysis

### Obsidian
- **Auth**: No cloud auth required (local-first by default)
- **Pros**: Zero friction, complete privacy
- **Cons**: No cross-device sync without third-party
- **Lesson**: Offer value before requiring auth; auth should enable features

### Notion
- **Auth**: Email + Google integration
- **Pros**: Quick signup, persistent sessions
- **Cons**: Heavy onboarding before first use
- **Lesson**: Don't block core value with auth walls

### Otter.ai (Voice-first)
- **Auth**: Email required, Google/Apple OAuth
- **Pros**: Seamless mobile auth with biometrics
- **Cons**: Aggressive paywall after trial
- **Lesson**: Consider biometric auth for mobile; keep auth minimal

### Whisper Memos
- **Auth**: Phone number OTP (no password)
- **Pros**: Ultra-low friction on mobile
- **Cons**: Less secure, no traditional email login
- **Lesson**: OTP could be post-MVP enhancement

---

## Technical Constraints

### Supabase Auth Capabilities
- **Email/Password**: ✅ Fully supported
- **Magic Links**: ✅ Available (out of scope for MVP)
- **Social OAuth**: ✅ Google, Apple, etc. (out of scope)
- **Session Management**: ✅ Automatic refresh, configurable duration
- **Password Reset**: ✅ Built-in email templates
- **Rate Limiting**: ✅ Configurable per endpoint

### Next.js App Router Constraints
- **Middleware**: Runs at edge, limited runtime (no Node.js APIs)
- **Server Components**: Can check auth via cookies
- **Client Components**: Use Supabase client for real-time auth state
- **Static Generation**: Protected routes must be dynamic

### Mobile/PWA Constraints
- **LocalStorage**: Available but cleared on app deletion
- **IndexedDB**: Better for session persistence
- **Service Worker**: Can cache auth state for offline access
- **iOS Safari**: 7-day cookie limitation for third-party contexts

---

## Assumptions Validation

| Assumption | Validation | Confidence | Mitigation if Wrong |
|------------|------------|------------|---------------------|
| Users prefer email/password over social auth | Obsidian/Notion data suggests yes | High | Add social auth in week 2 |
| 7-day session is acceptable default | Industry standard (Notion, Slack) | High | Make configurable in settings |
| Mobile browsers support Supabase client | Supabase supports all modern browsers | Very High | Fallback to server-side auth |
| Users can access email for reset | Assumption for MVP | Medium | Add phone number option post-MVP |
| Dark mode is preferred default | Target audience (ADHD, developers) | High | Add toggle in settings |

---

## Risk Assessment

### High Priority Risks

**Risk 1: Session Persistence Issues on iOS**
- **Impact**: Users constantly re-authenticated, breaking "frictionless" promise
- **Likelihood**: Medium (iOS Safari has strict cookie policies)
- **Mitigation**: Implement localStorage fallback, test extensively on iOS

**Risk 2: Email Deliverability for Reset**
- **Impact**: Users locked out, support burden
- **Likelihood**: Low (Supabase uses reliable providers)
- **Mitigation**: Monitor bounce rates, configure custom domain if needed

**Risk 3: Password Fatigue**
- **Impact**: Drop-off at signup, abandoned accounts
- **Likelihood**: Medium (power users have password fatigue)
- **Mitigation**: Consider magic links as fast-follow feature

### Medium Priority Risks

**Risk 4: Cross-Device Session Sync**
- **Impact**: Users confused why logged out on one device but not another
- **Likelihood**: Low
- **Mitigation**: Clear UX messaging about device-specific sessions

**Risk 5: Supabase Auth Pricing**
- **Impact**: Unexpected costs at scale
- **Likelihood**: Low (generous free tier: 50k MAU)
- **Mitigation**: Monitor auth events, plan migration path if needed

---

## Decisions Made

### Decision 1: Email/Password Only for MVP
**Rationale**: Fastest path to working auth, no external OAuth dependencies
**Trade-off**: Slightly higher friction than magic links
**Revisit**: Week 2 if signup completion rate <80%

### Decision 2: 7-Day Session Default
**Rationale**: Balance between convenience and security
**Trade-off**: Users re-authenticate weekly vs. always-logged-in security risk
**Revisit**: Based on usage analytics

### Decision 3: No Email Verification Required
**Rationale**: Speed to first capture is critical; typo'd emails can fix via reset
**Trade-off**: Some accounts created with invalid emails
**Revisit**: Add verification if abuse detected

### Decision 4: Dark Mode Default
**Rationale**: Brand identity, target audience preference, battery savings on OLED
**Trade-off**: Some users may prefer light mode initially
**Revisit**: Add light mode toggle in settings

### Decision 5: Supabase Over Auth0/Firebase
**Rationale**: Unified with existing database, open source, generous free tier
**Trade-off**: Less feature-rich than Auth0
**Revisit**: If enterprise SSO needed later

---

## Open Questions

| Question | Priority | Owner | Next Step |
|----------|----------|-------|-----------|
| Do we need account deletion for GDPR? | High | Legal/Product | Check GDPR requirements for beta |
| Should we collect any profile data at signup? | Medium | Product | Default to no; add optional onboarding flow |
| What happens to local notes if user logs out? | Medium | Tech Lead | Design local storage cleanup strategy |
| Do we need rate limiting UI (captcha)? | Low | Security | Monitor for abuse before implementing |
| Should we support "Sign in with Apple" for App Store? | Low | Product | Required if native iOS app planned |

---

## Success Metrics Baseline

### Current State (Pre-Auth)
- User accounts: 0
- Session persistence: N/A
- Auth-related drop-off: N/A

### Target State (Post-MVP)
- Signup completion rate: ≥85%
- Login success rate: ≥95%
- Session restored from persistence: ≥90% (7-day)
- Password reset success: ≥80%
- Time to first capture post-signup: <10s
- Bounce rate on auth pages: <20%

---

## Research Sources

1. **Tentacle BRAND.md** - Brand voice, design principles
2. **Tentacle AGENTS.md** - Technical architecture context
3. **Linear Issue TEN-5** - Initial requirements
4. **Supabase Auth Documentation** - Technical capabilities
5. **Next.js App Router Auth Patterns** - Implementation approach
6. **Competitive Analysis** - Obsidian, Notion, Otter.ai, Whisper Memos

---

**Research Status**: Complete  
**Next Step**: Handoff to System Architect for technical design  
**Review Date**: Post-MVP (2026-02-24)
