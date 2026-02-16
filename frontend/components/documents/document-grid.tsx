'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  fetchCachedDocuments,
  fetchCachedDocumentTags,
  fetchDocumentFolders,
  reindexDocuments,
  semanticSearchDocuments,
  deleteGlobalTag,
} from '@/lib/documents/api'
import { extractPlainTextFromTiptapBody } from '@/lib/documents/text'
import { DocumentCard } from './document-card'
import { DocumentTagFilters } from './document-tag-filters'
import { FolderBreadcrumbs } from './folder-breadcrumbs'
import { FolderCard } from './folder-card'
import { NewDocumentCard } from './new-document-card'
import type { DocumentFolder, DocumentListItem, DocumentTagUsage } from '@/types/documents'

interface DocumentGridProps {
  searchQuery: string
  initialFolderPath?: string
  onFolderPathChange?: (folderPath: string) => void
}

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

function fallbackSearchDocuments(query: string, documents: DocumentListItem[]): DocumentListItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length === 0) {
    return documents
  }

  return documents.filter((document) => {
    const normalizedTitle = document.title.toLowerCase()
    const normalizedBodyPreview = extractPlainTextFromTiptapBody(document.body).toLowerCase()

    return (
      normalizedTitle.includes(normalizedQuery) ||
      normalizedBodyPreview.includes(normalizedQuery)
    )
  })
}

