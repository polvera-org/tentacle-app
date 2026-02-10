'use client'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Get environment variables with fallbacks for build time
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function createClient() {
  // During build/SSG, we might not have env vars
  // Return a mock client that will be replaced at runtime
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials not available - using fallback for build')
    return createSupabaseClient(
      'https://placeholder.supabase.co',
      'placeholder-key-for-build-only',
      {
        auth: {
          persistSession: true,
          storageKey: 'tentacle-auth',
          storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        },
      }
    )
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: 'tentacle-auth',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  })
}
