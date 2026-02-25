'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { createClient } from './supabase-client'
import { getAuthRedirectUrl, isTauriEnvironment } from '@/lib/utils/environment'
import { open } from '@tauri-apps/plugin-shell'

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setIsLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signUp = async (email: string, password: string) => {
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
      },
    })
    return { error }
  }

  const signInWithGoogle = async () => {
    const supabase = createClient()
    const redirectUrl = getAuthRedirectUrl()
    console.log('[AuthContext] signInWithGoogle called, redirectUrl:', redirectUrl)

    // In Tauri, we need to manually open the browser because window.open() is blocked
    if (isTauriEnvironment()) {
      console.log('[AuthContext] Tauri environment detected, using shell.open()')
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true, // Don't let Supabase try to open the browser
        },
      })

      if (error) {
        console.error('[AuthContext] signInWithGoogle error:', error)
        return { error }
      }

      if (data?.url) {
        console.log('[AuthContext] Opening OAuth URL in system browser:', data.url)
        try {
          await open(data.url)
          console.log('[AuthContext] Browser opened successfully')
        } catch (openError) {
          console.error('[AuthContext] Failed to open browser:', openError)
          return { error: new Error('Failed to open browser') as AuthError }
        }
      } else {
        console.error('[AuthContext] No OAuth URL returned from Supabase')
        return { error: new Error('No OAuth URL returned') as AuthError }
      }

      return { error: null }
    }

    // Non-Tauri environment (web)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    })
    if (error) {
      console.error('[AuthContext] signInWithGoogle error:', error)
    } else {
      console.log('[AuthContext] signInWithGoogle initiated successfully')
    }
    return { error }
  }

  const signOut = async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const resetPassword = async (email: string) => {
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password/confirm`,
    })
    return { error }
  }

  const updatePassword = async (password: string) => {
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password,
    })
    return { error }
  }

  const value = {
    user,
    session,
    isLoading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
