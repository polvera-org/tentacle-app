import { invoke } from '@tauri-apps/api/core'
import type { Document, DocumentListItem, DocumentTagUsage } from '@/types/documents'

interface CachedDocumentPayload {
  id: string
  user_id: string
  title: string
  body: string
  folder_path: string
  deleted_at: string | null
  created_at: string
  updated_at: string
  tags: string[]
}

interface CachedDocumentTagUsagePayload {
  tag: string
  last_used_at: string
  usage_count: number
}

const DEFAULT_TITLE = 'Untitled'
const LOCAL_USER_ID = 'local'
const EPOCH_ISO_TIMESTAMP = '1970-01-01T00:00:00.000Z'

function nowIsoString(): string {
  return new Date().toISOString()
}

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const tags: string[] = []

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue
    }

    const normalized = entry.trim()
    if (normalized.length === 0 || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    tags.push(normalized)
  }

  return tags
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

function normalizeTimestamp(value: unknown, fallback: string): string {
  return normalizeString(value, fallback)
}

function normalizeNonNegativeNumber(value: unknown): number {
  const normalized = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0
  }

  return Math.trunc(normalized)
}

function normalizeFolder(folder: string): string {
  const normalized = normalizeString(folder)
  if (normalized.length === 0) {
    throw new Error('Documents folder is required for cache operations.')
  }

  return normalized
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

function toCachedDocumentPayloadFromDocument(document: Document): CachedDocumentPayload {
  const createdAt = normalizeTimestamp(document.created_at, nowIsoString())

  return {
    id: normalizeString(document.id),
    user_id: normalizeString(document.user_id, LOCAL_USER_ID),
    title: normalizeString(document.title, DEFAULT_TITLE),
    body: normalizeString(document.body),
    folder_path: normalizeFolderPath(document.folder_path),
    deleted_at: normalizeNullableString(document.deleted_at),
    created_at: createdAt,
    updated_at: normalizeTimestamp(document.updated_at, createdAt),
    tags: normalizeTags(document.tags),
  }
}

function toCachedDocumentPayloadFromListItem(document: DocumentListItem): CachedDocumentPayload {
  const createdAt = normalizeTimestamp(document.created_at, nowIsoString())

  return {
    id: normalizeString(document.id),
    user_id: LOCAL_USER_ID,
    title: normalizeString(document.title, DEFAULT_TITLE),
    body: normalizeString(document.body),
    folder_path: normalizeFolderPath(document.folder_path),
    deleted_at: null,
    created_at: createdAt,
    updated_at: normalizeTimestamp(document.updated_at, createdAt),
    tags: normalizeTags(document.tags),
  }
}

function toDocumentListItem(payload: unknown): DocumentListItem | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const cached = payload as Partial<CachedDocumentPayload>
  const id = normalizeString(cached.id)
  if (id.length === 0) {
    return null
  }

  const createdAt = normalizeTimestamp(cached.created_at, nowIsoString())
  const updatedAt = normalizeTimestamp(cached.updated_at, createdAt)

  return {
    id,
    title: normalizeString(cached.title, DEFAULT_TITLE),
    body: normalizeString(cached.body),
    folder_path: normalizeFolderPath(cached.folder_path),
    created_at: createdAt,
    updated_at: updatedAt,
    tags: normalizeTags(cached.tags),
  }
}

function toDocumentTagUsage(payload: unknown): DocumentTagUsage | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const cached = payload as Partial<CachedDocumentTagUsagePayload>
  const tag = normalizeString(cached.tag)
  if (tag.length === 0) {
    return null
  }

  return {
    tag,
    last_used_at: normalizeTimestamp(cached.last_used_at, EPOCH_ISO_TIMESTAMP),
    usage_count: normalizeNonNegativeNumber(cached.usage_count),
  }
}

export async function readCachedDocuments(folder: string): Promise<DocumentListItem[]> {
  const normalizedFolder = normalizeFolder(folder)
  const payload = await invoke<unknown>('get_cached_documents', createFolderArgs(normalizedFolder))

  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map(toDocumentListItem)
    .filter((document): document is DocumentListItem => document !== null)
    .sort((a, b) => {
      const byUpdatedAt = b.updated_at.localeCompare(a.updated_at)
      if (byUpdatedAt !== 0) {
        return byUpdatedAt
      }

      return a.id.localeCompare(b.id)
    })
}

export async function readCachedDocumentTags(folder: string): Promise<DocumentTagUsage[]> {
  const normalizedFolder = normalizeFolder(folder)
  const payload = await invoke<unknown>('get_cached_document_tags', createFolderArgs(normalizedFolder))

  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map(toDocumentTagUsage)
    .filter((tagUsage): tagUsage is DocumentTagUsage => tagUsage !== null)
    .sort((a, b) => {
      const byLastUsedAt = b.last_used_at.localeCompare(a.last_used_at)
      if (byLastUsedAt !== 0) {
        return byLastUsedAt
      }

      return a.tag.localeCompare(b.tag)
    })
}

export async function upsertCachedDocument(folder: string, document: Document): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const payload = toCachedDocumentPayloadFromDocument(document)

  if (payload.id.length === 0) {
    return
  }

  await invoke('upsert_cached_document', {
    ...createFolderArgs(normalizedFolder),
    document: payload,
  })
}

export async function deleteCachedDocument(folder: string, documentId: string): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedDocumentId = normalizeString(documentId)

  if (normalizedDocumentId.length === 0) {
    return
  }

  await invoke('delete_cached_document', {
    ...createFolderArgs(normalizedFolder),
    ...createDocumentIdArgs(normalizedDocumentId),
  })
}

export async function replaceCachedDocuments(folder: string, documents: DocumentListItem[]): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)

  const normalizedDocuments = documents
    .map(toCachedDocumentPayloadFromListItem)
    .filter((document) => document.id.length > 0)

  await invoke('replace_cached_documents', {
    ...createFolderArgs(normalizedFolder),
    documents: normalizedDocuments,
  })
}
