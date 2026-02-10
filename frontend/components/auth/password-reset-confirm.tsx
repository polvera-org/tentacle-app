'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface PasswordRequirement {
  label: string
  test: (password: string) => boolean
}

const requirements: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'One number', test: (p) => /[0-9]/.test(p) },
]

export function PasswordResetConfirm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  const { updatePassword } = useAuth()
  const router = useRouter()

  const isPasswordValid = requirements.every((req) => req.test(password))
  const doPasswordsMatch = password === confirmPassword && password.length > 0

  useEffect(() => {
    // Check if we have a session from the password recovery link
    const checkSession = async () => {
      const { createClient } = await import('@/lib/auth/supabase-client')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setError('This reset link has expired or is invalid. Please request a new one.')
      } else {
        setHasSession(true)
      }
    }

    checkSession()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!isPasswordValid) {
      setError('Password does not meet all requirements')
      setIsLoading(false)
      return
    }

    if (!doPasswordsMatch) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    const { error: updateError } = await updatePassword(password)

    if (updateError) {
      setError(updateError.message || 'Failed to update password. Please try again.')
      setIsLoading(false)
      return
    }

    setIsSuccess(true)
    setIsLoading(false)

    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push('/login?message=password-reset-success')
    }, 3000)
  }

  if (isSuccess) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-green-50 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">Password updated!</h3>
        <p className="text-gray-600 text-sm">
          Your password has been successfully reset.
        </p>
        <p className="text-xs text-gray-500">
          Redirecting you to login in a few seconds...
        </p>
        <Link
          href="/login"
          className="inline-block text-violet-600 hover:text-violet-700 text-sm"
        >
          Go to login
        </Link>
      </div>
    )
  }

  if (error && !hasSession) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-red-50 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">Link expired</h3>
        <p className="text-gray-600 text-sm">{error}</p>
        <Link
          href="/reset-password"
          className="inline-block text-violet-600 hover:text-violet-700 text-sm"
        >
          Request new reset link
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-full"
        >
          {error}
        </div>
      )}

      <p className="text-sm text-gray-600">
        Enter your new password below.
      </p>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          aria-required="true"
          className="w-full h-12 px-5 bg-white border border-gray-300 rounded-full text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          placeholder="••••••••"
        />
        <ul className="mt-2 space-y-1">
          {requirements.map((req) => (
            <li
              key={req.label}
              className={`flex items-center gap-2 text-xs transition-colors ${
                req.test(password) ? 'text-green-600' : 'text-gray-400'
              }`}
            >
              <span className="w-4 h-4 flex items-center justify-center">
                {req.test(password) ? '✓' : '○'}
              </span>
              {req.label}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          aria-required="true"
          className="w-full h-12 px-5 bg-white border border-gray-300 rounded-full text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          placeholder="••••••••"
        />
        {confirmPassword && !doPasswordsMatch && (
          <p className="mt-1 text-sm text-red-600">
            Passwords do not match
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        aria-disabled={isLoading}
        className="w-full h-12 px-4 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Updating...
          </span>
        ) : (
          'Update password'
        )}
      </button>
    </form>
  )
}