export function DocumentGrid({
  searchQuery,
  initialFolderPath,
  onFolderPathChange,
}: DocumentGridProps) {
  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [documentFolders, setDocumentFolders] = useState<DocumentFolder[]>([])
  const [documentTags, setDocumentTags] = useState<DocumentTagUsage[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [currentFolderPath, setCurrentFolderPath] = useState(() => normalizeFolderPath(initialFolderPath))
  const [searchRankedDocuments, setSearchRankedDocuments] = useState<DocumentListItem[] | null>(null)
  const [isInitialCacheLoading, setIsInitialCacheLoading] = useState(true)
  const [isSynchronizing, setIsSynchronizing] = useState(false)
  const requestIdRef = useRef(0)
  const searchRequestIdRef = useRef(0)
  const hasLoadedCachedRef = useRef(false)
  const documentsCountRef = useRef(0)
  const normalizedSearchQuery = useMemo(() => searchQuery.trim(), [searchQuery])

  useEffect(() => {
    documentsCountRef.current = documents.length
  }, [documents.length])

  useEffect(() => {
    const normalizedInitialPath = normalizeFolderPath(initialFolderPath)
    setCurrentFolderPath((previousFolderPath) => {
      return previousFolderPath === normalizedInitialPath ? previousFolderPath : normalizedInitialPath
    })
  }, [initialFolderPath])

  useEffect(() => {
    onFolderPathChange?.(currentFolderPath)
  }, [currentFolderPath, onFolderPathChange])

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

  const handleOpenFolder = useCallback((folderPath: string) => {
    setCurrentFolderPath(normalizeFolderPath(folderPath))
  }, [])

  const visibleDocuments = useMemo(() => {
    return documents.filter((document) => normalizeFolderPath(document.folder_path) === currentFolderPath)
  }, [currentFolderPath, documents])

  const visibleDocumentTags = useMemo(() => {
    if (visibleDocuments.length === 0) {
      return []
    }

    const visibleTagSet = new Set<string>()
    for (const document of visibleDocuments) {
      for (const tag of document.tags) {
        visibleTagSet.add(tag)
      }
    }

    return documentTags.filter(({ tag }) => visibleTagSet.has(tag))
  }, [documentTags, visibleDocuments])

  const visibleChildFolders = useMemo(() => {
    return documentFolders.filter((folder) => {
      const parentPath = normalizeFolderPath(folder.parent_path)
      return parentPath === currentFolderPath
    })
  }, [currentFolderPath, documentFolders])

  const filteredDocuments = useMemo(() => {
    const searchableDocuments = normalizedSearchQuery.length === 0
      ? visibleDocuments
      : (searchRankedDocuments ?? [])

    if (selectedTags.length === 0) {
      return searchableDocuments
    }

    const selectedTagSet = new Set(selectedTags)
    return searchableDocuments.filter((document) => document.tags.some((tag) => selectedTagSet.has(tag)))
  }, [normalizedSearchQuery, searchRankedDocuments, selectedTags, visibleDocuments])

  const loadDocuments = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!hasLoadedCachedRef.current && documentsCountRef.current === 0) {
      setIsInitialCacheLoading(true)
    }

    try {
      const [cachedDocuments, cachedDocumentTags, cachedFolders] = await Promise.all([
        fetchCachedDocuments(),
        fetchCachedDocumentTags(),
        fetchDocumentFolders(),
      ])

      if (requestId !== requestIdRef.current) {
        return
      }

      setDocuments(cachedDocuments)
      setDocumentFolders(cachedFolders)
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

      const [refreshedDocumentTags, refreshedFolders] = await Promise.all([
        fetchCachedDocumentTags(),
        fetchDocumentFolders(),
      ])
      if (requestId !== requestIdRef.current) {
        return
      }

      setDocumentFolders(refreshedFolders)
      applyDocumentTags(refreshedDocumentTags)
    } catch (error) {
      console.error(error)
    } finally {
      if (requestId === requestIdRef.current) {
        setIsSynchronizing(false)
      }
    }
  }, [applyDocumentTags])

  const handleDeleteTag = useCallback(async (tag: string) => {
    await deleteGlobalTag(tag)
    await loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    if (isInitialCacheLoading) {
      return
    }

    if (currentFolderPath.length === 0) {
      return
    }

    const folderExists = documentFolders.some((folder) => folder.path === currentFolderPath)
    const folderHasDocuments = documents.some((document) => document.folder_path === currentFolderPath)
    if (!folderExists && !folderHasDocuments) {
      setCurrentFolderPath('')
    }
  }, [currentFolderPath, documentFolders, documents, isInitialCacheLoading])

  useEffect(() => {
    const currentRequestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = currentRequestId

    if (normalizedSearchQuery.length === 0) {
      setSearchRankedDocuments(null)
      return
    }

    setSearchRankedDocuments(null)

    void (async () => {
      try {
        const hits = await semanticSearchDocuments(normalizedSearchQuery)
        if (currentRequestId !== searchRequestIdRef.current) {
          return
        }

        const documentLookup = new Map(visibleDocuments.map((document) => [document.id, document]))
        const rankedDocuments: DocumentListItem[] = []
        for (const hit of hits) {
          const matchedDocument = documentLookup.get(hit.document_id)
          if (matchedDocument) {
            rankedDocuments.push(matchedDocument)
          }
        }

        setSearchRankedDocuments(rankedDocuments)
      } catch (error) {
        console.error('[DocumentGrid] Semantic search failed. Using text fallback.', error)
        if (currentRequestId !== searchRequestIdRef.current) {
          return
        }

        setSearchRankedDocuments(fallbackSearchDocuments(normalizedSearchQuery, visibleDocuments))
      }
    })()
  }, [normalizedSearchQuery, visibleDocuments])

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
      searchRequestIdRef.current += 1
    }
  }, [])

  if (isInitialCacheLoading && documents.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-gray-100" />
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
      <FolderBreadcrumbs
        currentFolderPath={currentFolderPath}
        onNavigate={handleOpenFolder}
      />
      {visibleChildFolders.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {visibleChildFolders.map((folder) => (
            <FolderCard
              key={folder.path || 'root'}
              folder={folder}
              onOpen={handleOpenFolder}
            />
          ))}
        </div>
      ) : null}
      <DocumentTagFilters
        tags={visibleDocumentTags}
        selectedTags={selectedTags}
        onToggleTag={handleToggleTag}
        onClearTags={handleClearTags}
        onDeleteTag={handleDeleteTag}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <NewDocumentCard />
        {filteredDocuments.map((doc) => (
          <DocumentCard key={doc.id} document={doc} />
        ))}
      </div>
    </div>
  )
}
