'use client'

import { useEffect, useState } from 'react'
import { getOpenAIApiKey } from '@/lib/settings/openai-config'
import { X } from 'lucide-react'

interface ApiKeyBannerProps {
  onOpenSettings: () => void
}

const DISMISSAL_KEY = 'openai-banner-dismissed-at'
const DISMISSAL_DURATION_MS = 12 * 60 * 60 * 1000 // 12 hours

function isDismissed(): boolean {
  if (typeof window === 'undefined') return false

  const dismissedAt = localStorage.getItem(DISMISSAL_KEY)
  if (!dismissedAt) return false

  const dismissedTime = parseInt(dismissedAt, 10)
  if (isNaN(dismissedTime)) return false

  const now = Date.now()
  return now - dismissedTime < DISMISSAL_DURATION_MS
}

function setDismissed(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(DISMISSAL_KEY, Date.now().toString())
}

export function ApiKeyBanner({ onOpenSettings }: ApiKeyBannerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    async function checkApiKey() {
      try {
        // Don't show if already dismissed recently
        if (isDismissed()) {
          setIsVisible(false)
          setIsChecking(false)
          return
        }

        const apiKey = await getOpenAIApiKey()

        // Show banner only if no API key is set
        setIsVisible(!apiKey)
      } catch (error) {
        console.error('Failed to check OpenAI API key:', error)
        setIsVisible(false)
      } finally {
        setIsChecking(false)
      }
    }

    void checkApiKey()

    // Listen for settings changes and re-check
    const handleSettingsChanged = () => {
      void checkApiKey()
    }

    window.addEventListener('settings-changed', handleSettingsChanged)
    return () => window.removeEventListener('settings-changed', handleSettingsChanged)
  }, [])

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDismissed()
    setIsVisible(false)
  }

  const handleClick = () => {
    onOpenSettings()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenSettings()
    }
  }

  if (isChecking || !isVisible) {
    return null
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="w-full mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3 cursor-pointer hover:bg-blue-100 transition-colors group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <div className="flex-shrink-0 mt-0.5">
        <svg
          className="w-5 h-5 text-blue-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-900">
          Set up your OpenAI API key
        </p>
        <p className="text-sm text-blue-700 mt-0.5">
          Required for voice transcription and auto-tagging. Click to configure.
        </p>
        <a
          href="https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 inline-block focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-blue-50 rounded"
        >
          Where to find your API key?
        </a>
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 text-blue-400 hover:text-blue-600 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-blue-50"
        aria-label="Dismiss for 12 hours"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
