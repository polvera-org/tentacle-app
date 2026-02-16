'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { suggestTagsWithOpenAI } from '@/lib/ai/auto-tagging'
import { extractPlainTextFromTiptapBody } from '@/lib/documents/text'
import { fetchCachedDocuments, fetchDocument, semanticSearchDocuments, updateDocument, deleteDocument } from '@/lib/documents/api'
import { useDebounce } from '@/hooks/use-debounce'
import { DocumentEditor } from '@/components/documents/document-editor'
import { InputSourceCards } from '@/components/documents/input-source-cards'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getOpenAIApiKey } from '@/lib/settings/openai-config'
import type { Document } from '@/types/documents'
import type { JSONContent, Editor } from '@tiptap/react'

const AUTO_TAGGING_MIN_TEXT_LENGTH = 40
const AUTO_TAGGING_SEARCH_LENGTH = 2000
const AUTO_TAGGING_NOTE_TEXT_LENGTH = 4000
const AUTO_TAGGING_NEIGHBOR_LIMIT = 12

function normalizeTags(tags: string[]): string[] {
  const uniqueTags = new Set<string>()

  for (const rawTag of tags) {
    const normalizedTag = rawTag
      .trim()
      .replace(/^#+/, '')
      .toLowerCase()
      .replace(/\s+/g, '_')

    if (!normalizedTag) continue
    uniqueTags.add(normalizedTag)
  }

  return Array.from(uniqueTags)
}

function areTagsEqual(first: string[], second: string[]): boolean {
  if (first.length !== second.length) return false
  return first.every((tag, index) => tag === second[index])
}

function serializeContent(content: JSONContent | null, fallback: string): string {
  if (!content) {
    return fallback
  }

  try {
    return JSON.stringify(content)
  } catch {
    return fallback
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildAutoTaggingText(title: string, serializedBody: string): string {
  const normalizedTitle = normalizeText(title)
  const plainBody = extractPlainTextFromTiptapBody(serializedBody)
  const normalizedBody = normalizeText(plainBody)

  return [normalizedTitle, normalizedBody]
    .filter((part) => part.length > 0)
    .join('\n')
}

function DocumentDetailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const documentId = searchParams.get('id')

  const [doc, setDoc] = useState<Document | null>(null)
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInputValue, setTagInputValue] = useState('')
  const [content, setContent] = useState<JSONContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAutoTagging, setIsAutoTagging] = useState(false)
  const [isTagsLocked, setIsTagsLocked] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isInitialLoad = useRef(true)
  const titleHasBeenFocused = useRef(false)
  const lastSavedTitle = useRef('')
  const lastSavedBody = useRef('')
  const lastSavedTags = useRef<string[]>([])
  const lastAutoTaggingFingerprint = useRef('')
  const autoTaggingRunId = useRef(0)
  const isTagsLockedRef = useRef(false)
  const activeDocumentId = useRef<string | null>(null)
  const tagsRef = useRef<string[]>([])
  const editorRef = useRef<Editor | null>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    tagsRef.current = tags
  }, [tags])

  useEffect(() => {
    isTagsLockedRef.current = isTagsLocked
  }, [isTagsLocked])

  useEffect(() => {
    activeDocumentId.current = doc?.id ?? null
  }, [doc?.id])

  useEffect(() => {
    if (!documentId) {
      router.push('/app')
      return
    }

    async function load() {
      try {
        const data = await fetchDocument(documentId!)
        const normalizedTags = normalizeTags(data.tags ?? [])

        setDoc({
          ...data,
          tags: normalizedTags,
        })
        setTitle(data.title)
        setTags(normalizedTags)
        lastSavedTitle.current = data.title
        lastSavedBody.current = data.body
        lastSavedTags.current = normalizedTags
        lastAutoTaggingFingerprint.current = `${data.id}::${normalizeText(data.title)}::${data.body}`
        setIsTagsLocked(data.tags_locked ?? false)
        isTagsLockedRef.current = data.tags_locked ?? false
        if (data.body) {
          try {
            setContent(JSON.parse(data.body))
          } catch {
            setContent(null)
          }
        }
      } catch {
        router.push('/app')
      } finally {
        setIsLoading(false)
        setTimeout(() => { isInitialLoad.current = false }, 100)
      }
    }
    load()
  }, [documentId, router])

  const debouncedTitle = useDebounce(title, 1000)
  const debouncedContent = useDebounce(content, 1000)

  // Auto-save title
  useEffect(() => {
    if (isInitialLoad.current || !doc) return
    if (debouncedTitle === lastSavedTitle.current) return

    setIsSaving(true)
    updateDocument(doc.id, { title: debouncedTitle })
      .then((updated) => {
        setDoc(updated)
        lastSavedTitle.current = debouncedTitle
      })
      .finally(() => setIsSaving(false))
  }, [debouncedTitle]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save content
  useEffect(() => {
    if (isInitialLoad.current || !doc || !debouncedContent) return

    const serialized = JSON.stringify(debouncedContent)
    if (serialized === lastSavedBody.current) return

    setIsSaving(true)
    updateDocument(doc.id, { body: serialized })
      .then((updated) => {
        setDoc(updated)
        lastSavedBody.current = serialized
      })
      .finally(() => setIsSaving(false))
  }, [debouncedContent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save tags
  useEffect(() => {
    if (isInitialLoad.current || !doc) return
    if (areTagsEqual(tags, lastSavedTags.current)) return

    setIsSaving(true)
    updateDocument(doc.id, { tags })
      .then((updated) => {
        const normalizedUpdatedTags = normalizeTags(updated.tags ?? tags)
        setDoc({ ...updated, tags: normalizedUpdatedTags })
        lastSavedTags.current = normalizedUpdatedTags
      })
      .finally(() => setIsSaving(false))
  }, [tags]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isInitialLoad.current || !doc) return
    if (isTagsLockedRef.current) return

    const serializedBody = serializeContent(debouncedContent, lastSavedBody.current)
    const autoTaggingText = buildAutoTaggingText(debouncedTitle, serializedBody)
    const fingerprint = `${doc.id}::${normalizeText(debouncedTitle)}::${serializedBody}`

    if (fingerprint === lastAutoTaggingFingerprint.current) return
    lastAutoTaggingFingerprint.current = fingerprint

    if (autoTaggingText.length < AUTO_TAGGING_MIN_TEXT_LENGTH) return

    const currentRunId = autoTaggingRunId.current + 1
    autoTaggingRunId.current = currentRunId
    const targetDocumentId = doc.id
    setIsAutoTagging(true)

    const runAutoTagging = async () => {
      const apiKey = await getOpenAIApiKey()
      if (!apiKey) {
        return
      }

      const semanticQuery = autoTaggingText.slice(0, AUTO_TAGGING_SEARCH_LENGTH)
      const [neighborHits, cachedDocuments] = await Promise.all([
        semanticSearchDocuments(semanticQuery, {
          limit: AUTO_TAGGING_NEIGHBOR_LIMIT,
          exclude_document_id: targetDocumentId,
        }),
        fetchCachedDocuments(),
      ])

      const cachedTagsById = new Map(cachedDocuments.map((cached) => [cached.id, cached.tags]))

      // Count tag frequency across all workspace docs
      const tagFrequency = new Map<string, number>()
      for (const doc of cachedDocuments) {
        for (const tag of normalizeTags(doc.tags)) {
          tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1)
        }
      }

      // Neighbor tags (context-relevant) get highest priority
      const neighborTagSet = new Set(
        normalizeTags(neighborHits.flatMap((n) => cachedTagsById.get(n.document_id) ?? [])),
      )

      // Sort: neighbor tags first (by frequency), then rest by frequency
      const candidateTags = [...tagFrequency.entries()]
        .sort(([aTag, aCount], [bTag, bCount]) => {
          const aIsNeighbor = neighborTagSet.has(aTag) ? 1 : 0
          const bIsNeighbor = neighborTagSet.has(bTag) ? 1 : 0
          if (bIsNeighbor !== aIsNeighbor) return bIsNeighbor - aIsNeighbor
          return bCount - aCount
        })
        .map(([tag]) => tag)

      const suggestedTags = await suggestTagsWithOpenAI({
        noteText: autoTaggingText.slice(0, AUTO_TAGGING_NOTE_TEXT_LENGTH),
        candidateTags,
        apiKey,
      })

      if (currentRunId !== autoTaggingRunId.current) {
        return
      }
      if (activeDocumentId.current !== targetDocumentId) {
        return
      }

      if (suggestedTags.length === 0) {
        return
      }

      const currentTags = tagsRef.current
      const mergedTags = normalizeTags([...currentTags, ...suggestedTags])
      if (areTagsEqual(mergedTags, currentTags)) {
        return
      }

      setIsSaving(true)
      try {
        const updated = await updateDocument(targetDocumentId, { tags: mergedTags })
        if (currentRunId !== autoTaggingRunId.current) {
          return
        }
        if (activeDocumentId.current !== targetDocumentId) {
          return
        }

        const normalizedUpdatedTags = normalizeTags(updated.tags ?? mergedTags)
        lastSavedTags.current = normalizedUpdatedTags
        tagsRef.current = normalizedUpdatedTags
        setTags(normalizedUpdatedTags)
        setDoc({ ...updated, tags: normalizedUpdatedTags })
      } finally {
        setIsSaving(false)
      }
    }

    void runAutoTagging()
      .catch((error) => {
        console.error(`[auto-tagging] Failed for document "${targetDocumentId}":`, error)
      })
      .finally(() => {
        if (currentRunId === autoTaggingRunId.current) {
          setIsAutoTagging(false)
        }
      })
  }, [debouncedTitle, debouncedContent, doc?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const addTag = useCallback((value: string) => {
    const normalized = normalizeTags([value])
    if (normalized.length === 0) return
    setTags((prev) => {
      const merged = [...new Set([...prev, ...normalized])]
      return merged
    })
    setTagInputValue('')
  }, [])

  const removeTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove))
  }, [])

  const handleTagKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInputValue)
    } else if (e.key === 'Backspace' && tagInputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }, [tagInputValue, tags, addTag, removeTag])

  const handleTagInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value.endsWith(',')) {
      addTag(value.slice(0, -1))
    } else {
      setTagInputValue(value)
    }
  }, [addTag])

  const handleContentChange = useCallback((newContent: JSONContent) => {
    setContent(newContent)
  }, [])

  const handleVoiceTranscription = useCallback((text: string) => {
    editorRef.current?.chain().focus().insertContent(text).run()
  }, [])

  const handleDelete = async () => {
    if (!doc) return
    setIsDeleting(true)
    try {
      await deleteDocument(doc.id)
      router.push('/app')
    } catch {
      setIsDeleting(false)
    }
  }

  const handleToggleTagsLock = useCallback(async () => {
    if (!doc) return
    const newLocked = !isTagsLocked
    setIsTagsLocked(newLocked)
    isTagsLockedRef.current = newLocked
    await updateDocument(doc.id, { tags_locked: newLocked })
  }, [doc, isTagsLocked])

  const isBodyEmpty = !content ||
    !content.content ||
    content.content.length === 0 ||
    (content.content.length === 1 &&
      content.content[0].type === 'paragraph' &&
      (!content.content[0].content || content.content[0].content.length === 0))

  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-white">
        <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center">
            <div className="h-10 w-20 bg-gray-100 rounded-full animate-pulse" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
            <div className="h-10 w-64 bg-gray-100 rounded-lg animate-pulse mb-6" />
            <div className="h-6 w-full bg-gray-100 rounded-lg animate-pulse mb-3" />
            <div className="h-6 w-3/4 bg-gray-100 rounded-lg animate-pulse mb-3" />
            <div className="h-6 w-1/2 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/app')}
            className="h-10 px-4 text-sm font-medium text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Back
            </span>
          </button>
          <div className="flex items-center gap-3">
            <span className={`text-sm text-gray-400 transition-opacity ${isAutoTagging ? 'opacity-100' : 'opacity-0'}`}>
              Tagging...
            </span>
            <span className={`text-sm text-gray-400 transition-opacity ${isSaving ? 'opacity-100' : 'opacity-0'}`}>
              Saving...
            </span>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="h-10 w-10 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              aria-label="Delete document"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete document?"
        description="This document will be moved to trash."
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        isLoading={isDeleting}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={(e) => {
            if (!titleHasBeenFocused.current) {
              titleHasBeenFocused.current = true
              e.target.select()
            }
          }}
          placeholder="Untitled"
          className={`w-full text-3xl font-bold placeholder-gray-300 border-none outline-none bg-transparent mb-4 ${
            title === 'Untitled' ? 'text-gray-400' : 'text-gray-900'
          }`}
        />
        <div className="mb-4">
          <div className="flex items-center gap-1.5">
            <div
              className="flex-1 min-h-[38px] px-2 py-1.5 flex flex-wrap gap-1.5 items-center border border-gray-200 rounded-lg bg-gray-50/60 focus-within:bg-white focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/20 cursor-text transition-all"
              onClick={() => tagInputRef.current?.focus()}
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 text-xs font-medium font-mono bg-violet-100 text-violet-800 rounded-md"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                    className="flex items-center justify-center w-3.5 h-3.5 rounded-sm text-violet-500 hover:text-violet-900 hover:bg-violet-200 transition-colors focus:outline-none"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                type="text"
                value={tagInputValue}
                onChange={handleTagInputChange}
                onKeyDown={handleTagKeyDown}
                placeholder={tags.length === 0 ? 'Add tag...' : ''}
                className="flex-1 min-w-[80px] text-xs text-gray-700 placeholder-gray-400 bg-transparent outline-none py-0.5"
              />
            </div>
            <button
              type="button"
              onClick={handleToggleTagsLock}
              title={isTagsLocked ? 'Tags locked. Click to enable auto-tagging' : 'Lock tags from auto-tagging'}
              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 rounded"
              aria-label={isTagsLocked ? 'Unlock tags' : 'Lock tags'}
            >
              {isTagsLocked ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 text-right mt-1">Press Enter or comma to add tag</p>
        </div>

        <DocumentEditor
          initialContent={content}
          onContentChange={handleContentChange}
          editorRef={editorRef}
          showVoiceCapture={!isBodyEmpty}
        />

        {isBodyEmpty && <InputSourceCards onVoiceTranscription={handleVoiceTranscription} />}
        </div>
      </main>
    </div>
  )
}

export default function DocumentDetailPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex flex-col bg-white">
        <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center">
            <div className="h-10 w-20 bg-gray-100 rounded-full animate-pulse" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
            <div className="h-10 w-64 bg-gray-100 rounded-lg animate-pulse mb-6" />
            <div className="h-6 w-full bg-gray-100 rounded-lg animate-pulse mb-3" />
            <div className="h-6 w-3/4 bg-gray-100 rounded-lg animate-pulse mb-3" />
            <div className="h-6 w-1/2 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        </main>
      </div>
    }>
      <DocumentDetailContent />
    </Suspense>
  )
}
