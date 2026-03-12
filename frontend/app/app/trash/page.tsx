'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { TrashItemCard } from '@/components/documents/trash-item-card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ErrorToast } from '@/components/ui/error-toast'
import {
  clearTrashItems,
  deleteTrashItemPermanently,
  fetchTrashItems,
  recoverTrashItem,
} from '@/lib/documents/trash'
import type { TrashItem, TrashListResult } from '@/types/documents'

function formatTotalSize(sizeBytes: number): string {
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

function removeItemFromList(current: TrashListResult, trashPath: string): TrashListResult {
  const nextItems = current.items.filter((item) => item.trash_path !== trashPath)
  const removedItem = current.items.find((item) => item.trash_path === trashPath)

  return {
    items: nextItems,
    total_count: nextItems.length,
    total_size_bytes: Math.max(0, current.total_size_bytes - (removedItem?.size_bytes ?? 0)),
  }
}

function isRecoverConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return error.message.toLowerCase().includes('already exists')
}

export default function TrashPage() {
  const router = useRouter()
  const [trashList, setTrashList] = useState<TrashListResult>({
    items: [],
    total_count: 0,
    total_size_bytes: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [activeRestorePath, setActiveRestorePath] = useState<string | null>(null)
  const [activeDeletePath, setActiveDeletePath] = useState<string | null>(null)
  const [trashItemToDelete, setTrashItemToDelete] = useState<TrashItem | null>(null)
  const [trashItemWithConflict, setTrashItemWithConflict] = useState<TrashItem | null>(null)
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false)
  const [isClearLoading, setIsClearLoading] = useState(false)

  const sortedItems = useMemo(() => {
    return [...trashList.items].sort((a, b) => b.deleted_at_unix_seconds - a.deleted_at_unix_seconds)
  }, [trashList.items])

  const loadTrash = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await fetchTrashItems()
      setTrashList(result)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load trash.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTrash()
  }, [loadTrash])

  const handleRestore = useCallback(async (item: TrashItem) => {
    setActiveRestorePath(item.trash_path)
    setStatusMessage(null)

    try {
      const result = await recoverTrashItem(item.trash_path, 'original_location')
      setTrashList((current) => removeItemFromList(current, item.trash_path))
      setStatusMessage(`Restored to ${result.recovered_to}.`)
      setErrorMessage(null)
    } catch (error) {
      if (isRecoverConflictError(error)) {
        setTrashItemWithConflict(item)
        return
      }

      setErrorMessage(error instanceof Error ? error.message : 'Failed to restore note.')
    } finally {
      setActiveRestorePath(null)
    }
  }, [])

  const handleRestoreWithSuffix = useCallback(async () => {
    if (!trashItemWithConflict) {
      return
    }

    setActiveRestorePath(trashItemWithConflict.trash_path)
    try {
      const result = await recoverTrashItem(trashItemWithConflict.trash_path, 'with_suffix')
      setTrashList((current) => removeItemFromList(current, trashItemWithConflict.trash_path))
      setStatusMessage(`Restored as ${result.recovered_to}.`)
      setErrorMessage(null)
      setTrashItemWithConflict(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to restore note.')
    } finally {
      setActiveRestorePath(null)
    }
  }, [trashItemWithConflict])

  const handleDeletePermanently = useCallback(async () => {
    if (!trashItemToDelete) {
      return
    }

    setActiveDeletePath(trashItemToDelete.trash_path)
    try {
      await deleteTrashItemPermanently(trashItemToDelete.trash_path)
      setTrashList((current) => removeItemFromList(current, trashItemToDelete.trash_path))
      setStatusMessage(`Deleted ${trashItemToDelete.file_name} permanently.`)
      setErrorMessage(null)
      setTrashItemToDelete(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to permanently delete note.')
    } finally {
      setActiveDeletePath(null)
    }
  }, [trashItemToDelete])

  const handleClearTrash = useCallback(async () => {
    setIsClearLoading(true)
    try {
      const removedCount = await clearTrashItems()
      setTrashList({
        items: [],
        total_count: 0,
        total_size_bytes: 0,
      })
      setStatusMessage(
        removedCount === 1
          ? 'Deleted 1 note permanently.'
          : `Deleted ${removedCount} notes permanently.`,
      )
      setErrorMessage(null)
      setIsClearDialogOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to clear trash.')
    } finally {
      setIsClearLoading(false)
    }
  }, [])

  return (
    <div className="flex h-full flex-col bg-stone-50">
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => router.push('/app')}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>

          <button
            type="button"
            onClick={() => setIsClearDialogOpen(true)}
            disabled={trashList.total_count === 0 || isClearLoading}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Empty trash
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">Trash</p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-950">Deleted notes</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Restore notes to their original folders or remove them permanently.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-stone-700">
              <span className="rounded-full bg-stone-100 px-3 py-1.5 font-medium">
                {trashList.total_count} item{trashList.total_count === 1 ? '' : 's'}
              </span>
              <span className="rounded-full bg-stone-100 px-3 py-1.5 font-medium">
                {formatTotalSize(trashList.total_size_bytes)}
              </span>
            </div>
            {statusMessage ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {statusMessage}
              </p>
            ) : null}
          </section>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-3xl bg-stone-200" />
              ))}
            </div>
          ) : sortedItems.length > 0 ? (
            <div className="space-y-3">
              {sortedItems.map((item) => (
                <TrashItemCard
                  key={item.trash_path}
                  item={item}
                  isRecovering={activeRestorePath === item.trash_path}
                  isDeleting={activeDeletePath === item.trash_path}
                  onRestore={(nextItem) => {
                    void handleRestore(nextItem)
                  }}
                  onDeletePermanently={setTrashItemToDelete}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
              <p className="text-lg font-medium text-stone-900">Trash is empty</p>
              <p className="mt-2 text-sm text-stone-600">
                Deleted notes will appear here until you restore them or remove them permanently.
              </p>
            </div>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={trashItemToDelete !== null}
        title="Delete permanently"
        description={
          trashItemToDelete
            ? `Delete "${trashItemToDelete.file_name}" permanently? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete forever"
        loadingLabel="Deleting..."
        onConfirm={() => {
          void handleDeletePermanently()
        }}
        onCancel={() => {
          if (activeDeletePath) {
            return
          }

          setTrashItemToDelete(null)
        }}
        isLoading={activeDeletePath !== null}
      />

      <ConfirmDialog
        open={trashItemWithConflict !== null}
        title="Restore as copy"
        description={
          trashItemWithConflict
            ? `A note already exists in "${trashItemWithConflict.original_folder_path || 'Root'}". Restore this note with a numeric suffix instead?`
            : ''
        }
        confirmLabel="Restore copy"
        loadingLabel="Restoring..."
        confirmVariant="primary"
        onConfirm={() => {
          void handleRestoreWithSuffix()
        }}
        onCancel={() => {
          if (activeRestorePath) {
            return
          }

          setTrashItemWithConflict(null)
        }}
        isLoading={activeRestorePath !== null}
      />

      <ConfirmDialog
        open={isClearDialogOpen}
        title="Empty trash"
        description="Delete every note in trash permanently? This cannot be undone."
        confirmLabel="Empty trash"
        loadingLabel="Deleting..."
        onConfirm={() => {
          void handleClearTrash()
        }}
        onCancel={() => {
          if (isClearLoading) {
            return
          }

          setIsClearDialogOpen(false)
        }}
        isLoading={isClearLoading}
      />

      {errorMessage ? <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} /> : null}
    </div>
  )
}
