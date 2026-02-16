'use client'

import { useEffect, useRef, useState } from 'react'
import type { DocumentFolder } from '@/types/documents'

interface FolderCardProps {
  folder: DocumentFolder
  onOpen: (folderPath: string) => void
  onRename: (folder: DocumentFolder) => void
  onDelete: (folder: DocumentFolder) => void
}

function formatFolderMeta(folder: DocumentFolder): string {
  const documentLabel = folder.document_count === 1 ? 'doc' : 'docs'
  const subfolderLabel = folder.subfolder_count === 1 ? 'folder' : 'folders'
  return `${folder.document_count} ${documentLabel} · ${folder.subfolder_count} ${subfolderLabel}`
}

export function FolderCard({ folder, onOpen, onRename, onDelete }: FolderCardProps) {
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

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

    document.addEventListener('mousedown', handleDocumentPointer)
    document.addEventListener('touchstart', handleDocumentPointer)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentPointer)
      document.removeEventListener('touchstart', handleDocumentPointer)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [isMenuOpen])

  return (
    <article
      data-grid-item="true"
      className="relative h-32 rounded-2xl border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-sm"
    >
      <button
        type="button"
        onClick={() => onOpen(folder.path)}
        className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      >
        <span className="sr-only">Open folder {folder.name}</span>
      </button>

      <div className="pointer-events-none relative z-10 flex h-full items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{folder.name}</p>
          <p className="mt-1 text-xs text-gray-500">{formatFolderMeta(folder)}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M3.75 7.5A2.25 2.25 0 0 1 6 5.25h4.044a2.25 2.25 0 0 1 1.591.659l1.06 1.06a2.25 2.25 0 0 0 1.591.659H18A2.25 2.25 0 0 1 20.25 9.9v7.35A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25V7.5Z" />
          </svg>
        </span>
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
          aria-label={`Folder actions for ${folder.name}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
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
            aria-label={`Actions for ${folder.name}`}
            className="absolute right-0 top-[calc(100%+0.3rem)] z-30 w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false)
                onOpen(folder.path)
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
                onRename(folder)
              }}
              className="flex h-9 w-full items-center rounded-lg px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false)
                onDelete(folder)
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
