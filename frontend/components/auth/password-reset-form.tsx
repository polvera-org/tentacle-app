'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import Link from 'next/link'

export function PasswordResetForm() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const { resetPassword } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setError('Please enter your email address')
      setIsLoading(false)
      return
    }

    const { error: resetError } = await resetPassword(trimmedEmail)

    if (resetError) {
      setError(resetError.message || 'Failed to send reset link. Please try again.')
      setIsLoading(false)
      return
    }

    setIsSuccess(true)
    setIsLoading(false)
  }

  if (isSuccess) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-green-50 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">Check your email</h3>
        <p className="text-gray-600 text-sm">
          We&apos;ve sent a password reset link to <strong className="text-gray-900">{email}</strong>
        </p>
        <p className="text-xs text-gray-500">
          The link will expire in 24 hours. If you don&apos;t see it, check your spam folder.
        </p>
        <Link
          href="/login"
          className="inline-block text-violet-600 hover:text-violet-700 text-sm"
        >
          Back to login
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
        Enter your email address and we&apos;ll send you a link to reset your password.
      </p>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 mb-2"
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
          className="w-full h-12 px-5 bg-white border border-gray-300 rounded-full text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          placeholder="you@example.com"
        />
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
            Sending...
          </span>
        ) : (
          'Send reset link'
        )}
      </button>
    </form>
  )
}
