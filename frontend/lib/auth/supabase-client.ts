'use client'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Get environment variables with fallbacks for build time
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function createClient() {
  // Log environment variable availability for debugging
  console.log('[SupabaseClient] Environment check:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    url: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'undefined'
  })

  // During build/SSG, we might not have env vars
  // Return a mock client that will be replaced at runtime
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[SupabaseClient] CRITICAL: Supabase credentials not available!')
    console.error('[SupabaseClient] This will cause OAuth to fail. Check your build process.')
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

  console.log('[SupabaseClient] Creating client with valid credentials')
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: 'tentacle-auth',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  })
}
