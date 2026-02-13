# Tentacle Business Plan

> **Progressive AI** — Local-first note-taking with optional cloud intelligence

**Date:** 2026-02-13
**Model:** Open Core Freemium

---

## Executive Summary

Tentacle uses a **"Progressive AI"** model: free users get powerful local features (semantic search, voice capture), while paid users unlock automatic organization via cloud AI infrastructure.

**Key insight:** BYOK (Bring Your Own Key) creates natural friction that converts users to paid plans.

---

## Feature Tiers

### Free Tier ($0)
- ✅ Local-first note storage
- ✅ Voice capture with Whisper (local or BYOK)
- ✅ **Semantic search** (local embeddings)
- ✅ Manual tagging
- ✅ Markdown export to Obsidian
- ⚠️ Auto-tagging via BYOK OpenAI (friction: must enter key each time)
- ❌ No cloud sync
- ❌ No chat interface

**Value prop:** "Obsidian with built-in semantic search and voice capture"

### Pro Tier ($10/month)
- ✅ Everything in Free
- ✅ **Auto-tagging** (our infrastructure, no API key needed)
- ✅ **Chat with knowledge base** (RAG)
- ✅ Cloud sync across devices
- ✅ Mobile app access
- ✅ Priority support

**Value prop:** "Your second brain that organizes itself"

---

## Economics

| Metric | Value |
|--------|-------|
| Pro subscription | $10/month |
| Est. API cost per user | $3-5/month |
| Gross margin | $5-7/month per user |
| Free user cost | $0 (100% local) |

**Cost control:** Only paying users generate API costs. Free users never hit our servers.

---

## Privacy Promise

| Tier | Data Location | Encryption | Training Use |
|------|--------------|------------|--------------|
| Free | Your machine only | N/A (local) | Impossible |
| Pro | Encrypted cloud + local | AES-256 at rest | Explicitly prohibited |

**Messaging:** "Free = never leaves your device. Pro = encrypted, never sold."

---

## Technical Architecture

### Free User Flow
```
[Tauri App] ←→ [Local SQLite + Embeddings]
                ↓ (optional BYOK)
              [OpenAI API] ← user pays
```

### Pro User Flow
```
[Tauri App] ←→ [Local SQLite + Embeddings]
                ↓ (auto-tagging)
              [Vercel API] ←→ [OpenAI API] ← we pay
                ↓ (sync)
              [Supabase]
```

---

## Implementation Priorities

### Phase 1: Free Launch
- [ ] Local embeddings (all-MiniLM-L6-v2, 80MB)
- [ ] SQLite vector search
- [ ] Voice capture (local Whisper)
- [ ] BYOK auto-tagging (friction intentional)
- [ ] Obsidian export

### Phase 2: Pro Features
- [ ] Vercel API for auto-tagging
- [ ] Rate limiting (100 requests/day)
- [ ] Supabase sync
- [ ] RAG chat interface
- [ ] Stripe billing

### Phase 3: Scale
- [ ] Team tier ($20-30/mo)
- [ ] Client-side encryption option
- [ ] Custom embedding models

---

## Competitive Positioning

| Feature | Apple Notes | Obsidian | Notion | Mem.ai | **Tentacle** |
|---------|-------------|----------|--------|--------|--------------|
| Local-first | ⚠️ | ✅ | ❌ | ❌ | ✅ **Free** |
| Semantic search | ❌ | ⚠️ | ❌ | ✅ | ✅ **Free** |
| Voice capture | ⚠️ | ❌ | ❌ | ❌ | ✅ **Free** |
| Auto-tagging | ❌ | ❌ | ⚠️ | ⚠️ | ✅ **Pro** |
| Chat with notes | ❌ | ❌ | ❌ | ⚠️ | ✅ **Pro** |
| Privacy-first | ❌ | ✅ | ❌ | ❌ | ✅ **Core** |

---

## Go-to-Market

1. **Launch Free** on Hacker News / r/ObsidianMD
   - "Show HN: Voice-to-Obsidian with semantic search, 100% local"
   - Build GitHub stars and community

2. **Beta Pro** with power users
   - "Free Pro for feedback" program
   - Iterate on chat quality

3. **Product Hunt Launch**
   - Position: "The AI note app that respects privacy"
   - Target: Obsidian users frustrated with mobile capture

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| OpenAI costs spike | Rate limits, usage caps per user |
| Users stay on free | BYOK friction (no key storage) |
| Chat quality poor | Start simple, iterate with user feedback |
| Competitor copies | Open source core = community defense |

---

## Key Metrics

- **Activation:** Voice note captured
- **Retention:** 3+ notes with auto-tags
- **Conversion:** Free → Pro upgrade rate (target: 5-10%)
- **Revenue:** MRR, API cost per user

---

## Notes

- **Why "Progressive AI":** Users start with local-only, progressively unlock cloud intelligence as they see value
- **Killer feature:** "Chat with your knowledge base" — Mem.ai promised this, failed to deliver
- **Unfair advantage:** Local-first + AI = rare combination, privacy-conscious users will advocate