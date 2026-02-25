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
  const MAX_VISIBLE_TAG_PILLS = 3
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const tagOverflowRef = useRef<HTMLDivElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isTagOverflowOpen, setIsTagOverflowOpen] = useState(false)
  const bodyPreview = extractPreviewText(doc.body, 120)
  const isOverlayOpen = isMenuOpen || isTagOverflowOpen
  const hasHiddenTags = doc.tags.length > MAX_VISIBLE_TAG_PILLS
  const visibleTags = hasHiddenTags
    ? doc.tags.slice(0, MAX_VISIBLE_TAG_PILLS - 1)
    : doc.tags.slice(0, MAX_VISIBLE_TAG_PILLS)
  const hiddenTags = hasHiddenTags ? doc.tags.slice(MAX_VISIBLE_TAG_PILLS - 1) : []

  useEffect(() => {
    if (!isMenuOpen && !isTagOverflowOpen) {
      return
    }

    const handleDocumentPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (
        menuContainerRef.current?.contains(target) ||
        tagOverflowRef.current?.contains(target)
      ) {
        return
      }

      setIsMenuOpen(false)
      setIsTagOverflowOpen(false)
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
        setIsTagOverflowOpen(false)
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
  }, [isMenuOpen, isTagOverflowOpen])

  return (
    <article
      data-grid-item="true"
      className={`relative rounded-2xl border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-md ${
        isOverlayOpen ? 'z-40' : 'z-0'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(doc.id, doc.folder_path)}
        className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      >
        <span className="sr-only">Open note {doc.title || 'Untitled'}</span>
      </button>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-9 w-9 rounded-tr-2xl border-b border-l border-gray-200 bg-gray-50 [clip-path:polygon(100%_0,0_0,100%_100%)]"
      />

      <div className="pointer-events-none relative z-10 flex h-56 flex-col p-4 pr-16">
        <h3 className="line-clamp-2 text-base font-bold leading-6 text-gray-900">
          {doc.title || 'Untitled'}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">
          {bodyPreview || 'Empty document'}
        </p>
        {visibleTags.length > 0 && (
          <div ref={tagOverflowRef} className="pointer-events-auto relative mt-auto flex flex-wrap gap-2 pt-3">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex max-w-full items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 break-words"
              >
                #{tag}
              </span>
            ))}
            {hiddenTags.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setIsMenuOpen(false)
                    setIsTagOverflowOpen((current) => !current)
                  }}
                  aria-haspopup="menu"
                  aria-expanded={isTagOverflowOpen}
                  aria-label={`Show ${hiddenTags.length} more tags`}
                  className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                >
                  ...
                </button>
                {isTagOverflowOpen ? (
                  <div
                    role="menu"
                    aria-label="More tags"
                    className="absolute left-0 top-[calc(100%+0.35rem)] z-30 w-max max-w-[12rem] rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {hiddenTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex max-w-full items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 break-words"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div ref={menuContainerRef} className="absolute right-3 top-3 z-20">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setIsTagOverflowOpen(false)
            setIsMenuOpen((current) => !current)
          }}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label={`Note actions for ${doc.title || 'Untitled'}`}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-500 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
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
