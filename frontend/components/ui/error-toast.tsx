'use client'

import { useEffect } from 'react'

interface ErrorToastProps {
  message: string
  onDismiss: () => void
  duration?: number
}

export function ErrorToast({ message, onDismiss, duration = 5000 }: ErrorToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [onDismiss, duration])

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
        <p className="text-sm font-medium flex-1">{message}</p>
        <button
          onClick={onDismiss}
          className="text-white/80 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
