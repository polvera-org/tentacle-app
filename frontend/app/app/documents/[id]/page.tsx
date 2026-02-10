'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { fetchDocument, updateDocument } from '@/lib/documents/api'
import { useDebounce } from '@/hooks/use-debounce'
import { DocumentEditor } from '@/components/documents/document-editor'
import { InputSourceCards } from '@/components/documents/input-source-cards'
import type { Document } from '@/types/documents'
import type { JSONContent } from '@tiptap/react'

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [doc, setDoc] = useState<Document | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState<JSONContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const isInitialLoad = useRef(true)
  const titleHasBeenFocused = useRef(false)
  const lastSavedTitle = useRef('')
  const lastSavedBody = useRef('')

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchDocument(params.id)
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
  }, [params.id, router])

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
          <span className={`text-sm text-gray-400 transition-opacity ${isSaving ? 'opacity-100' : 'opacity-0'}`}>
            Saving...
          </span>
        </div>
      </header>

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
