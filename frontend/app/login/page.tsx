import Link from 'next/link'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'

function LoginFormFallback() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-12 bg-gray-100 rounded-full" />
      <div className="h-12 bg-gray-100 rounded-full" />
      <div className="h-12 bg-violet-100 rounded-full" />
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col justify-center px-4 sm:px-6 lg:px-8">
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
            className="font-medium text-violet-600 hover:text-violet-700 transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
