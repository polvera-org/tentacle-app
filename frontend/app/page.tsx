"use client"

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Shield, Download, ArrowRight, Check, Brain, Search, Mic, Sparkles, PenLine, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";

// --- Animated text cycling ---
function AnimatedText({ texts, interval = 2000 }: { texts: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % texts.length), interval);
    return () => clearInterval(timer);
  }, [texts.length, interval]);
  return (
    <span className="relative inline-block">
      <motion.span
        key={index}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.45 }}
        className="text-indigo-600"
      >
        {texts[index]}
      </motion.span>
    </span>
  );
}

// --- Browser-chrome screenshot frame ---
function ScreenshotFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 shadow-2xl overflow-hidden bg-white">
      <div className="flex items-center gap-1.5 bg-zinc-100 px-4 py-2.5 border-b border-zinc-200">
        <div className="h-3 w-3 rounded-full bg-red-400" />
        <div className="h-3 w-3 rounded-full bg-yellow-400" />
        <div className="h-3 w-3 rounded-full bg-green-400" />
        <div className="ml-3 flex-1 h-5 rounded bg-white/70 border border-zinc-200" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full block" />
    </div>
  );
}

// --- Feature illustrations ---

function SearchIllustration() {
  return (
    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/60 backdrop-blur-sm flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
      <Search className="w-6 h-6 text-indigo-600" strokeWidth={1.75} />
    </div>
  );
}

function VoiceIllustration() {
  return (
    <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-200/60 backdrop-blur-sm flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
      <Mic className="w-6 h-6 text-violet-600" strokeWidth={1.75} />
    </div>
  );
}

function TagsIllustration() {
  return (
    <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-200/60 backdrop-blur-sm flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
      <Sparkles className="w-6 h-6 text-violet-500" strokeWidth={1.75} />
    </div>
  );
}

function MarkdownIllustration() {
  return (
    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200/60 backdrop-blur-sm flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
      <PenLine className="w-6 h-6 text-blue-600" strokeWidth={1.75} />
    </div>
  );
}

function AIIllustration() {
  return (
    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/60 backdrop-blur-sm flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
      <Brain className="w-6 h-6 text-indigo-700" strokeWidth={1.75} />
    </div>
  );
}

function SyncIllustration() {
  return (
    <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200/60 backdrop-blur-sm flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
      <Cloud className="w-6 h-6 text-sky-600" strokeWidth={1.75} />
    </div>
  );
}

// --- Feature card with illustration ---
function FeatureCard({
  illustration,
  title,
  description,
  delay,
}: {
  illustration: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="group rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm transition-all hover:shadow-md hover:border-indigo-200"
    >
      <div className="mb-5">{illustration}</div>
      <h3 className="mb-2 text-lg font-semibold text-zinc-900">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-500">{description}</p>
    </motion.div>
  );
}

