'use client'

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  createDocument,
  createFolder,
  deleteDocument,
  deleteFolder,
  fetchCachedDocuments,
  fetchCachedDocumentTags,
  fetchDocumentFolders,
  moveDocumentToFolder,
  reindexDocuments,
  renameFolder,
  semanticSearchDocuments,
  deleteGlobalTag,
} from '@/lib/documents/api'
import { extractPlainTextFromTiptapBody } from '@/lib/documents/text'
import { ErrorToast } from '@/components/ui/error-toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DocumentCard } from './document-card'
import { DocumentTagFilters } from './document-tag-filters'
import { FolderBreadcrumbs } from './folder-breadcrumbs'
import { FolderCard } from './folder-card'
import { GridCreateMenu } from './grid-create-menu'
import { FolderFormDialog } from './folder-form-dialog'
import { MoveDocumentDialog } from './move-document-dialog'
import type { Document, DocumentFolder, DocumentListItem, DocumentTagUsage } from '@/types/documents'

interface DocumentGridProps {
  searchQuery: string
  initialFolderPath?: string
  onFolderPathChange?: (folderPath: string) => void
}

interface CreateMenuState {
  open: boolean
  x: number
  y: number
}

interface FolderDialogState {
  open: boolean
  mode: 'create' | 'rename'
  targetPath: string
  initialName: string
}

const LONG_PRESS_DURATION_MS = 550
const LONG_PRESS_MOVE_THRESHOLD = 12

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

