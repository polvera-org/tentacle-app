'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentTagUsage } from '@/types/documents'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface DocumentTagFiltersProps {
  tags: DocumentTagUsage[]
  selectedTags: string[]
  onToggleTag: (tag: string) => void
  onClearTags: () => void
  onDeleteTag?: (tag: string) => Promise<void>
}

const RECENT_TAG_LIMIT = 5

export function DocumentTagFilters({
  tags,
  selectedTags,
  onToggleTag,
  onClearTags,
  onDeleteTag,
}: DocumentTagFiltersProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [tagToDelete, setTagToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const selectedTagSet = useMemo(() => new Set(selectedTags), [selectedTags])
  const recentTags = useMemo(() => tags.slice(0, RECENT_TAG_LIMIT), [tags])

  const filteredTags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return tags

    return tags.filter((tagUsage) => tagUsage.tag.toLowerCase().includes(normalizedQuery))
  }, [query, tags])

  useEffect(() => {
    if (!isMoreOpen) return

    const handleDocumentPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (containerRef.current?.contains(target)) return

      setIsMoreOpen(false)
      setQuery('')
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      setIsMoreOpen(false)
      setQuery('')
    }

    document.addEventListener('mousedown', handleDocumentPointer)
    document.addEventListener('touchstart', handleDocumentPointer)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentPointer)
      document.removeEventListener('touchstart', handleDocumentPointer)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [isMoreOpen])

  useEffect(() => {
    if (!isMoreOpen) return
    searchInputRef.current?.focus()
  }, [isMoreOpen])

  const clearAndClose = () => {
    onClearTags()
    setIsMoreOpen(false)
    setQuery('')
  }

  const toggleMore = () => {
    setIsMoreOpen((current) => {
      const next = !current
      if (!next) setQuery('')
      return next
    })
  }

  const handleConfirmDelete = async () => {
    if (!tagToDelete || !onDeleteTag) return
    setIsDeleting(true)
    try {
      await onDeleteTag(tagToDelete)
    } finally {
      setIsDeleting(false)
      setTagToDelete(null)
    }
  }

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onClearTags}
        className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      >
        {selectedTags.length > 0 ? 'Clear' : 'All'}
      </button>

      {recentTags.map((tagUsage) => {
        const isSelected = selectedTagSet.has(tagUsage.tag)

        return (
          <button
            key={tagUsage.tag}
            type="button"
            onClick={() => onToggleTag(tagUsage.tag)}
            className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
              isSelected
                ? 'border-gray-300 bg-gray-200 text-gray-900'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800'
            }`}
          >
            #{tagUsage.tag}
          </button>
        )
      })}

      <div className="relative z-40">
        <button
          type="button"
          onClick={toggleMore}
          aria-haspopup="dialog"
          aria-expanded={isMoreOpen}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
            isMoreOpen
              ? 'border-gray-300 bg-gray-100 text-gray-900'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800'
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          more tags
        </button>

        {isMoreOpen ? (
          <div
            role="dialog"
            aria-label="More tags"
            className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-2"
          >
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tags"
                className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
              />
              <button
                type="button"
                onClick={clearAndClose}
                className="h-9 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
              >
                {selectedTags.length > 0 ? 'Clear' : 'All'}
              </button>
            </div>

            <div className="mt-2 max-h-56 overflow-y-auto pr-1">
              {filteredTags.length > 0 ? (
                filteredTags.map((tagUsage) => {
                  const isSelected = selectedTagSet.has(tagUsage.tag)

                  return (
                    <div
                      key={tagUsage.tag}
                      className={`group flex w-full items-center rounded-lg transition-colors ${
                        isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleTag(tagUsage.tag)}
                        className={`flex flex-1 items-center gap-2 px-2.5 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
                          isSelected ? 'text-gray-900' : 'text-gray-600 group-hover:text-gray-900'
                        }`}
                      >
                        <span className="truncate">#{tagUsage.tag}</span>
                        <span className="text-[11px] text-gray-400">{tagUsage.usage_count}</span>
                      </button>
                      {onDeleteTag ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTagToDelete(tagUsage.tag)
                          }}
                          title={`Delete #${tagUsage.tag}`}
                          className="mr-1 flex-shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gray-300"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  )
                })
              ) : (
                <p className="px-2.5 py-3 text-xs text-gray-500">No matching tags.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={tagToDelete !== null}
        title="Delete tag"
        description={tagToDelete ? `Delete #${tagToDelete} from all documents? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setTagToDelete(null)}
        isLoading={isDeleting}
      />
    </div>
  )
}
