import { invoke } from '@tauri-apps/api/core'
import { getDocumentsFolderAsync } from '@/lib/settings/documents-folder'
import type {
  TrashItem,
  TrashListResult,
  TrashRecoveryResult,
  TrashRecoveryStrategy,
  TrashStats,
} from '@/types/documents'

type RecordLike = Record<string, unknown>

export const TRASH_CHANGED_EVENT = 'trash-changed'

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function normalizeNonNegativeNumber(value: unknown): number {
  const normalized = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(normalized) || normalized < 0) {
    return 0
  }

  return Math.trunc(normalized)
}

function normalizeFolder(folder: string): string {
  const normalized = normalizeString(folder)
  if (normalized.length === 0) {
    throw new Error('Documents folder is required for trash operations.')
  }

  return normalized
}

function normalizeTrashPath(trashPath: string): string {
  const normalized = normalizeString(trashPath).replace(/\\/g, '/')
  if (normalized.length === 0) {
    throw new Error('Trash item path is required.')
  }

  return normalized.replace(/^\/+|\/+$/g, '')
}

function readStringEntry(payload: RecordLike, ...keys: string[]): string {
  for (const key of keys) {
    const normalized = normalizeString(payload[key])
    if (normalized.length > 0) {
      return normalized
    }
  }

  return ''
}

function createFolderArgs(folder: string): { documentsFolder: string, documents_folder: string } {
  return {
    documentsFolder: folder,
    documents_folder: folder,
  }
}

function createTrashPathArgs(trashPath: string): { trashPath: string, trash_path: string } {
  return {
    trashPath,
    trash_path: trashPath,
  }
}

function createRecoveryStrategyArgs(
  strategy: TrashRecoveryStrategy,
): { strategy: TrashRecoveryStrategy } {
  return { strategy }
}

function toTrashItem(payload: unknown): TrashItem | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const cached = payload as RecordLike
  const trashPath = readStringEntry(cached, 'trash_path', 'trashPath')
  if (trashPath.length === 0) {
    return null
  }

  return {
    id: readStringEntry(cached, 'id') || trashPath,
    file_name: readStringEntry(cached, 'file_name', 'fileName'),
    original_folder_path: readStringEntry(cached, 'original_folder_path', 'originalFolderPath'),
    trash_path: trashPath,
    deleted_at_unix_seconds: normalizeNonNegativeNumber(
      cached.deleted_at_unix_seconds ?? cached.deletedAtUnixSeconds,
    ),
    size_bytes: normalizeNonNegativeNumber(cached.size_bytes ?? cached.sizeBytes),
  }
}

function toTrashListResult(payload: unknown): TrashListResult {
  if (!payload || typeof payload !== 'object') {
    return {
      items: [],
      total_count: 0,
      total_size_bytes: 0,
    }
  }

  const cached = payload as RecordLike
  const items = Array.isArray(cached.items)
    ? cached.items.map(toTrashItem).filter((item): item is TrashItem => item !== null)
    : []

  return {
    items,
    total_count: normalizeNonNegativeNumber(cached.total_count ?? cached.totalCount ?? items.length),
    total_size_bytes: normalizeNonNegativeNumber(
      cached.total_size_bytes ?? cached.totalSizeBytes ?? items.reduce((total, item) => total + item.size_bytes, 0),
    ),
  }
}

function toTrashStats(payload: unknown): TrashStats {
  if (!payload || typeof payload !== 'object') {
    return {
      total_count: 0,
      total_size_bytes: 0,
    }
  }

  const cached = payload as RecordLike
  return {
    total_count: normalizeNonNegativeNumber(cached.total_count ?? cached.totalCount),
    total_size_bytes: normalizeNonNegativeNumber(cached.total_size_bytes ?? cached.totalSizeBytes),
  }
}

function toTrashRecoveryResult(payload: unknown): TrashRecoveryResult {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid recovery result returned by "recover_trash_item".')
  }

  const cached = payload as RecordLike
  return {
    success: cached.success === true,
    recovered_to: readStringEntry(cached, 'recovered_to', 'recoveredTo'),
    conflict_handled: cached.conflict_handled === true || cached.conflictHandled === true,
  }
}

function notifyTrashChanged(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(TRASH_CHANGED_EVENT))
}

export async function fetchTrashItems(): Promise<TrashListResult> {
  const folder = normalizeFolder(await getDocumentsFolderAsync())
  const payload = await invoke<unknown>('list_trash_items', {
    ...createFolderArgs(folder),
  })

  return toTrashListResult(payload)
}

export async function getTrashStats(): Promise<TrashStats> {
  const folder = normalizeFolder(await getDocumentsFolderAsync())
  const payload = await invoke<unknown>('get_trash_stats', {
    ...createFolderArgs(folder),
  })

  return toTrashStats(payload)
}

export async function recoverTrashItem(
  trashPath: string,
  strategy: TrashRecoveryStrategy = 'original_location',
): Promise<TrashRecoveryResult> {
  const folder = normalizeFolder(await getDocumentsFolderAsync())
  const normalizedTrashPath = normalizeTrashPath(trashPath)
  const payload = await invoke<unknown>('recover_trash_item', {
    ...createFolderArgs(folder),
    ...createTrashPathArgs(normalizedTrashPath),
    ...createRecoveryStrategyArgs(strategy),
  })

  notifyTrashChanged()
  return toTrashRecoveryResult(payload)
}

export async function deleteTrashItemPermanently(trashPath: string): Promise<void> {
  const folder = normalizeFolder(await getDocumentsFolderAsync())
  const normalizedTrashPath = normalizeTrashPath(trashPath)

  await invoke('delete_trash_item_permanently', {
    ...createFolderArgs(folder),
    ...createTrashPathArgs(normalizedTrashPath),
  })

  notifyTrashChanged()
}

export async function clearTrashItems(): Promise<number> {
  const folder = normalizeFolder(await getDocumentsFolderAsync())
  const removedCount = await invoke<number>('clear_trash_items', {
    ...createFolderArgs(folder),
  })

  notifyTrashChanged()
  return normalizeNonNegativeNumber(removedCount)
}

