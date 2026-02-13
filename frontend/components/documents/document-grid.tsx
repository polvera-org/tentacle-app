'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { fetchCachedDocuments, fetchCachedDocumentTags, reindexDocuments } from '@/lib/documents/api'
import { DocumentCard } from './document-card'
import { DocumentTagFilters } from './document-tag-filters'
import { NewDocumentCard } from './new-document-card'
import type { DocumentListItem, DocumentTagUsage } from '@/types/documents'

export function DocumentGrid() {
  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [documentTags, setDocumentTags] = useState<DocumentTagUsage[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isInitialCacheLoading, setIsInitialCacheLoading] = useState(true)
  const [isSynchronizing, setIsSynchronizing] = useState(false)
  const requestIdRef = useRef(0)
  const hasLoadedCachedRef = useRef(false)
  const documentsCountRef = useRef(0)

  useEffect(() => {
    documentsCountRef.current = documents.length
  }, [documents.length])

  const applyDocumentTags = useCallback((tags: DocumentTagUsage[]) => {
    setDocumentTags(tags)

    const availableTags = new Set(tags.map(({ tag }) => tag))
    setSelectedTags((currentSelectedTags) => {
      const nextSelectedTags = currentSelectedTags.filter((tag) => availableTags.has(tag))
      return nextSelectedTags.length === currentSelectedTags.length ? currentSelectedTags : nextSelectedTags
    })
  }, [])

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((currentSelectedTags) => {
      if (currentSelectedTags.includes(tag)) {
        return currentSelectedTags.filter((selectedTag) => selectedTag !== tag)
      }

      return [...currentSelectedTags, tag]
    })
  }, [])

  const handleClearTags = useCallback(() => {
    setSelectedTags([])
  }, [])

  const filteredDocuments = useMemo(() => {
    if (selectedTags.length === 0) {
      return documents
    }

    const selectedTagSet = new Set(selectedTags)
    return documents.filter((document) => document.tags.some((tag) => selectedTagSet.has(tag)))
  }, [documents, selectedTags])

  const loadDocuments = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!hasLoadedCachedRef.current && documentsCountRef.current === 0) {
      setIsInitialCacheLoading(true)
    }

    try {
      const [cachedDocuments, cachedDocumentTags] = await Promise.all([
        fetchCachedDocuments(),
        fetchCachedDocumentTags(),
      ])

      if (requestId !== requestIdRef.current) {
        return
      }

      setDocuments(cachedDocuments)
      applyDocumentTags(cachedDocumentTags)
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

      const refreshedDocumentTags = await fetchCachedDocumentTags()
      if (requestId !== requestIdRef.current) {
        return
      }

      applyDocumentTags(refreshedDocumentTags)
    } catch (error) {
      console.error(error)
    } finally {
      if (requestId === requestIdRef.current) {
        setIsSynchronizing(false)
      }
    }
  }, [applyDocumentTags])

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
      <DocumentTagFilters
        tags={documentTags}
        selectedTags={selectedTags}
        onToggleTag={handleToggleTag}
        onClearTags={handleClearTags}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <NewDocumentCard />
        {filteredDocuments.map((doc) => (
          <DocumentCard key={doc.id} document={doc} />
        ))}
      </div>
    </div>
  )
}
