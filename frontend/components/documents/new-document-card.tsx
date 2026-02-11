'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDocument } from '@/lib/documents/api'

export function NewDocumentCard() {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const doc = await createDocument()
      router.push(`/app/documents?id=${doc.id}`)
    } catch {
      setIsCreating(false)
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={isCreating}
      className="h-48 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-2xl hover:border-violet-400 hover:bg-violet-50/50 transition-all group cursor-pointer disabled:opacity-50"
    >
      <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-violet-100 flex items-center justify-center transition-colors">
        <svg
          className="w-6 h-6 text-gray-400 group-hover:text-violet-600 transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
      <span className="text-sm font-medium text-gray-500 group-hover:text-violet-600 transition-colors">
        {isCreating ? 'Creating...' : 'New Document'}
      </span>
    </button>
  )
}
