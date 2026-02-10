import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-md w-full mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Create your account</h1>
          <p className="mt-2 text-sm text-gray-400">
            Get started with Tentacle today
          </p>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <SignupForm />
        </div>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link 
            href="/login" 
            className="font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
