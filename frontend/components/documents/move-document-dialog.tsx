'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DocumentFolder } from '@/types/documents'

interface MoveDocumentDialogProps {
  open: boolean
  documentTitle: string
  currentFolderPath: string
  folders: DocumentFolder[]
  isLoading?: boolean
  errorMessage?: string | null
  onMove: (targetFolderPath: string) => void
  onCancel: () => void
}

interface FolderOption {
  path: string
  label: string
}

function toFolderOption(path: string, name: string): FolderOption {
  return {
    path,
    label: path.length > 0 ? path : name,
  }
}

export function MoveDocumentDialog({
  open,
  documentTitle,
  currentFolderPath,
  folders,
  isLoading = false,
  errorMessage = null,
  onMove,
  onCancel,
}: MoveDocumentDialogProps) {
  const options = useMemo<FolderOption[]>(() => {
    return [
      toFolderOption('', 'All Documents'),
      ...folders.map((folder) => toFolderOption(folder.path, folder.name)),
    ]
  }, [folders])
  const [selectedFolderPath, setSelectedFolderPath] = useState(() => currentFolderPath)

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) {
    return null
  }

  const isUnchanged = selectedFolderPath === currentFolderPath

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">Move note</h2>
        <p className="mt-2 text-sm text-gray-500">
          Choose a destination folder for &quot;{documentTitle || 'Untitled'}&quot;.
        </p>

        <div
          role="listbox"
          aria-label="Destination folders"
          className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5"
        >
          {options.map((option) => {
            const isSelected = option.path === selectedFolderPath
            const isCurrent = option.path === currentFolderPath

            return (
              <button
                key={option.path || 'root'}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => setSelectedFolderPath(option.path)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
                  isSelected
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isCurrent ? (
                  <span className="ml-3 flex-shrink-0 text-[11px] font-medium text-gray-500">
                    current
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {errorMessage ? (
          <p className="mt-2 text-xs text-red-600" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="h-10 rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onMove(selectedFolderPath)}
            disabled={isLoading || isUnchanged}
            className="h-10 rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition-all hover:bg-black focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50"
          >
            {isLoading ? 'Moving...' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  )
}
