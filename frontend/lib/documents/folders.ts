import { invoke } from '@tauri-apps/api/core'
import type { DocumentFolder } from '@/types/documents'

interface RecordLike {
  [key: string]: unknown
}

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function normalizeFolderPath(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.trim().replace(/\\/g, '/')
  if (normalized.length === 0 || normalized === '/' || normalized === '.') {
    return ''
  }

  const segments: string[] = []
  for (const segment of normalized.split('/')) {
    const trimmedSegment = segment.trim()
    if (trimmedSegment.length === 0 || trimmedSegment === '.') {
      continue
    }

    if (trimmedSegment === '..') {
      segments.pop()
      continue
    }

    segments.push(trimmedSegment)
  }

  return segments.join('/')
}

function normalizeFolder(folder: string): string {
  const normalized = normalizeString(folder)
  if (normalized.length === 0) {
    throw new Error('Documents folder is required for folder operations.')
  }

  return normalized
}

function normalizeNonNegativeNumber(value: unknown): number {
  const normalized = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0
  }

  return Math.trunc(normalized)
}

function createFolderArgs(folder: string): { documentsFolder: string, documents_folder: string } {
  return {
    documentsFolder: folder,
    documents_folder: folder,
  }
}

function createDocumentIdArgs(documentId: string): { documentId: string, document_id: string } {
  return {
    documentId,
    document_id: documentId,
  }
}

function createFolderPathArgs(folderPath: string): { folderPath: string, folder_path: string } {
  return {
    folderPath,
    folder_path: folderPath,
  }
}

function createTargetFolderPathArgs(
  targetFolderPath: string,
): { targetFolderPath: string, target_folder_path: string } {
  return {
    targetFolderPath,
    target_folder_path: targetFolderPath,
  }
}

function createFolderNameArgs(name: string): { newName: string, new_name: string } {
  return {
    newName: name,
    new_name: name,
  }
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

function toDocumentFolder(payload: unknown): DocumentFolder | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const cached = payload as RecordLike
  const hasFolderKeys =
    'path' in cached ||
    'folder_path' in cached ||
    'folderPath' in cached ||
    'name' in cached ||
    'parent_path' in cached ||
    'parentPath' in cached

  if (!hasFolderKeys) {
    return null
  }

  const path = normalizeFolderPath(
    readStringEntry(cached, 'path', 'folder_path', 'folderPath'),
  )
  const fallbackName = path.split('/').at(-1) ?? ''
  const name = normalizeString(cached.name, fallbackName)
  const parentPath = normalizeFolderPath(
    readStringEntry(cached, 'parent_path', 'parentPath'),
  )

  return {
    path,
    name,
    parent_path: parentPath.length > 0 ? parentPath : null,
    document_count: normalizeNonNegativeNumber(
      cached.document_count ?? cached.documentCount,
    ),
    subfolder_count: normalizeNonNegativeNumber(
      cached.subfolder_count ?? cached.subfolderCount,
    ),
  }
}

function toDocumentFolderOrThrow(payload: unknown, command: string): DocumentFolder {
  const normalized = toDocumentFolder(payload)
  if (!normalized) {
    throw new Error(`Invalid folder payload returned by "${command}".`)
  }

  return normalized
}

function folderDepth(path: string): number {
  if (path.length === 0) {
    return 0
  }

  return path.split('/').length
}

function compareDocumentFolders(a: DocumentFolder, b: DocumentFolder): number {
  const byDepth = folderDepth(a.path) - folderDepth(b.path)
  if (byDepth !== 0) {
    return byDepth
  }

  const byName = a.name.localeCompare(b.name)
  if (byName !== 0) {
    return byName
  }

  return a.path.localeCompare(b.path)
}

export async function fetchDocumentFolders(folder: string): Promise<DocumentFolder[]> {
  const normalizedFolder = normalizeFolder(folder)
  const payload = await invoke<unknown>('list_document_folders', {
    ...createFolderArgs(normalizedFolder),
  })

  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map(toDocumentFolder)
    .filter((item): item is DocumentFolder => item !== null)
    .sort(compareDocumentFolders)
}

export async function createDocumentFolder(
  folder: string,
  folderPath: string,
): Promise<DocumentFolder> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedPath = normalizeFolderPath(folderPath)

  const payload = await invoke<unknown>('create_document_folder', {
    ...createFolderArgs(normalizedFolder),
    ...createFolderPathArgs(normalizedPath),
  })

  return toDocumentFolderOrThrow(payload, 'create_document_folder')
}

export async function renameDocumentFolder(
  folder: string,
  folderPath: string,
  newName: string,
): Promise<DocumentFolder> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedPath = normalizeFolderPath(folderPath)
  const normalizedName = normalizeString(newName)

  const payload = await invoke<unknown>('rename_document_folder', {
    ...createFolderArgs(normalizedFolder),
    ...createFolderPathArgs(normalizedPath),
    ...createFolderNameArgs(normalizedName),
  })

  return toDocumentFolderOrThrow(payload, 'rename_document_folder')
}

export async function deleteDocumentFolder(
  folder: string,
  folderPath: string,
  options?: { recursive?: boolean },
): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedPath = normalizeFolderPath(folderPath)
  const recursive = Boolean(options?.recursive)

  await invoke('delete_document_folder', {
    ...createFolderArgs(normalizedFolder),
    ...createFolderPathArgs(normalizedPath),
    recursive,
  })
}

export async function moveDocumentToFolder(
  folder: string,
  documentId: string,
  targetFolderPath: string,
): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedDocumentId = normalizeString(documentId)
  const normalizedTargetFolderPath = normalizeFolderPath(targetFolderPath)

  if (normalizedDocumentId.length === 0) {
    return
  }

  await invoke('move_document_to_folder', {
    ...createFolderArgs(normalizedFolder),
    ...createDocumentIdArgs(normalizedDocumentId),
    ...createTargetFolderPathArgs(normalizedTargetFolderPath),
  })
}
