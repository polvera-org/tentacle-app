'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDocument } from '@/lib/documents/api'
import { ErrorToast } from '@/components/ui/error-toast'

export function NewDocumentCard() {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (isCreating) return
    setIsCreating(true)
    setError(null)

    try {
      const doc = await createDocument()
      router.push(`/app/documents?id=${doc.id}`)
    } catch (err) {
      console.error('[NewDocumentCard] Failed to create document:', err)
      const message = err instanceof Error ? err.message : 'Failed to create document. Please try again.'
      setError(message)
      setIsCreating(false)
    }
  }

  return (
    <>
    <button
      onClick={handleCreate}
      disabled={isCreating}
      className="h-48 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-2xl hover:border-brand-400 hover:bg-brand-50/50 transition-all group cursor-pointer disabled:opacity-50"
    >
      <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-brand-100 flex items-center justify-center transition-colors">
        <svg
          className="w-6 h-6 text-gray-400 group-hover:text-brand-600 transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
      <span className="text-sm font-medium text-gray-500 group-hover:text-brand-600 transition-colors">
        {isCreating ? 'Creating...' : 'New Document'}
      </span>
    </button>
      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
    </>
  )
}
