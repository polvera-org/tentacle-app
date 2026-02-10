'use client'

import { useState } from 'react'
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

function PasswordStrengthIndicator({ password }: { password: string }) {
  const metRequirements = requirements.filter((req) => req.test(password))
  const strength = metRequirements.length

  const getStrengthColor = () => {
    if (strength <= 1) return 'bg-red-500'
    if (strength <= 2) return 'bg-yellow-500'
    if (strength <= 3) return 'bg-blue-500'
    return 'bg-green-500'
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full transition-colors ${
              strength >= level ? getStrengthColor() : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
      <ul className="space-y-1">
        {requirements.map((req) => (
          <li
            key={req.label}
            className={`flex items-center gap-2 text-xs transition-colors ${
              req.test(password) ? 'text-green-400' : 'text-gray-500'
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
  )
}

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { signUp } = useAuth()
  const router = useRouter()

  const isPasswordValid = requirements.every((req) => req.test(password))
  const doPasswordsMatch = password === confirmPassword && password.length > 0
  const isFormValid = email.length > 0 && isPasswordValid && doPasswordsMatch && agreedToTerms

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

    if (!agreedToTerms) {
      setError('Please agree to the terms of service')
      setIsLoading(false)
      return
    }

    const { error: signUpError } = await signUp(trimmedEmail, password)

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        setError('This email is already registered. Try logging in instead.')
      } else {
        setError(signUpError.message || 'Failed to create account. Please try again.')
      }
      setIsLoading(false)
      return
    }

    router.push('/app')
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aria-required="true"
          className="w-full h-12 px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          placeholder="••••••••"
        />
        <PasswordStrengthIndicator password={password} />
      </div>

      <div>
        <label 
          htmlFor="confirmPassword" 
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          Confirm password
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
          aria-describedby={confirmPassword && !doPasswordsMatch ? 'password-mismatch' : undefined}
          className="w-full h-12 px-4 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          placeholder="••••••••"
        />
        {confirmPassword && !doPasswordsMatch && (
          <p id="password-mismatch" className="mt-1 text-sm text-red-400">
            Passwords do not match
          </p>
        )}
      </div>

      <div className="flex items-start">
        <input
          id="terms"
          name="terms"
          type="checkbox"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-900 text-violet-600 focus:ring-violet-500 focus:ring-offset-gray-900"
        />
        <label htmlFor="terms" className="ml-2 text-sm text-gray-400">
          I agree to the{' '}
          <Link href="/terms" className="text-violet-400 hover:text-violet-300">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-violet-400 hover:text-violet-300">
            Privacy Policy
          </Link>
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading || !isFormValid}
        aria-disabled={isLoading || !isFormValid}
        className="w-full h-12 px-4 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Creating account...
          </span>
        ) : (
          'Create account'
        )}
      </button>
    </form>
  )
}
