'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchCachedDocuments, reindexDocuments } from '@/lib/documents/api'
import { DocumentCard } from './document-card'
import { NewDocumentCard } from './new-document-card'
import type { DocumentListItem } from '@/types/documents'

export function DocumentGrid() {
  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [isInitialCacheLoading, setIsInitialCacheLoading] = useState(true)
  const [isSynchronizing, setIsSynchronizing] = useState(false)
  const requestIdRef = useRef(0)
  const hasLoadedCachedRef = useRef(false)
  const documentsCountRef = useRef(0)

  useEffect(() => {
    documentsCountRef.current = documents.length
  }, [documents.length])

  const loadDocuments = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!hasLoadedCachedRef.current && documentsCountRef.current === 0) {
      setIsInitialCacheLoading(true)
    }

    try {
      const cachedDocuments = await fetchCachedDocuments()
      if (requestId !== requestIdRef.current) {
        return
      }

      setDocuments(cachedDocuments)
    } catch (error) {
      console.error(error)
    } finally {
      if (requestId === requestIdRef.current && !hasLoadedCachedRef.current) {
        hasLoadedCachedRef.current = true
        setIsInitialCacheLoading(false)
      }
    }

    if (requestId !== requestIdRef.current) {
      return
    }

    setIsSynchronizing(true)

    try {
      const indexedDocuments = await reindexDocuments()
      if (requestId !== requestIdRef.current) {
        return
      }

      setDocuments(indexedDocuments)
    } catch (error) {
      console.error(error)
    } finally {
      if (requestId === requestIdRef.current) {
        setIsSynchronizing(false)
      }
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    const handleDocumentsFolderChanged = () => {
      loadDocuments()
    }

    window.addEventListener('documents-folder-changed', handleDocumentsFolderChanged)
    return () => window.removeEventListener('documents-folder-changed', handleDocumentsFolderChanged)
  }, [loadDocuments])

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
    }
  }, [])

  if (isInitialCacheLoading && documents.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {isSynchronizing ? (
        <p className="text-sm text-gray-500" role="status" aria-live="polite">
          Synchronizing...
        </p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <NewDocumentCard />
        {documents.map((doc) => (
          <DocumentCard key={doc.id} document={doc} />
        ))}
      </div>
    </div>
  )
}
