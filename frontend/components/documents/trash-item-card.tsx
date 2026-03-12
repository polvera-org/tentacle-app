'use client'

import { RotateCcw, Trash2 } from 'lucide-react'
import type { TrashItem } from '@/types/documents'

interface TrashItemCardProps {
  item: TrashItem
  isRecovering: boolean
  isDeleting: boolean
  onRestore: (item: TrashItem) => void
  onDeletePermanently: (item: TrashItem) => void
}

function formatDeletedAt(unixSeconds: number): string {
  if (unixSeconds <= 0) {
    return 'Unknown time'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(unixSeconds * 1000))
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = sizeBytes
  let unitIndex = -1

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDisplayName(fileName: string): string {
  return fileName.toLowerCase().endsWith('.md')
    ? fileName.slice(0, -3)
    : fileName
}

export function TrashItemCard({
  item,
  isRecovering,
  isDeleting,
  onRestore,
  onDeletePermanently,
}: TrashItemCardProps) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold text-stone-900 break-words">
            {formatDisplayName(item.file_name)}
          </p>
          <dl className="mt-2 space-y-1 text-sm text-stone-600">
            <div>
              <dt className="inline font-medium text-stone-800">Original folder:</dt>{' '}
              <dd className="inline break-words">{item.original_folder_path || 'Root'}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-stone-800">Deleted:</dt>{' '}
              <dd className="inline">{formatDeletedAt(item.deleted_at_unix_seconds)}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-stone-800">Size:</dt>{' '}
              <dd className="inline">{formatFileSize(item.size_bytes)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:w-40">
          <button
            type="button"
            onClick={() => onRestore(item)}
            disabled={isRecovering || isDeleting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {isRecovering ? 'Restoring...' : 'Restore'}
          </button>
          <button
            type="button"
            onClick={() => onDeletePermanently(item)}
            disabled={isRecovering || isDeleting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {isDeleting ? 'Deleting...' : 'Delete forever'}
          </button>
        </div>
      </div>
    </article>
  )
}
