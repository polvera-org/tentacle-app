import Link from 'next/link'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'

function LoginFormFallback() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-12 bg-gray-800 rounded-lg" />
      <div className="h-12 bg-gray-800 rounded-lg" />
      <div className="h-12 bg-violet-900/30 rounded-lg" />
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Welcome back</h1>
          <p className="mt-2 text-sm text-gray-400">
            Sign in to continue to Tentacle
          </p>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <Suspense fallback={<LoginFormFallback />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link 
            href="/signup" 
            className="font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
