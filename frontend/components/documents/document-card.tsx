'use client'

import { useEffect, useRef, useState } from 'react'
import type { DocumentListItem } from '@/types/documents'

interface DocumentCardProps {
  document: DocumentListItem
  onOpen: (documentId: string, folderPath: string) => void
  onMove: (document: DocumentListItem) => void
  onDelete: (document: DocumentListItem) => void
}

interface TiptapNode {
  text?: string
  content?: TiptapNode[]
}

function extractPreviewText(body: string, maxLength: number): string {
  if (!body) return ''
  try {
    const json: TiptapNode = JSON.parse(body)
    const texts: string[] = []
    function walk(node: TiptapNode) {
      if (node.text) texts.push(node.text)
      if (node.content) node.content.forEach(walk)
    }
    walk(json)
    const full = texts.join(' ')
    return full.length > maxLength ? full.slice(0, maxLength) + '...' : full
  } catch {
    return body.length > maxLength ? body.slice(0, maxLength) + '...' : body
  }
}

export function DocumentCard({ document: doc, onOpen, onMove, onDelete }: DocumentCardProps) {
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const bodyPreview = extractPreviewText(doc.body, 120)
  const visibleTags = doc.tags.slice(0, 3)

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    const handleDocumentPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (menuContainerRef.current?.contains(target)) {
        return
      }

      setIsMenuOpen(false)
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    globalThis.document.addEventListener('mousedown', handleDocumentPointer)
    globalThis.document.addEventListener('touchstart', handleDocumentPointer)
    globalThis.document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      globalThis.document.removeEventListener('mousedown', handleDocumentPointer)
      globalThis.document.removeEventListener('touchstart', handleDocumentPointer)
      globalThis.document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [isMenuOpen])

  return (
    <article
      data-grid-item="true"
      className="relative h-48 overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-md"
    >
      <button
        type="button"
        onClick={() => onOpen(doc.id, doc.folder_path)}
        className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      >
        <span className="sr-only">Open note {doc.title || 'Untitled'}</span>
      </button>

      <div className="pointer-events-none border-b border-gray-100 bg-gray-50/70 px-4 py-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.7}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </span>
      </div>

      <div className="pointer-events-none relative z-10 p-4">
        <h3 className="truncate text-sm font-semibold leading-5 text-gray-900">
          {doc.title || 'Untitled'}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-gray-500">
          {bodyPreview || 'Empty document'}
        </p>
        {visibleTags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div ref={menuContainerRef} className="absolute right-3 top-3 z-20">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setIsMenuOpen((current) => !current)
          }}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label={`Note actions for ${doc.title || 'Untitled'}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-500 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
          </svg>
        </button>

        {isMenuOpen ? (
          <div
            role="menu"
            aria-label={`Actions for ${doc.title || 'Untitled'}`}
            className="absolute right-0 top-[calc(100%+0.3rem)] z-30 w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false)
                onOpen(doc.id, doc.folder_path)
              }}
              className="flex h-9 w-full items-center rounded-lg px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              Open
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false)
                onMove(doc)
              }}
              className="flex h-9 w-full items-center rounded-lg px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              Move to folder...
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false)
                onDelete(doc)
              }}
              className="flex h-9 w-full items-center rounded-lg px-3 text-sm text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}
