'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'

function LoginFormFallback() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-12 bg-gray-100 rounded-full" />
      <div className="h-12 bg-gray-100 rounded-full" />
      <div className="h-12 bg-brand-100 rounded-full" />
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header with back button */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <button
            onClick={() => router.back()}
            className="h-10 px-4 text-sm font-medium text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            aria-label="Go back"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Back
            </span>
          </button>
        </div>
      </header>

      {/* Main content - centered */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full mx-auto space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Sign in</h1>
            <p className="mt-2 text-sm text-gray-500">
              Welcome back! Please sign in to continue
            </p>
          </div>

          <div className="p-6 sm:p-8">
            <Suspense fallback={<LoginFormFallback />}>
              <LoginForm />
            </Suspense>
          </div>

          <p className="text-center text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
