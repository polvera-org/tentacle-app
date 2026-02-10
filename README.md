# Tentacle

Voice-first note-taking with automatic semantic organization.

## What is Tentacle?

Tentacle captures your thoughts via voice, transcribes them instantly, and automatically organizes them using AI-powered semantic analysis. Built for consultants, researchers, founders, and anyone who needs frictionless knowledge capture.

## Core Philosophy

**Capture → Transcribe → Organize**

- **Frictionless voice capture** - Zero friction recording
- **Automatic organization** - AI categorizes and links notes
- **Mobile-first** - Designed for on-the-go capture
- **Privacy-first** - Local-first architecture, you own your data
- **PKM integration** - Native Obsidian/Markdown export

## Tech Stack

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL + pgvector)
- **Auth**: Supabase Auth
- **Voice**: Whisper API
- **Vector Search**: pgvector + embeddings

## Project Structure

```
tentacle-app/
├── frontend/          # Next.js application
│   ├── app/          # App router pages
│   ├── components/   # React components
│   └── lib/          # Utilities, hooks
├── AGENTS.md         # Agent instructions
└── README.md         # This file
```

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

## Design Principles

1. **Mobile-first** - UI optimized for phone capture
2. **Speed** - Sub-second voice-to-note experience
3. **Simplicity** - One primary action: capture
4. **Interoperability** - Export anywhere
