# Landing Page Style Suggestions for Tentacle

> A senior brand strategist's take on making a note-taking app landing page that people actually remember.

---

## The Problem with the Current Page

The current page is well-executed but follows the SaaS template playbook exactly:
gradient orb → animated badge → cycling headline → 3-column feature grid → pricing cards → CTA block.

This design language belongs to 2022 Vercel clones. It signals "AI startup" before the user reads a single word — which is fine if your goal is to look credible to investors, but bad if your goal is to stand out to the **power users, writers, and PKM nerds** who are Tentacle's actual audience.

These people hate generic. They use Obsidian and have a neovim config. They care that their tools have a soul.

The question isn't "how do we look more polished?" — it's "how do we feel like *us*?"

---

## Who Tentacle Actually Is

Before picking a style, you need to understand the brand's DNA:

- **Local-first, privacy-respecting** — a philosophical stance, not just a feature
- **Built for thinkers** — writers, devs, researchers, PKM enthusiasts
- **Honest** — no dark patterns, no "free trial → surprise credit card"
- **Technical but humane** — Rust under the hood, markdown as the format, but for humans not engineers
- **Small and indie** — not VC-backed, not Notion

This points toward authenticity-first design. Not flashy. Not corporate. Something that feels like it was made by someone who *uses the product*.

---

## Style Directions

---

### 1. ASCII / Typewriter Terminal (Your Idea, Expanded)

**The concept:** The page itself feels like a living document being typed in real-time. ASCII art, monospace fonts, cursor blinking, characters being written as you scroll.

**Why it works for Tentacle:**
Note-taking is fundamentally about text. The entire product is text. Leaning into that — making the *interface itself* made of text — is conceptually honest in a way that gradient orbs are not. It also signals to the right audience (technical people who appreciate craft).

**Specific executions:**

```
╔══════════════════════════════════════════════╗
║  TENTACLE v1.0.0  ░░░ your second brain      ║
║  ░░░░░░░░░░░░░░░  ░░░ local-first, private   ║
╚══════════════════════════════════════════════╝
```

- **Hero:** A terminal window `div` where the tagline is *typed out* character by character, cursor blinking between phrases. Like watching someone write the headline live.
- **Feature blocks:** Replace icon cards with ASCII box-drawings. Each feature is a little terminal panel.
- **Animations:** Characters "glitch" or shuffle before resolving into readable text (like a cipher decoding). Subtle and not overdone.
- **Color scheme:** Near-black background (`#0d0d0d`), warm off-white text (`#f0ede8`), a single accent color — amber (`#f59e0b`) for the cursor and highlights. Or go green-on-black for maximum terminal vibes.
- **The "demo":** Instead of a screenshot, show a fake terminal session where someone types a note, runs a search, and gets results. All text, animated.

