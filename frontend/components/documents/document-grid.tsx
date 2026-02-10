'use client'

import { useEffect, useState } from 'react'
import { fetchDocuments } from '@/lib/documents/api'
import { DocumentCard } from './document-card'
import { NewDocumentCard } from './new-document-card'
import type { DocumentListItem } from '@/types/documents'

export function DocumentGrid() {
  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchDocuments()
      .then(setDocuments)
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <NewDocumentCard />
      {documents.map((doc) => (
        <DocumentCard key={doc.id} document={doc} />
      ))}
    </div>
  )
}
