'use client'

import { useAuth } from '@/lib/auth/auth-context'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    const { error } = await signOut()
    if (!error) {
      router.push('/login')
    } else {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Tentacle</h1>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="h-10 px-4 text-sm font-medium text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to Tentacle
          </h2>
          <p className="text-gray-600 mb-6">
            Your voice-powered PKM assistant is ready.
          </p>

          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-1">Email</h3>
              <p className="text-gray-900">{user?.email}</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-1">User ID</h3>
              <p className="text-gray-600 text-sm font-mono">{user?.id}</p>
            </div>
          </div>

          <div className="mt-8 p-4 bg-violet-50 border border-violet-200 rounded-lg">
            <p className="text-sm text-violet-700">
              <span className="font-medium">Coming soon:</span> Voice capture, semantic linking, and Obsidian sync.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
