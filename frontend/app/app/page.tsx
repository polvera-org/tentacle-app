'use client'

import { useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { DocumentGrid } from '@/components/documents/document-grid'
import { SettingsModal } from '@/components/settings/settings-modal'
import { MyAccountModal } from '@/components/account/my-account-modal'
import { useDebounce } from '@/hooks/use-debounce'

function normalizeFolderPath(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.trim().replace(/\\/g, '/')
  if (normalized.length === 0 || normalized === '/' || normalized === '.') {
    return ''
  }

  const segments: string[] = []
  for (const segment of normalized.split('/')) {
    const trimmedSegment = segment.trim()
    if (trimmedSegment.length === 0 || trimmedSegment === '.') {
      continue
    }

    if (trimmedSegment === '..') {
      segments.pop()
      continue
    }

    segments.push(trimmedSegment)
  }

  return segments.join('/')
}

export default function DashboardPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 400)

  const currentFolderPath = useMemo(
    () => normalizeFolderPath(searchParams.get('folder')),
    [searchParams],
  )

  const handleFolderPathChange = useCallback((nextFolderPath: string) => {
    const normalizedNextPath = normalizeFolderPath(nextFolderPath)
    const normalizedCurrentPath = normalizeFolderPath(searchParams.get('folder'))

    if (normalizedCurrentPath === normalizedNextPath) {
      return
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    if (normalizedNextPath.length === 0) {
      nextParams.delete('folder')
    } else {
      nextParams.set('folder', normalizedNextPath)
    }

    const queryString = nextParams.toString()
    const nextUrl = queryString.length > 0 ? `${pathname}?${queryString}` : pathname
    router.replace(nextUrl)
  }, [pathname, router, searchParams])

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Image
            src="/tentacle-spiral.png"
            alt="Tentacle logo"
            width={40}
            height={40}
            priority
            className="h-10 w-10"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Open settings"
              className="h-11 w-11 inline-flex items-center justify-center text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-white"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.66 1.66 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.66 1.66 0 0 0-1.82-.33 1.66 1.66 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.66 1.66 0 0 0-1-1.51 1.66 1.66 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.66 1.66 0 0 0 .33-1.82 1.66 1.66 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.66 1.66 0 0 0 1.51-1 1.66 1.66 0 0 0-.33-1.82L4.21 7.4a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.66 1.66 0 0 0 1.82.33H9a1.66 1.66 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.66 1.66 0 0 0 1 1.51 1.66 1.66 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.66 1.66 0 0 0-.33 1.82V9c0 .68.4 1.3 1.03 1.57.15.06.31.1.48.1H21a2 2 0 0 1 0 4h-.09a1.66 1.66 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setIsAccountOpen(true)}
              aria-label="Open my account"
              className="h-11 w-11 inline-flex items-center justify-center text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-white"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <circle cx="12" cy="8" r="3.25" />
                <path d="M5.5 19.25a6.5 6.5 0 0 1 13 0" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <SettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <MyAccountModal open={isAccountOpen} onClose={() => setIsAccountOpen(false)} />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-4">
            <label htmlFor="documents-search" className="sr-only">
              Search documents
            </label>
            <input
              id="documents-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search documents"
              autoComplete="off"
              className="w-full h-14 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div className="min-h-0 flex-1">
            <DocumentGrid
              searchQuery={debouncedSearchQuery}
              initialFolderPath={currentFolderPath}
              onFolderPathChange={handleFolderPathChange}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