**Reference energy:** [Charm.sh](https://charm.sh), early linear.app, [CROC](https://github.com/schollz/croc), warp.dev's old landing.

**Risk level:** Medium. Could feel gimmicky if overdone. The key is restraint — use ASCII as *punctuation*, not the whole story.

---

### 2. Brutalist Typography-First

**The concept:** No gradients. No cards with border-radius. No icons. Just type, set extremely large, with aggressive weight contrast and tight grids. Black, white, maybe one color.

**Why it works for Tentacle:**
Brutalism signals honesty. "We're not here to charm you with rounded corners — we're here to be useful." It's anti-corporate in a way that resonates with people who distrust Notion's growth-hacking.

**Specific executions:**

- **Hero:** Massive serif or grotesque headline, 100vw wide. The kind of type that makes you physically back away from your screen.
  ```
  EVERY THOUGHT
  DESERVES A
  HOME.
  ```
- **Layout:** Stark grid, hard borders, deliberate misalignment (one element breaking the grid as a feature, not a bug).
- **Color:** Black + white + one ink-stamp red, or black + white + indigo. No gradients. No blur.
- **Features:** Listed like a product spec sheet. A table. Not cards with icons.
- **CTA:** Big. Just a black button that says "DOWNLOAD." No marketing speak.

**Reference energy:** [are.na](https://are.na), Stripe Press, [iA Writer](https://ia.net/writer), Swiss International Typographic Style

**Risk level:** Low-medium. This is proven and respected. The danger is being too cold — you need a warmth injection somewhere (a personal note from the founder, a small humanizing detail).

---

### 3. Handwritten / Paper-and-Ink Notebook

**The concept:** The landing page looks like a physical notebook — graph paper or ruled lines as the background, a handwritten or hand-drawn typeface for headlines, ink-blot decorations, margin notes, cross-outs.

**Why it works for Tentacle:**
Tentacle is a *note-taking* app. What if the website *is* a note? The medium becomes the message. It communicates "this is what your notes could look like" while being immediately distinctive.

**Specific executions:**

- **Background:** Subtle graph paper or ruled lines texture (CSS or SVG). Not literal notebook paper — more like a ghost of it.
- **Typography:** One handwritten/sketchy font for big headlines (Caveat, Reenie Beanie, or something custom). Clean body text for readability.
- **Decorations:** SVG scribbles, underlines, arrows, margin annotations. Like someone annotated their own website.
- **Features:** Written as actual notes with margin headers. "Search →", "Voice ✓", "Tags ⬛"
- **The "Private" section:** Show a note with `[REDACTED]` blocks in ink, then reveal the privacy pitch.
- **Micro-interactions:** Hovering a feature "underlines" it in wobbly ink.

**Reference energy:** Notion's early days, Bear app's marketing, Field Notes brand, Moleskine.

**Risk level:** Medium-high. Can easily become cute instead of credible. Needs strong typographic discipline to avoid looking like a student project.

---

### 4. Living Document / Scroll-Driven Narrative

**The concept:** The page *is* a document. As you scroll, you're reading Tentacle's founding doc, a manifesto, a README. Prose, not bullet points. Sections feel like headers in a markdown file.

**Why it works for Tentacle:**
It's honest about what the product is — a markdown-based note tool. And it lets you tell a story instead of rattling off features. It also patterns against every SaaS page in existence.

**Specific executions:**

- **Structure:**
  ```
  # Tentacle

  *A note-taking tool for people who think too much.*

  ---

  ## Why we built this

  [2 paragraph story about losing a great idea]

  ## What it does

  [Feature descriptions as prose, not cards]

  ## Why local-first matters

  [The privacy manifesto]

  ## Get it

  [Single clean CTA]
  ```
- **Typography:** Beautiful mono or humanist sans. Generous line-height. Left-aligned, not centered. Feels like reading.
- **Decorations:** Markdown syntax leaks through — `**bold**` renders as bold but also shows the asterisks. `#` symbols appear in the margins. Code fences for technical details.
- **Animations:** As you scroll, sections "appear" like they're being typed. The cursor moves down the document.
- **Aside/footnotes:** Footnotes [1] in the text that expand on hover — like reading a real document with annotations.

**Reference energy:** [Gwern.net](https://gwern.net), [Linus's essays](https://thesephist.com), [iA Writer site](https://ia.net), Paul Graham's essays

**Risk level:** Low. This is literary and distinctive. Risk is that it feels too long or too niche — you need strong editorial judgment in the copy.

---

### 5. Map / Knowledge Graph Visual

**The concept:** The hero features a live, interactive graph of connected notes — nodes and edges, slowly animating — as the primary visual. The page grows outward from a central idea like a mind map.

**Why it works for Tentacle:**
The product is about connecting ideas. Show that, don't just describe it. Obsidian's graph view is one of the most shared screenshots in the PKM world — people love this visual because it represents "thinking."

**Specific executions:**

- **Hero:** Animated SVG/Canvas graph. Nodes are note titles (real-seeming, not "Document 1"). Edges appear as connections form. It rotates slowly.
- **Interaction:** Hover a node to see the note preview. Click to "zoom in" on that feature's explanation.
- **Color:** Dark background, glowing nodes in indigo/teal. Feels like a galaxy of thought.
- **Scrolling:** As you scroll, the graph morphs — more nodes appear, connections strengthen. Each section of the page *adds* to the graph.

**Reference energy:** Roam Research, Obsidian, [Universe app](https://universe.app), [Kumu](https://kumu.io)

**Risk level:** High technical effort. Also risks feeling like an Obsidian ripoff since graph views are associated with that brand. Best as a *component* within another direction, not the whole visual language.

---

### 6. Zine / Indie Magazine

**The concept:** Eclectic, collage-style layout. Mixed type sizes, rotated elements, torn-paper texture, editorial photography or illustration. Feels like a self-published magazine.

**Why it works for Tentacle:**
Zine culture is having a massive design renaissance. It signals counter-culture, craft, and authenticity — exactly right for an indie app that stands against Big Note (Notion, Evernote, etc.). This is what a PKM tool would look like if The Intercept or Pitchfork made one.

**Specific executions:**

- **Layout:** Nothing on a grid. Features cards rotated 2-3 degrees. A headline that runs vertically on the left column. A pull-quote in massive type breaking the flow.
- **Typography:** Mixed typefaces — a slab serif headline font, a grotesque body, maybe a script accent. Deliberate clash.
- **Color:** Risograph-style limited palette. Warm red + black + cream, or cobalt + yellow + white.
- **Imagery:** Hand-drawn illustrations or raw photography of notebooks, hands writing, desks. No stock photos of laptops.
- **Copy voice:** Opinionated, slightly irreverent. "Your notes are a mess. So is your brain. That's fine."

**Reference energy:** [Stripe's annual report](https://stripe.com/annual-reports), [99U Magazine](https://99u.adobe.com), [Inventory Magazine](https://www.inventorymagazine.com)

**Risk level:** High. Difficult to execute without it looking like chaos. Needs a designer with strong typographic instincts.

---

## The Direction I'd Recommend

**Option 1 + 4 hybrid: ASCII/Terminal anchoring a Living Document narrative.**

Here's why:
1. It's immediately distinctive in the PKM/productivity space (Notion is soft, Obsidian is graphical, Bear is minimal-pretty — nobody is terminal)
2. It's conceptually honest — text-first tool, text-first website
3. It speaks directly to the power-user audience who actually evangelizes apps like this
4. It scales: you can dial up or down the "terminal-ness" based on taste
5. It doesn't require illustration or custom photography to pull off

**What this looks like in practice:**

- Dark background, monospace body font (or mono for accents, humanist sans for body)
- Hero: A fake terminal window that types out the core pitch
- A `---` separator into a prose manifesto section about local-first privacy
- Feature "cards" replaced by a rendered markdown-style list
- ASCII decorations as section separators (not the whole page)
- One big moment: a "demo terminal" where sample queries animate in and results appear

---

## Copy Direction to Go With Whichever Style

The current copy is safe. These alternatives are more opinionated:

| Current | Better |
|---|---|
| "The note-taking app that becomes your second brain" | "Notes that stay yours." |
| "Powerful features that work locally" | "Nothing leaves your machine. Not your notes. Not your embeddings. Not your search." |
| "Simple, transparent pricing" | "Free forever. $10/mo if you want the AI to do the organizing." |
| "Join thousands of users..." | (Delete this. You don't know if it's true and nobody believes it.) |
| "No credit card required. Free forever." | "Download it. Use it. No account required." |

The best PKM tools have a **manifesto**, not a tagline. Write yours.

---

## What Not to Do

- ❌ More gradient orbs
- ❌ "Join 10,000+ users" social proof banners (if it's true, it's fine, but it reads as fake)
- ❌ Screenshot carousels that don't actually show the UI
- ❌ Animated counters (notes saved, searches made)
- ❌ Purple-to-indigo gradients (every AI app uses these right now)
- ❌ The "Build your second brain" phrasing — it's Tiago Forte's trademark concept and overused

---

## Quick Wins You Can Do Now (Without Redesigning)

1. **Add a real `<pre>` block** somewhere on the page — a snippet of what a Tentacle note actually looks like in markdown. Grounding.
2. **Replace the privacy "card"** with something raw — literally show a SQLite schema snippet or a file path. `~/.tentacle/notes/my-idea.md`. Real feels real.
3. **Write a founder's note** — a short, honest 2-3 sentence paragraph about why you built this. Put it in the hero or footer. No marketing speak.
4. **Add a keyboard shortcut callout** — power users love this. "Press `⌘K` to search anything." It signals that the app was built by someone who uses keyboards.
5. **Ditch "Download for Free" → "Download"** — "for Free" reads as marketing. "Download" reads as product.

---

## Sources & Inspiration

- [Brutalist web design & ASCII aesthetic (Codrops)](https://tympanus.net/codrops/2025/10/15/from-blank-canvas-to-mayhem-eloy-benoffis-brutalist-glitchy-portfolio-built-with-webflow-and-gsap/)
- [Design trends for the AI era 2026](https://medium.com/design-bootcamp/aesthetics-in-the-ai-era-visual-web-design-trends-for-2026-5a0f75a10e98)
- [Landing pages as performance art (Readymag)](https://blog.readymag.com/landing-pages-as-performance-art/)
- [25 Brutalist Landing Pages for Inspiration (OnePageLove)](https://onepagelove.com/brutalist-landing-pages)
- [SaaS Landing Page Trends 2026 (SaaSFrame)](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples)
- [ASCII Gen - Animations for the Web](https://asciigen.art)