// --- Page ---
export default function LandingPage() {
  const heroTexts = useMemo(() => [
    "your second brain.",
    "always organized.",
    "instantly findable.",
    "privately yours.",
  ], []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-100 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <Brain className="h-4 w-4" />
              </div>
              <span className="text-lg font-bold text-zinc-900">Tentacle</span>
            </Link>
            <nav className="hidden items-center gap-8 md:flex">
              <Link href="#features" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Features</Link>
              <Link href="#privacy" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Privacy</Link>
              <Link href="#pricing" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Pricing</Link>
            </nav>
            <div className="flex items-center gap-4">
              <Link href="/login" className="hidden text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors md:block">
                Log in
              </Link>
              <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <Link href="/signup">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section — centered, Notion-style */}
      <section className="relative overflow-hidden bg-[#fff] pt-32 pb-0 lg:pt-44 pb-24">
        <div className="container mx-auto px-6 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400"
          >
            Local-first · AI-powered · Private
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="mx-auto mt-5 max-w-3xl text-5xl font-bold tracking-tight text-zinc-900 sm:text-6xl lg:text-7xl"
          >
            Your notes,{" "}
            <AnimatedText texts={heroTexts} />
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="mx-auto mt-5 max-w-md text-base text-zinc-500"
          >
            Capture ideas with voice, find anything with semantic search, and let AI organize your thoughts — all on your device.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.28 }}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <Button asChild size="lg" className="gap-2 rounded-full bg-zinc-900 px-6 hover:bg-zinc-700 text-white">
              <Link href="/signup">
                <Download className="h-4 w-4" />
                Download for Free
              </Link>
            </Button>
          </motion.div>

          {/* Screenshot — full-width, flush to section bottom */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mx-auto mt-16 max-w-5xl"
          >
            <ScreenshotFrame src="/screenshots/screenshot-1.png" alt="Tentacle app — document library" />
          </motion.div>
        </div>
      </section>

      {/* How it works Section */}
      <section className="py-28 bg-[#f8f9fc] overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
                How it works
              </span>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="mt-6 text-3xl font-bold text-zinc-900 sm:text-4xl"
            >
              From thought to organized knowledge — in seconds
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.16 }}
              className="mt-4 text-base text-zinc-500"
            >
              No complex setup. No manual filing. Just capture and let Tentacle do the rest.
            </motion.p>
          </div>

          <div className="mt-20 mx-auto max-w-4xl grid gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {/* Step 1 */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="group rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm"
            >
              <div className="flex items-start justify-between mb-6">
                <span className="text-[5rem] leading-none font-black text-zinc-100 select-none -mt-2 -ml-1">1</span>
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-105">
                  <Mic className="w-7 h-7 text-indigo-600" strokeWidth={1.5} />
                </div>
              </div>
              <h3 className="text-base font-semibold text-zinc-900 text-left">Record your voice</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500 text-left">
                Speak your thoughts. No typing needed — Tentacle captures audio directly on your device.
              </p>
            </motion.div>

            {/* Connector 1→2 */}
            <div className="hidden lg:flex items-center justify-center px-1">
              <ArrowRight className="w-5 h-5 text-zinc-300" />
            </div>

            {/* Step 2 */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="group rounded-2xl border border-violet-200 bg-white p-8 text-center shadow-sm"
            >
              <div className="flex items-start justify-between mb-6">
                <span className="text-[5rem] leading-none font-black text-violet-50 select-none -mt-2 -ml-1">2</span>
                <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-200/60 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-105">
                  <Sparkles className="w-7 h-7 text-violet-600" strokeWidth={1.5} />
                </div>
              </div>
              <h3 className="text-base font-semibold text-zinc-900 text-left">AI organizes everything</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500 text-left">
                Transcribed, tagged, and indexed automatically. Your note is searchable before you blink.
              </p>
            </motion.div>

            {/* Connector 2→3 */}
            <div className="hidden lg:flex items-center justify-center px-1">
              <ArrowRight className="w-5 h-5 text-zinc-300" />
            </div>

            {/* Step 3 */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="group rounded-2xl border border-dashed border-sky-200 bg-white/60 p-8 text-center shadow-sm"
            >
              <div className="flex items-start justify-between mb-6">
                <span className="text-[5rem] leading-none font-black text-sky-50 select-none -mt-2 -ml-1">3</span>
                <div className="relative w-14 h-14 rounded-2xl bg-sky-50 border border-sky-200/60 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-105">
                  <Cloud className="w-7 h-7 text-sky-500" strokeWidth={1.5} />
                </div>
              </div>
              <div className="flex items-center gap-2 text-left mb-2">
                <h3 className="text-base font-semibold text-zinc-900">Sync everywhere</h3>
                <span className="text-[11px] font-medium bg-zinc-100 text-zinc-400 px-2 py-0.5 rounded-full leading-none shrink-0">optional</span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-500 text-left">
                Enable cloud sync to access your notes on any device, encrypted end-to-end.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-zinc-900 sm:text-4xl">
              Everything you need to capture and organize ideas
            </h2>
            <p className="mt-4 text-lg text-zinc-500">
              Powerful features that work locally on your device, with optional cloud AI when you need it.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              illustration={<SearchIllustration />}
              title="Semantic Search"
              description="Find notes by meaning, not just keywords. Local embeddings understand what you're looking for — no cloud required."
              delay={0}
            />
            <FeatureCard
              illustration={<VoiceIllustration />}
              title="Voice Capture"
              description="Capture ideas instantly with voice recording. Transcribed locally using Whisper or with your own OpenAI key."
              delay={0.08}
            />
            <FeatureCard
              illustration={<TagsIllustration />}
              title="Auto-Tagging"
              description="Let AI automatically organize your notes with relevant tags. Free users can BYOK, Pro users get it included."
              delay={0.16}
            />
            <FeatureCard
              illustration={<MarkdownIllustration />}
              title="Markdown Support"
              description="Write in Markdown with a beautiful editor. Export to Obsidian or any other Markdown-compatible tool."
              delay={0.24}
            />
            <FeatureCard
              illustration={<AIIllustration />}
              title="AI-Powered RAG"
              description="Chat with your knowledge base. Ask questions and get answers sourced directly from your own notes."
              delay={0.32}
            />
            <FeatureCard
              illustration={<SyncIllustration />}
              title="Cloud Sync"
              description="Optional cloud sync keeps your notes available across all your devices. Encrypted and secure."
              delay={0.4}
            />
          </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section id="privacy" className="py-24 bg-[#f8f9fc]">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-6xl">
            <div className="grid items-center gap-16 lg:grid-cols-2">
              {/* Left: text */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700">
                  <Shield className="h-4 w-4" />
                  Privacy First
                </div>
                <h2 className="mt-6 text-3xl font-bold text-zinc-900 sm:text-4xl">
                  Your notes never leave your device unless you want them to
                </h2>
                <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
                  Tentacle is built on a local-first architecture. All your notes, embeddings,
                  and search indexes are stored locally. We can&apos;t read your notes even if we wanted to.
                </p>
                <ul className="mt-8 space-y-4">
                  {[
                    "All data stored locally in SQLite",
                    "Embeddings computed on-device",
                    "Optional end-to-end encrypted cloud sync",
                    "Export to Obsidian anytime",
                    "Open source and auditable",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-zinc-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Right: screenshot 2 */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.15 }}
              >
                <ScreenshotFrame src="/screenshots/screenshot-2.png" alt="Tentacle — document editor, local-first" />
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-zinc-900 sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-zinc-500">
              Start free, upgrade when you need more power. No hidden fees.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-4xl gap-8 lg:grid-cols-2">
            {/* Free */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45 }}
              className="rounded-2xl border border-zinc-200 bg-white p-8"
            >
              <p className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Free</p>
              <div className="mt-4 flex items-baseline">
                <span className="text-5xl font-bold text-zinc-900">$0</span>
              </div>
              <p className="mt-2 text-sm text-zinc-500">Perfect for getting started with local note-taking</p>
              <ul className="mt-8 space-y-3">
                {[
                  "Local note storage",
                  "Semantic search (local embeddings)",
                  "Voice capture with BYOK",
                  "Manual tagging",
                  "Markdown export to Obsidian",
                  "BYOK auto-tagging (with friction)",
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-zinc-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-8 w-full bg-zinc-900 hover:bg-zinc-800">
                <Link href="/signup">Download Free</Link>
              </Button>
            </motion.div>

            {/* Pro */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="relative rounded-2xl border-2 border-indigo-600 bg-indigo-50/40 p-8"
            >
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                Most Popular
              </div>
              <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Pro</p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-bold text-zinc-900">$10</span>
                <span className="text-zinc-400">/month</span>
              </div>
              <p className="mt-2 text-sm text-zinc-500">Unlock the full power of AI-powered note-taking</p>
              <ul className="mt-8 space-y-3">
                {[
                  "Everything in Free",
                  "Auto-tagging (no API key needed)",
                  "Chat with knowledge base (RAG)",
                  "Cloud sync across devices",
                  "Mobile app access",
                  "Priority support",
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-zinc-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-8 w-full bg-indigo-600 hover:bg-indigo-700">
                <Link href="/signup">Start Pro Trial</Link>
              </Button>
            </motion.div>
          </div>

          <p className="mt-8 text-center text-sm text-zinc-400">
            Pro billed monthly. Cancel anytime.
          </p>
        </div>
      </section>

      {/* CTA Section — clean, SQLite-inspired */}
      <section className="py-24 bg-[#f8f9fc]">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2 className="text-4xl font-bold text-zinc-900 sm:text-5xl">
              Ready to build your second brain?
            </h2>
            <p className="mx-auto mt-5 text-lg text-zinc-500">
              Join people who trust Tentacle to organize their thoughts,
              capture ideas, and find knowledge instantly — all on their own device.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                <Link href="/signup">
                  <Download className="h-4 w-4" />
                  Download for Free
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link href="/app">
                  Try Web App
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-zinc-400">No credit card required. Free forever.</p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-8">
        <div className="container mx-auto px-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-600 text-white">
              <Brain className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold text-zinc-900">Tentacle</span>
          </div>
          <p className="text-sm text-zinc-400">© 2026 Tentacle. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="#features" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Features</Link>
            <Link href="#privacy" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Privacy</Link>
            <Link href="#pricing" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Pricing</Link>
            <Link href="/login" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
