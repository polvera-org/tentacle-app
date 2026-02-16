'use client'

import type { DocumentFolder } from '@/types/documents'

interface FolderCardProps {
  folder: DocumentFolder
  onOpen: (folderPath: string) => void
}

function formatFolderMeta(folder: DocumentFolder): string {
  const documentLabel = folder.document_count === 1 ? 'doc' : 'docs'
  const subfolderLabel = folder.subfolder_count === 1 ? 'folder' : 'folders'
  return `${folder.document_count} ${documentLabel} · ${folder.subfolder_count} ${subfolderLabel}`
}

export function FolderCard({ folder, onOpen }: FolderCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(folder.path)}
      className="h-32 w-full rounded-2xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-gray-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
    >
      <div className="flex h-full items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{folder.name}</p>
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
    </button>
  )
}
