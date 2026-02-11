'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchDocument, updateDocument, deleteDocument } from '@/lib/documents/api'
import { useDebounce } from '@/hooks/use-debounce'
import { DocumentEditor } from '@/components/documents/document-editor'
import { InputSourceCards } from '@/components/documents/input-source-cards'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { Document } from '@/types/documents'
import type { JSONContent } from '@tiptap/react'

function DocumentDetailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const documentId = searchParams.get('id')

  const [doc, setDoc] = useState<Document | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState<JSONContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isInitialLoad = useRef(true)
  const titleHasBeenFocused = useRef(false)
  const lastSavedTitle = useRef('')
  const lastSavedBody = useRef('')

  useEffect(() => {
    if (!documentId) {
      router.push('/app')
      return
    }

    async function load() {
      try {
        const data = await fetchDocument(documentId!)
        setDoc(data)
        setTitle(data.title)
        lastSavedTitle.current = data.title
        lastSavedBody.current = data.body
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

  const handleContentChange = useCallback((newContent: JSONContent) => {
    setContent(newContent)
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

  const isBodyEmpty = !content ||
    !content.content ||
    content.content.length === 0 ||
    (content.content.length === 1 &&
      content.content[0].type === 'paragraph' &&
      (!content.content[0].content || content.content[0].content.length === 0))

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center">
            <div className="h-10 w-20 bg-gray-100 rounded-full animate-pulse" />
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="h-10 w-64 bg-gray-100 rounded-lg animate-pulse mb-6" />
          <div className="h-6 w-full bg-gray-100 rounded-lg animate-pulse mb-3" />
          <div className="h-6 w-3/4 bg-gray-100 rounded-lg animate-pulse mb-3" />
          <div className="h-6 w-1/2 bg-gray-100 rounded-lg animate-pulse" />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
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

        <DocumentEditor
          initialContent={content}
          onContentChange={handleContentChange}
        />

        {isBodyEmpty && <InputSourceCards />}
      </main>
    </div>
  )
}

export default function DocumentDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white">
        <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center">
            <div className="h-10 w-20 bg-gray-100 rounded-full animate-pulse" />
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="h-10 w-64 bg-gray-100 rounded-lg animate-pulse mb-6" />
          <div className="h-6 w-full bg-gray-100 rounded-lg animate-pulse mb-3" />
          <div className="h-6 w-3/4 bg-gray-100 rounded-lg animate-pulse mb-3" />
          <div className="h-6 w-1/2 bg-gray-100 rounded-lg animate-pulse" />
        </main>
      </div>
    }>
      <DocumentDetailContent />
    </Suspense>
  )
}
