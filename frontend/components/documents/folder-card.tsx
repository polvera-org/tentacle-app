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
      className="group relative h-22 rounded-2xl border border-brand-300/50 bg-gradient-to-tr from-brand-50/60 to-white/40 transition-all hover:border-brand-300/70 hover:from-brand-50/80 hover:to-white/60 hover:shadow-md"
    >
      <button
        type="button"
        onClick={() => onOpen(folder.path)}
        className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/30"
      >
        <span className="sr-only">Open folder {folder.name}</span>
      </button>

      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-end px-5 pb-5 pr-14">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5 text-gray-900 transition-colors group-hover:text-brand-700">{folder.name}</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{formatFolderMeta(folder)}</p>
        </div>
      </div>

      <div ref={menuContainerRef} className={`absolute right-3 top-3 ${isMenuOpen ? 'z-50' : 'z-20'}`}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setIsMenuOpen((current) => !current)
          }}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label={`Folder actions for ${folder.name}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-200 bg-white/90 text-brand-400 shadow-sm transition-colors hover:border-brand-300 hover:text-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
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
            className="absolute right-0 top-[calc(100%+0.3rem)] z-50 w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
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
