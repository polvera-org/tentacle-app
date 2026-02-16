import { invoke } from '@tauri-apps/api/core'
import type {
  DocumentEmbeddingMetadata,
  HybridSearchHit,
} from '@/types/documents'

const DEFAULT_LIMIT = 20
const DEFAULT_MIN_SCORE = 0
const EPOCH_ISO_TIMESTAMP = '1970-01-01T00:00:00.000Z'

export interface EmbeddingSyncDocumentPayload {
  id: string
  title: string
  body: string
  updated_at: string
}

export interface HybridSearchByQueryArgs {
  query_text?: string
  queryText?: string
  semantic_query_text?: string
  semanticQueryText?: string
  semantic_weight?: number
  semanticWeight?: number
  bm25_weight?: number
  bm25Weight?: number
  limit?: number
  min_score?: number
  minScore?: number
  exclude_document_id?: string | null
  excludeDocumentId?: string | null
}

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

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeFolder(folder: string): string {
  const normalized = normalizeString(folder)
  if (normalized.length === 0) {
    throw new Error('Documents folder is required for embeddings operations.')
  }

  return normalized
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  const normalized = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(normalized)) {
    return fallback
  }

  return normalized
}

function normalizeLimit(value: unknown): number {
  const normalized = Math.trunc(normalizeFiniteNumber(value, DEFAULT_LIMIT))
  if (normalized <= 0) {
    return DEFAULT_LIMIT
  }

  return normalized
}

function normalizeMinScore(value: unknown): number {
  const normalized = normalizeFiniteNumber(value, DEFAULT_MIN_SCORE)
  if (normalized <= 0) {
    return 0
  }

  if (normalized >= 1) {
    return 1
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

function readStringEntry(payload: RecordLike, ...keys: string[]): string {
  for (const key of keys) {
    const normalized = normalizeString(payload[key])
    if (normalized.length > 0) {
      return normalized
    }
  }

  return ''
}

function toDocumentEmbeddingMetadata(payload: unknown): DocumentEmbeddingMetadata | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const cached = payload as RecordLike
  const documentId = readStringEntry(cached, 'document_id', 'documentId')
  if (documentId.length === 0) {
    return null
  }

  return {
    document_id: documentId,
    model: readStringEntry(cached, 'model'),
    content_hash: readStringEntry(cached, 'content_hash', 'contentHash'),
    updated_at: normalizeString(cached.updated_at ?? cached.updatedAt, EPOCH_ISO_TIMESTAMP),
  }
}

function toHybridSearchHit(payload: unknown): HybridSearchHit | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const cached = payload as RecordLike
  const documentId = readStringEntry(cached, 'document_id', 'documentId')
  if (documentId.length === 0) {
    return null
  }

  const score = normalizeFiniteNumber(cached.score, 0)
  return {
    document_id: documentId,
    score,
  }
}

function normalizeSyncDocument(
  document: EmbeddingSyncDocumentPayload,
): EmbeddingSyncDocumentPayload | null {
  const id = normalizeString(document.id)
  if (id.length === 0) {
    return null
  }

  return {
    id,
    title: normalizeString(document.title),
    body: normalizeString(document.body),
    updated_at: normalizeString(document.updated_at, new Date().toISOString()),
  }
}

export async function readCachedEmbeddingMetadata(folder: string): Promise<DocumentEmbeddingMetadata[]> {
  const normalizedFolder = normalizeFolder(folder)
  const payload = await invoke<unknown>('get_cached_document_embedding_metadata', {
    ...createFolderArgs(normalizedFolder),
  })

  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map(toDocumentEmbeddingMetadata)
    .filter((metadata): metadata is DocumentEmbeddingMetadata => metadata !== null)
    .sort((a, b) => {
      const byUpdatedAt = b.updated_at.localeCompare(a.updated_at)
      if (byUpdatedAt !== 0) {
        return byUpdatedAt
      }

      return a.document_id.localeCompare(b.document_id)
    })
}

export async function syncDocumentEmbeddings(
  folder: string,
  document: EmbeddingSyncDocumentPayload,
): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedDocument = normalizeSyncDocument(document)
  if (!normalizedDocument) {
    return
  }

  await invoke('sync_document_embeddings', {
    ...createFolderArgs(normalizedFolder),
    document: {
      id: normalizedDocument.id,
      title: normalizedDocument.title,
      body: normalizedDocument.body,
      updated_at: normalizedDocument.updated_at,
      updatedAt: normalizedDocument.updated_at,
    },
  })
}

export async function syncDocumentsEmbeddingsBatch(
  folder: string,
  documents: EmbeddingSyncDocumentPayload[],
): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedDocuments = documents
    .map(normalizeSyncDocument)
    .filter((document): document is EmbeddingSyncDocumentPayload => document !== null)

  if (normalizedDocuments.length === 0) {
    return
  }

  await invoke('sync_documents_embeddings_batch', {
    ...createFolderArgs(normalizedFolder),
    documents: normalizedDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      body: document.body,
      updated_at: document.updated_at,
      updatedAt: document.updated_at,
    })),
  })
}

export async function deleteDocumentEmbeddings(
  folder: string,
  documentId: string,
): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedDocumentId = normalizeString(documentId)
  if (normalizedDocumentId.length === 0) {
    return
  }

  await invoke('delete_document_embeddings', {
    ...createFolderArgs(normalizedFolder),
    ...createDocumentIdArgs(normalizedDocumentId),
  })
}

export async function hybridSearchDocumentsByQuery(
  folder: string,
  args: HybridSearchByQueryArgs,
): Promise<HybridSearchHit[]> {
  const normalizedFolder = normalizeFolder(folder)
  const queryText = normalizeString(args.query_text ?? args.queryText)
  if (queryText.length === 0) {
    return []
  }
  const semanticQueryText = normalizeString(args.semantic_query_text ?? args.semanticQueryText, queryText)

  const semanticWeight = normalizeFiniteNumber(args.semantic_weight ?? args.semanticWeight, 0.5)
  const bm25Weight = normalizeFiniteNumber(args.bm25_weight ?? args.bm25Weight, 0.5)
  const limit = normalizeLimit(args.limit)
  const minScore = normalizeMinScore(args.min_score ?? args.minScore)
  const excludeDocumentId = normalizeNullableString(args.exclude_document_id ?? args.excludeDocumentId)

  const payload = await invoke<unknown>('hybrid_search_documents_by_query', {
    ...createFolderArgs(normalizedFolder),
    queryText,
    query_text: queryText,
    semanticQueryText,
    semantic_query_text: semanticQueryText,
    semanticWeight,
    semantic_weight: semanticWeight,
    bm25Weight,
    bm25_weight: bm25Weight,
    limit,
    minScore,
    min_score: minScore,
    excludeDocumentId,
    exclude_document_id: excludeDocumentId,
  })

  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map(toHybridSearchHit)
    .filter((hit): hit is HybridSearchHit => hit !== null)
    .sort((a, b) => {
      const byScore = b.score - a.score
      if (byScore !== 0) {
        return byScore
      }

      return a.document_id.localeCompare(b.document_id)
    })
}
