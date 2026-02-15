"use client"

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { 
  Search, 
  Mic, 
  Tags, 
  Shield, 
  Zap, 
  Download,
  ArrowRight,
  Check,
  Brain,
  FileText,
  Cloud,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Animated text component
function AnimatedText({ texts, interval = 2000 }: { texts: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % texts.length);
    }, interval);
    return () => clearInterval(timer);
  }, [texts.length, interval]);
  
  return (
    <span className="relative inline-block">
      <motion.span
        key={index}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}
        className="text-indigo-600"
      >
        {texts[index]}
      </motion.span>
    </span>
  );
}

// Feature card component
function FeatureCard({ icon: Icon, title, description, delay }: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="group relative rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm transition-all hover:shadow-lg hover:border-indigo-200"
    >
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-2 text-xl font-semibold text-zinc-900">{title}</h3>
      <p className="text-zinc-600">{description}</p>
    </motion.div>
  );
}

// Pricing card component
function PricingCard({ 
  title, 
  price, 
  description, 
  features, 
  cta, 
  href, 
  highlighted = false 
}: { 
  title: string; 
  price: string; 
  description: string; 
  features: string[]; 
  cta: string; 
  href: string;
  highlighted?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={`relative rounded-2xl p-8 ${
        highlighted 
          ? 'border-2 border-indigo-600 bg-indigo-50/50' 
          : 'border border-zinc-200 bg-white'
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-sm font-medium text-white">
          Most Popular
        </div>
      )}
      <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
      <div className="mt-4 flex items-baseline">
        <span className="text-4xl font-bold text-zinc-900">{price}</span>
        {price !== "$0" && <span className="ml-2 text-zinc-500">/month</span>}
      </div>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
      <ul className="mt-6 space-y-3">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3">
            <Check className="h-5 w-5 shrink-0 text-indigo-600" />
            <span className="text-sm text-zinc-600">{feature}</span>
          </li>
        ))}
      </ul>
      <Button 
        asChild 
        className={`mt-8 w-full ${
          highlighted 
            ? 'bg-indigo-600 hover:bg-indigo-700' 
            : 'bg-zinc-900 hover:bg-zinc-800'
        }`}
      >
        <Link href={href}>{cta}</Link>
      </Button>
    </motion.div>
  );
}

export default function LandingPage() {
  const heroTexts = useMemo(() => [
    "your second brain",
    "your knowledge base",
    "your note companion",
    "your ideas organized"
  ], []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-100 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <Brain className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold text-zinc-900">Tentacle</span>
            </Link>
            <nav className="hidden items-center gap-6 md:flex">
              <Link href="#features" className="text-sm text-zinc-600 hover:text-zinc-900">Features</Link>
              <Link href="#privacy" className="text-sm text-zinc-600 hover:text-zinc-900">Privacy</Link>
              <Link href="#pricing" className="text-sm text-zinc-600 hover:text-zinc-900">Pricing</Link>
            </nav>
            <div className="flex items-center gap-3">
              <Link 
                href="/login" 
                className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 md:block"
              >
                Log in
              </Link>
              <Button asChild>
                <Link href="/signup">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-48 lg:pb-32">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
                <Zap className="h-4 w-4" />
                Now with AI-powered auto-tagging
              </span>
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-6 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl"
            >
              The note-taking app that becomes{" "}
              <AnimatedText texts={heroTexts} />
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600"
            >
              Tentacle combines local-first privacy with powerful AI. Capture ideas with voice, 
              find anything with semantic search, and let AI organize your thoughts automatically.
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
            >
              <Button asChild size="lg" className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                <Link href="/signup">
                  <Download className="h-5 w-5" />
                  Download for Free
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="gap-2">
                <Link href="/app">
                  Open Web App
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </motion.div>
            
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-4 text-sm text-zinc-500"
            >
              Free forever. No credit card required.
            </motion.p>
          </div>
        </div>
        
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 transform">
            <div className="h-[600px] w-[600px] rounded-full bg-indigo-100/50 blur-3xl" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-zinc-50">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-zinc-900 sm:text-4xl">
              Everything you need to capture and organize ideas
            </h2>
            <p className="mt-4 text-lg text-zinc-600">
              Powerful features that work locally on your device, with optional cloud AI when you need it.
            </p>
          </div>
          
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Search}
              title="Semantic Search"
              description="Find notes by meaning, not just keywords. Our local embeddings understand what you're looking for."
              delay={0}
            />
            <FeatureCard
              icon={Mic}
              title="Voice Capture"
              description="Capture ideas instantly with voice recording. Transcribed locally using Whisper or with your own OpenAI key."
              delay={0.1}
            />
            <FeatureCard
              icon={Tags}
              title="Auto-Tagging"
              description="Let AI automatically organize your notes with relevant tags. Free users can BYOK, Pro users get it included."
              delay={0.2}
            />
            <FeatureCard
              icon={FileText}
              title="Markdown Support"
              description="Write in Markdown with a beautiful editor. Export to Obsidian or any other Markdown-compatible tool."
              delay={0.3}
            />
            <FeatureCard
              icon={Brain}
              title="AI-Powered"
              description="Chat with your knowledge base using RAG. Ask questions and get answers from your own notes."
              delay={0.4}
            />
            <FeatureCard
              icon={Cloud}
              title="Cloud Sync"
              description="Optional cloud sync keeps your notes available across all your devices. Encrypted and secure."
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section id="privacy" className="py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-6xl">
            <div className="grid items-center gap-12 lg:grid-cols-2">
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
                <p className="mt-4 text-lg text-zinc-600">
                  Tentacle is built on a local-first architecture. All your notes, embeddings, 
                  and search indexes are stored locally. We can't read your notes even if we wanted to.
                </p>
                <ul className="mt-8 space-y-4">
                  {[
                    "All data stored locally in SQLite",
                    "Embeddings computed on-device",
                    "Optional end-to-end encrypted cloud sync",
                    "Export to Obsidian anytime",
                    "Open source and auditable"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Check className="h-4 w-4" />
                      </div>
                      <span className="text-zinc-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="relative"
              >
                <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg">
                  <div className="flex items-center gap-4 border-b border-zinc-100 pb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100">
                      <Lock className="h-5 w-5 text-zinc-600" />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900">Local Storage</p>
                      <p className="text-sm text-zinc-500">100% private</p>
                    </div>
                    <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      Active
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600">Documents</span>
                      <span className="font-medium text-zinc-900">Local SQLite</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600">Embeddings</span>
                      <span className="font-medium text-zinc-900">On-device</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600">Search Index</span>
                      <span className="font-medium text-zinc-900">Local</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600">Cloud Sync</span>
                      <span className="font-medium text-zinc-900">Optional</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-zinc-50">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-zinc-900 sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-zinc-600">
              Start free, upgrade when you need more power. No hidden fees.
            </p>
          </div>
          
          <div className="mx-auto mt-16 grid max-w-4xl gap-8 lg:grid-cols-2">
            <PricingCard
              title="Free"
              price="$0"
              description="Perfect for getting started with local note-taking"
              features={[
                "Local note storage",
                "Semantic search (local embeddings)",
                "Voice capture with BYOK",
                "Manual tagging",
                "Markdown export to Obsidian",
                "BYOK auto-tagging (with friction)",
                "No cloud sync"
              ]}
              cta="Download Free"
              href="/signup"
            />
            <PricingCard
              title="Pro"
              price="$10"
              description="Unlock the full power of AI-powered note-taking"
              features={[
                "Everything in Free",
                "Auto-tagging (no API key needed)",
                "Chat with knowledge base (RAG)",
                "Cloud sync across devices",
                "Mobile app access",
                "Priority support",
                "Your second brain that organizes itself"
              ]}
              cta="Start Pro Trial"
              href="/signup"
              highlighted
            />
          </div>
          
          <p className="mt-8 text-center text-sm text-zinc-500">
            Pro subscription billed monthly. Cancel anytime.
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-4xl rounded-3xl bg-indigo-600 px-8 py-16 text-center sm:px-16"
          >
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Ready to build your second brain?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-100">
              Join thousands of users who trust Tentacle to organize their thoughts, 
              capture ideas, and find knowledge instantly.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" variant="secondary" className="gap-2">
                <Link href="/signup">
                  <Download className="h-5 w-5" />
                  Download for Free
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 border-white/30 bg-transparent text-white hover:bg-white/10">
                <Link href="/app">
                  Try Web App
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-indigo-200">
              No credit card required. Free forever.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-zinc-50 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <Brain className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold text-zinc-900">Tentacle</span>
            </div>
            <p className="text-sm text-zinc-500">
              © 2026 Tentacle. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link href="/login" className="text-sm text-zinc-600 hover:text-zinc-900">
                Log in
              </Link>
              <Link href="/signup" className="text-sm text-zinc-600 hover:text-zinc-900">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
