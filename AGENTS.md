# Agent Instructions - Tentacle App

## Project Overview

Tentacle is a **mobile-first**, voice-driven note-taking app with automatic semantic organization.

**Deadline**: 2-week MVP launch

## Core Principles

### 1. Mobile-First Design
- Design for phones first, desktop second
- Touch-friendly, thumb-reachable UI
- Fast load times (< 2s on 3G)
- Offline-first where possible

### 2. Simplicity Above All
- One primary action: **Capture**
- Minimal UI chrome
- No feature bloat
- Progressive disclosure (hide advanced features)

### 3. Speed is Everything
- Voice capture → Searchable note in < 10 seconds
- Instant feedback on all actions
- Optimistic UI updates
- Never block the user

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 + TypeScript |
| Styling | Tailwind CSS |
| Auth | Supabase Auth |
| Database | Supabase (PostgreSQL) |
| Vector Search | pgvector |
| Voice API | Whisper API |
| Backend | Next.js API Routes |

## Project Structure

```
tentacle-app/
├── frontend/           # Next.js application (this is everything)
│   ├── app/           # App router
│   │   ├── api/      # API routes (backend)
│   │   ├── (auth)/   # Auth pages
│   │   ├── capture/  # Main capture interface
│   │   ├── notes/    # Notes list/detail
│   │   └── search/   # Search interface
│   ├── components/   # React components
│   ├── lib/         # Utilities, hooks
│   ├── types/       # TypeScript types
│   └── hooks/       # Custom hooks
├── AGENTS.md        # This file
└── README.md        # Project overview
```

## Key Design Patterns

### Components
- Use shadcn/ui components as base
- Mobile-first responsive design
- Touch targets minimum 44x44px
- Bottom-sheet pattern for mobile modals

### State Management
- React hooks for local state
- Supabase real-time subscriptions for sync
- Minimal global state (avoid Redux if possible)

### API Routes
- Co-locate with features: `app/api/notes/route.ts`
- Use Zod for validation
- Return consistent error formats
- Implement proper auth middleware

### Database (Supabase)
- Use Row Level Security (RLS) policies
- Indexes on search fields
- Vector embeddings in `pgvector` extension
- Soft deletes, never hard delete

## Mobile UI Guidelines

### Layout
- Single-column layout
- Bottom navigation bar (3-5 items max)
- Floating action button (FAB) for primary capture
- Safe area insets for notched phones

### Interactions
- Swipe gestures for common actions
- Pull-to-refresh
- Infinite scroll (not pagination)
- Haptic feedback on capture

### Visual
- Large touch targets
- High contrast for accessibility
- Dark mode support
- System font stack (performance)

## Do's and Don'ts

### ✅ DO
- Build mobile-first, test on actual devices
- Use TypeScript strictly
- Implement loading skeletons
- Add proper error boundaries
- Write meaningful component names
- Keep components small (< 200 lines)
- Use React Server Components where possible

### ❌ DON'T
- Build desktop-first then adapt down
- Add complex state management unnecessarily
- Over-engineer features
- Ignore loading/error states
- Mix business logic with UI
- Create deep component hierarchies
- Block the main thread

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI (Whisper)
OPENAI_API_KEY=

# Optional: PostHog analytics
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

Test on mobile:
```bash
# Get local IP
ipconfig getifaddr en0  # macOS
hostname -I            # Linux

# Then access on phone via:
# http://YOUR_IP:3000
```

## Feature Checklist (MVP)

- [ ] Voice capture component
- [ ] Real-time transcription display
- [ ] Note editor (markdown)
- [ ] Notes list with search
- [ ] Automatic tagging/categorization
- [ ] Bi-directional linking `[[note]]`
- [ ] Obsidian export
- [ ] User auth (Supabase)
- [ ] Mobile-responsive throughout

## Questions?

Ask the product-owner. When in doubt, choose simplicity.
