"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/auth/supabase-client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let subscription: { unsubscribe: () => void } | null = null;

    // Handle the OAuth callback by exchanging the code for a session
    const handleCallback = async () => {
      try {
        // Check if we have a session (Supabase handles the code exchange automatically)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setError('Failed to sign in. Please try again.');
          return;
        }

        if (session) {
          // Successfully authenticated, redirect to app
          router.replace("/app");
        } else {
          // No session yet, wait for auth state change
          const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_IN" && session) {
              router.replace("/app");
            } else if (event === "SIGNED_OUT") {
              router.replace("/login");
            }
          });
          subscription = data.subscription;
        }
      } catch (err) {
        console.error('Callback error:', err);
        setError('An unexpected error occurred.');
      }
    };

    handleCallback();

    // Cleanup subscription on unmount
    return () => {
      subscription?.unsubscribe();
    };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => router.replace("/login")}
            className="text-zinc-400 hover:text-zinc-300 underline"
          >
            Return to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-zinc-400">Signing you in…</p>
    </div>
  );
}