function buildDocumentDetailUrl(documentId: string, folderPath: string): string {
  const query = new URLSearchParams({
    id: documentId,
  })

  const normalizedFolderPath = normalizeFolderPath(folderPath)
  if (normalizedFolderPath.length > 0) {
    query.set('folder', normalizedFolderPath)
  }

  return `/app/documents?${query.toString()}`
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

function mapDocumentToListItem(document: Document): DocumentListItem {
  return {
    id: document.id,
    title: document.title,
    body: document.body,
    folder_path: normalizeFolderPath(document.folder_path),
    tags: document.tags ?? [],
    tags_locked: document.tags_locked,
    created_at: document.created_at,
    updated_at: document.updated_at,
  }
}

function isPathWithinFolder(path: string, folderPath: string): boolean {
  const normalizedPath = normalizeFolderPath(path)
  const normalizedFolderPath = normalizeFolderPath(folderPath)

  if (!normalizedFolderPath) {
    return false
  }

  return normalizedPath === normalizedFolderPath || normalizedPath.startsWith(`${normalizedFolderPath}/`)
}

function getParentFolderPath(path: string): string {
  const normalizedPath = normalizeFolderPath(path)
  if (!normalizedPath) {
    return ''
  }

  const segments = normalizedPath.split('/')
  segments.pop()
  return segments.join('/')
}

function replaceFolderPathPrefix(path: string, sourcePrefix: string, targetPrefix: string): string {
  const normalizedPath = normalizeFolderPath(path)
  const normalizedSource = normalizeFolderPath(sourcePrefix)
  const normalizedTarget = normalizeFolderPath(targetPrefix)

  if (!normalizedSource) {
    return normalizedPath
  }

  if (normalizedPath === normalizedSource) {
    return normalizedTarget
  }

  if (!normalizedPath.startsWith(`${normalizedSource}/`)) {
    return normalizedPath
  }

  const suffix = normalizedPath.slice(normalizedSource.length + 1)
  if (!normalizedTarget) {
    return suffix
  }

  return `${normalizedTarget}/${suffix}`
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function isNonEmptyFolderError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('not empty') || normalized.includes('non-empty') || normalized.includes('nonempty')
}

export function DocumentGrid({
  searchQuery,
  initialFolderPath,
  onFolderPathChange,
}: DocumentGridProps) {
  const router = useRouter()

  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [documentFolders, setDocumentFolders] = useState<DocumentFolder[]>([])
  const [documentTags, setDocumentTags] = useState<DocumentTagUsage[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [currentFolderPath, setCurrentFolderPath] = useState(() => normalizeFolderPath(initialFolderPath))
  const [searchRankedDocuments, setSearchRankedDocuments] = useState<DocumentListItem[] | null>(null)
  const [isInitialCacheLoading, setIsInitialCacheLoading] = useState(true)
  const [isSynchronizing, setIsSynchronizing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [createMenuState, setCreateMenuState] = useState<CreateMenuState>({
    open: false,
    x: 0,
    y: 0,
  })
  const [folderDialogState, setFolderDialogState] = useState<FolderDialogState>({
    open: false,
    mode: 'create',
    targetPath: '',
    initialName: '',
  })
  const [folderDialogError, setFolderDialogError] = useState<string | null>(null)
  const [isFolderDialogLoading, setIsFolderDialogLoading] = useState(false)

  const [documentToMove, setDocumentToMove] = useState<DocumentListItem | null>(null)
  const [moveDialogError, setMoveDialogError] = useState<string | null>(null)
  const [isMoveDialogLoading, setIsMoveDialogLoading] = useState(false)

  const [documentToDelete, setDocumentToDelete] = useState<DocumentListItem | null>(null)
  const [isDocumentDeleteLoading, setIsDocumentDeleteLoading] = useState(false)

  const [folderToDelete, setFolderToDelete] = useState<DocumentFolder | null>(null)
  const [folderDeleteError, setFolderDeleteError] = useState<string | null>(null)
  const [isFolderDeleteLoading, setIsFolderDeleteLoading] = useState(false)
  const [isRecursiveFolderDelete, setIsRecursiveFolderDelete] = useState(false)

  const newButtonRef = useRef<HTMLButtonElement>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressOriginRef = useRef<{ x: number, y: number } | null>(null)
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

  const refreshFoldersState = useCallback(async () => {
    const cachedFolders = await fetchDocumentFolders()
    setDocumentFolders(cachedFolders)
  }, [])

  const refreshTagsState = useCallback(async () => {
    const cachedTags = await fetchCachedDocumentTags()
    applyDocumentTags(cachedTags)
  }, [applyDocumentTags])

  const refreshDocumentsAndFoldersState = useCallback(async () => {
    const [cachedDocuments, cachedFolders] = await Promise.all([
      fetchCachedDocuments(),
      fetchDocumentFolders(),
    ])

    setDocuments(cachedDocuments)
    setDocumentFolders(cachedFolders)
  }, [])

  const refreshAllState = useCallback(async () => {
    const [cachedDocuments, cachedTags, cachedFolders] = await Promise.all([
      fetchCachedDocuments(),
      fetchCachedDocumentTags(),
      fetchDocumentFolders(),
    ])

    setDocuments(cachedDocuments)
    setDocumentFolders(cachedFolders)
    applyDocumentTags(cachedTags)
  }, [applyDocumentTags])

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearLongPressTimer()
    }
  }, [clearLongPressTimer])

  const openCreateMenu = useCallback((x: number, y: number) => {
    setCreateMenuState({
      open: true,
      x,
      y,
    })
  }, [])

  const closeCreateMenu = useCallback(() => {
    setCreateMenuState((currentState) => {
      if (!currentState.open) {
        return currentState
      }

      return {
        ...currentState,
        open: false,
      }
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

  const handleOpenDocument = useCallback((documentId: string, folderPath: string) => {
    router.push(buildDocumentDetailUrl(documentId, folderPath))
  }, [router])

  const visibleDocuments = useMemo(() => {
    return documents.filter((document) => normalizeFolderPath(document.folder_path) === currentFolderPath)
  }, [currentFolderPath, documents])

  const subtreeDocuments = useMemo(() => {
    if (currentFolderPath.length === 0) {
      return documents
    }

    return documents.filter((document) => isPathWithinFolder(document.folder_path, currentFolderPath))
  }, [currentFolderPath, documents])

  const subtreeTagSet = useMemo(() => {
    const nextTagSet = new Set<string>()
    for (const document of subtreeDocuments) {
      for (const tag of document.tags) {
        nextTagSet.add(tag)
      }
    }

    return nextTagSet
  }, [subtreeDocuments])

  const visibleDocumentTags = useMemo(() => {
    return documentTags.filter(({ tag }) => subtreeTagSet.has(tag))
  }, [documentTags, subtreeTagSet])

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
    await refreshAllState()
  }, [refreshAllState])

  const handleCreateNote = useCallback(async () => {
    closeCreateMenu()

    try {
      const createdDocument = await createDocument({
        folder_path: currentFolderPath,
      })

      setDocuments((currentDocuments) => [
        mapDocumentToListItem(createdDocument),
        ...currentDocuments,
      ])

      void refreshFoldersState().catch((error) => {
        console.error('[DocumentGrid] Failed to refresh folders after note creation.', error)
      })

      router.push(buildDocumentDetailUrl(createdDocument.id, createdDocument.folder_path))
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, 'Failed to create note. Please try again.'))
    }
  }, [closeCreateMenu, currentFolderPath, refreshFoldersState, router])

  const handleCreateFolderFromMenu = useCallback(() => {
    closeCreateMenu()
    setFolderDialogError(null)
    setFolderDialogState({
      open: true,
      mode: 'create',
      targetPath: currentFolderPath,
      initialName: '',
    })
  }, [closeCreateMenu, currentFolderPath])

  const handleRenameFolderRequest = useCallback((folder: DocumentFolder) => {
    setFolderDialogError(null)
    setFolderDialogState({
      open: true,
      mode: 'rename',
      targetPath: folder.path,
      initialName: folder.name,
    })
  }, [])

  const handleCloseFolderDialog = useCallback(() => {
    if (isFolderDialogLoading) {
      return
    }

    setFolderDialogError(null)
    setFolderDialogState((currentState) => ({
      ...currentState,
      open: false,
    }))
  }, [isFolderDialogLoading])

  const handleSubmitFolderDialog = useCallback(async (name: string) => {
    if (isFolderDialogLoading) {
      return
    }

    setIsFolderDialogLoading(true)
    setFolderDialogError(null)

    try {
      if (folderDialogState.mode === 'create') {
        const newFolderPath = normalizeFolderPath(
          folderDialogState.targetPath
            ? `${folderDialogState.targetPath}/${name}`
            : name,
        )

        await createFolder(newFolderPath)
        setFolderDialogState((currentState) => ({
          ...currentState,
          open: false,
        }))
        await refreshFoldersState()
      } else {
        const sourcePath = normalizeFolderPath(folderDialogState.targetPath)
        const parentPath = getParentFolderPath(sourcePath)
        const renamedPath = normalizeFolderPath(parentPath ? `${parentPath}/${name}` : name)

        await renameFolder(sourcePath, name)

        setCurrentFolderPath((existingPath) => {
          return replaceFolderPathPrefix(existingPath, sourcePath, renamedPath)
        })

        setFolderDialogState((currentState) => ({
          ...currentState,
          open: false,
        }))

        await refreshDocumentsAndFoldersState()
      }
    } catch (error) {
      setFolderDialogError(extractErrorMessage(error, 'Failed to update folder. Please try again.'))
    } finally {
      setIsFolderDialogLoading(false)
    }
  }, [folderDialogState, isFolderDialogLoading, refreshDocumentsAndFoldersState, refreshFoldersState])

  const handleDeleteFolderRequest = useCallback((folder: DocumentFolder) => {
    setFolderDeleteError(null)
    setIsRecursiveFolderDelete(false)
    setFolderToDelete(folder)
  }, [])

  const handleCancelFolderDelete = useCallback(() => {
    if (isFolderDeleteLoading) {
      return
    }

    setFolderDeleteError(null)
    setIsRecursiveFolderDelete(false)
    setFolderToDelete(null)
  }, [isFolderDeleteLoading])

  const handleConfirmFolderDelete = useCallback(async () => {
    if (!folderToDelete || isFolderDeleteLoading) {
      return
    }

    setIsFolderDeleteLoading(true)
    setFolderDeleteError(null)

    try {
      await deleteFolder(folderToDelete.path, isRecursiveFolderDelete ? { recursive: true } : undefined)

      const deletedPath = folderToDelete.path
      setCurrentFolderPath((existingPath) => {
        if (isPathWithinFolder(existingPath, deletedPath)) {
          return getParentFolderPath(deletedPath)
        }

        return existingPath
      })

      setIsRecursiveFolderDelete(false)
      setFolderToDelete(null)
      await refreshAllState()
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to delete folder. Please try again.')

      if (!isRecursiveFolderDelete && isNonEmptyFolderError(message)) {
        setIsRecursiveFolderDelete(true)
        setFolderDeleteError('This folder is not empty. Delete it and all of its notes and subfolders?')
        return
      }

      setFolderDeleteError(message)
    } finally {
      setIsFolderDeleteLoading(false)
    }
  }, [folderToDelete, isFolderDeleteLoading, isRecursiveFolderDelete, refreshAllState])

  const handleMoveDocumentRequest = useCallback((document: DocumentListItem) => {
    setMoveDialogError(null)
    setDocumentToMove(document)
  }, [])

  const handleMoveDocumentCancel = useCallback(() => {
    if (isMoveDialogLoading) {
      return
    }

    setMoveDialogError(null)
    setDocumentToMove(null)
  }, [isMoveDialogLoading])

  const handleMoveDocumentConfirm = useCallback(async (targetFolderPath: string) => {
    if (!documentToMove || isMoveDialogLoading) {
      return
    }

    setIsMoveDialogLoading(true)
    setMoveDialogError(null)

    try {
      await moveDocumentToFolder(documentToMove.id, targetFolderPath)
      setDocumentToMove(null)
      await refreshDocumentsAndFoldersState()
    } catch (error) {
      setMoveDialogError(extractErrorMessage(error, 'Failed to move note. Please try again.'))
    } finally {
      setIsMoveDialogLoading(false)
    }
  }, [documentToMove, isMoveDialogLoading, refreshDocumentsAndFoldersState])

  const handleDeleteDocumentRequest = useCallback((document: DocumentListItem) => {
    setDocumentToDelete(document)
  }, [])

  const handleDeleteDocumentCancel = useCallback(() => {
    if (isDocumentDeleteLoading) {
      return
    }

    setDocumentToDelete(null)
  }, [isDocumentDeleteLoading])

  const handleDeleteDocumentConfirm = useCallback(async () => {
    if (!documentToDelete || isDocumentDeleteLoading) {
      return
    }

    setIsDocumentDeleteLoading(true)

    try {
      await deleteDocument(documentToDelete.id)

      setDocuments((currentDocuments) => {
        return currentDocuments.filter((document) => document.id !== documentToDelete.id)
      })

      setDocumentToDelete(null)

      await Promise.all([
        refreshFoldersState(),
        refreshTagsState(),
      ])
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, 'Failed to delete note. Please try again.'))
    } finally {
      setIsDocumentDeleteLoading(false)
    }
  }, [documentToDelete, isDocumentDeleteLoading, refreshFoldersState, refreshTagsState])

  const handleOpenCreateMenuFromButton = useCallback(() => {
    const buttonBounds = newButtonRef.current?.getBoundingClientRect()

    if (!buttonBounds) {
      openCreateMenu(16, 80)
      return
    }

    openCreateMenu(buttonBounds.left, buttonBounds.bottom + 8)
  }, [openCreateMenu])

  const handleGridContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    if (target.closest('[data-grid-item="true"]')) {
      return
    }

    event.preventDefault()
    openCreateMenu(event.clientX, event.clientY)
  }, [openCreateMenu])

  const handleGridTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    if (target.closest('[data-grid-item="true"]')) {
      return
    }

    if (event.touches.length === 0) {
      return
    }

    const touch = event.touches[0]
    const startX = touch.clientX
    const startY = touch.clientY

    longPressOriginRef.current = { x: startX, y: startY }
    clearLongPressTimer()

    longPressTimerRef.current = window.setTimeout(() => {
      openCreateMenu(startX, startY)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(10)
      }
    }, LONG_PRESS_DURATION_MS)
  }, [clearLongPressTimer, openCreateMenu])

  const handleGridTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const origin = longPressOriginRef.current
    if (!origin || event.touches.length === 0) {
      return
    }

    const touch = event.touches[0]
    const deltaX = Math.abs(touch.clientX - origin.x)
    const deltaY = Math.abs(touch.clientY - origin.y)

    if (deltaX > LONG_PRESS_MOVE_THRESHOLD || deltaY > LONG_PRESS_MOVE_THRESHOLD) {
      clearLongPressTimer()
      longPressOriginRef.current = null
    }
  }, [clearLongPressTimer])

  const handleGridTouchEnd = useCallback(() => {
    clearLongPressTimer()
    longPressOriginRef.current = null
  }, [clearLongPressTimer])

  useEffect(() => {
    void loadDocuments()
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
        const hits = await semanticSearchDocuments(normalizedSearchQuery, {
          limit: Math.max(20, subtreeDocuments.length),
        })
        if (currentRequestId !== searchRequestIdRef.current) {
          return
        }

        const documentLookup = new Map(subtreeDocuments.map((document) => [document.id, document]))
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

        setSearchRankedDocuments(fallbackSearchDocuments(normalizedSearchQuery, subtreeDocuments))
      }
    })()
  }, [normalizedSearchQuery, subtreeDocuments])

  useEffect(() => {
    setSelectedTags((currentSelectedTags) => {
      const nextSelectedTags = currentSelectedTags.filter((tag) => subtreeTagSet.has(tag))
      return nextSelectedTags.length === currentSelectedTags.length ? currentSelectedTags : nextSelectedTags
    })
  }, [subtreeTagSet])

  useEffect(() => {
    const handleDocumentsFolderChanged = () => {
      void refreshAllState().catch((error) => {
        console.error('[DocumentGrid] Failed to refresh after folder change event.', error)
      })
    }

    window.addEventListener('documents-folder-changed', handleDocumentsFolderChanged)
    return () => window.removeEventListener('documents-folder-changed', handleDocumentsFolderChanged)
  }, [refreshAllState])

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

  const folderDialogParentPath = folderDialogState.mode === 'create'
    ? folderDialogState.targetPath
    : getParentFolderPath(folderDialogState.targetPath)
  const folderDeleteDescription = folderToDelete
    ? isRecursiveFolderDelete
      ? `Delete folder "${folderToDelete.name}" and all of its notes/subfolders? This cannot be undone.`
      : `Delete folder "${folderToDelete.name}"?`
    : ''

  return (
    <div className="space-y-3">
      {isSynchronizing ? (
        <p className="text-sm text-gray-500" role="status" aria-live="polite">
          Synchronizing...
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FolderBreadcrumbs
            currentFolderPath={currentFolderPath}
            onNavigate={handleOpenFolder}
          />
        </div>
        <button
          ref={newButtonRef}
          type="button"
          onClick={handleOpenCreateMenuFromButton}
          className="inline-flex h-11 items-center rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
          New
        </button>
      </div>

      <DocumentTagFilters
        tags={visibleDocumentTags}
        selectedTags={selectedTags}
        onToggleTag={handleToggleTag}
        onClearTags={handleClearTags}
        onDeleteTag={handleDeleteTag}
      />

      <div
        className="space-y-4"
        onContextMenu={handleGridContextMenu}
        onTouchStart={handleGridTouchStart}
        onTouchMove={handleGridTouchMove}
        onTouchEnd={handleGridTouchEnd}
        onTouchCancel={handleGridTouchEnd}
      >
        {visibleChildFolders.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {visibleChildFolders.map((folder) => (
              <FolderCard
                key={folder.path || 'root'}
                folder={folder}
                onOpen={handleOpenFolder}
                onRename={handleRenameFolderRequest}
                onDelete={handleDeleteFolderRequest}
              />
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {filteredDocuments.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onOpen={handleOpenDocument}
              onMove={handleMoveDocumentRequest}
              onDelete={handleDeleteDocumentRequest}
            />
          ))}
        </div>

        {visibleChildFolders.length === 0 && filteredDocuments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
            Empty folder. Right-click or long-press to create a note or folder.
          </p>
        ) : null}
      </div>

      <GridCreateMenu
        open={createMenuState.open}
        x={createMenuState.x}
        y={createMenuState.y}
        onCreateNote={() => {
          void handleCreateNote()
        }}
        onCreateFolder={handleCreateFolderFromMenu}
        onClose={closeCreateMenu}
      />

      <FolderFormDialog
        key={`${folderDialogState.open ? 'open' : 'closed'}:${folderDialogState.mode}:${folderDialogState.targetPath}`}
        open={folderDialogState.open}
        mode={folderDialogState.mode}
        initialValue={folderDialogState.initialName}
        parentPath={folderDialogParentPath}
        isLoading={isFolderDialogLoading}
        errorMessage={folderDialogError}
        onSubmit={(name) => {
          void handleSubmitFolderDialog(name)
        }}
        onCancel={handleCloseFolderDialog}
      />

      <MoveDocumentDialog
        key={documentToMove ? `${documentToMove.id}:${documentToMove.folder_path}` : 'move-none'}
        open={documentToMove !== null}
        documentTitle={documentToMove?.title ?? ''}
        currentFolderPath={documentToMove?.folder_path ?? ''}
        folders={documentFolders}
        isLoading={isMoveDialogLoading}
        errorMessage={moveDialogError}
        onMove={(targetFolderPath) => {
          void handleMoveDocumentConfirm(targetFolderPath)
        }}
        onCancel={handleMoveDocumentCancel}
      />

      <ConfirmDialog
        open={documentToDelete !== null}
        title="Delete note"
        description={documentToDelete ? `Delete "${documentToDelete.title || 'Untitled'}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={() => {
          void handleDeleteDocumentConfirm()
        }}
        onCancel={handleDeleteDocumentCancel}
        isLoading={isDocumentDeleteLoading}
      />

      <ConfirmDialog
        open={folderToDelete !== null}
        title={isRecursiveFolderDelete ? 'Delete folder and contents' : 'Delete folder'}
        description={folderDeleteError ?? folderDeleteDescription}
        confirmLabel={isRecursiveFolderDelete ? 'Delete all' : 'Delete'}
        onConfirm={() => {
          void handleConfirmFolderDelete()
        }}
        onCancel={handleCancelFolderDelete}
        isLoading={isFolderDeleteLoading}
      />

      {errorMessage ? <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} /> : null}
    </div>
  )
}
