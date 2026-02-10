'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { signIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('returnUrl') || '/app'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Trim email
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setError('Please enter your email address')
      setIsLoading(false)
      return
    }

    if (!password) {
      setError('Please enter your password')
      setIsLoading(false)
      return
    }

    const { error: signInError } = await signIn(trimmedEmail, password)

    if (signInError) {
      setError('Invalid email or password. Please try again.')
      setIsLoading(false)
      return
    }

    router.push(returnUrl)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <div 
          role="alert"
          aria-live="polite"
          className="p-3 text-sm text-red-200 bg-red-900/30 border border-red-800 rounded-lg"
        >
          {error}
        </div>
      )}

      <div>
        <label 
          htmlFor="email" 
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          aria-required="true"
          aria-describedby={error ? 'email-error' : undefined}
          className="w-full h-12 px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label 
          htmlFor="password" 
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          aria-required="true"
          aria-describedby={error ? 'password-error' : undefined}
          className="w-full h-12 px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          placeholder="••••••••"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            id="remember"
            name="remember"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-violet-600 focus:ring-violet-500 focus:ring-offset-gray-900"
          />
          <label htmlFor="remember" className="ml-2 text-sm text-gray-400">
            Remember me
          </label>
        </div>
        <Link 
          href="/reset-password" 
          className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
        >
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        aria-disabled={isLoading}
        className="w-full h-12 px-4 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Signing in...
          </span>
        ) : (
          'Sign in'
        )}
      </button>
    </form>
  )
}
