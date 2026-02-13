import { invoke } from '@tauri-apps/api/core'
import type {
  CachedDocumentChunkEmbeddingPayload,
  CachedDocumentEmbeddingPayload,
  DocumentEmbeddingMetadata,
  HybridSearchHit,
  SemanticSearchHit,
} from '@/types/documents'

const DEFAULT_LIMIT = 20
const DEFAULT_MIN_SCORE = 0
const EPOCH_ISO_TIMESTAMP = '1970-01-01T00:00:00.000Z'

export interface SemanticSearchCachedDocumentsArgs {
  query_vector?: number[]
  queryVector?: number[]
  limit?: number
  min_score?: number
  minScore?: number
  exclude_document_id?: string | null
  excludeDocumentId?: string | null
}

export interface HybridSearchCachedDocumentsArgs {
  query_vector?: number[]
  queryVector?: number[]
  query_text?: string
  queryText?: string
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

interface NormalizedSemanticSearchArgs {
  query_vector: number[]
  limit: number
  min_score: number
  exclude_document_id: string | null
}

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

function normalizeTimestamp(value: unknown, fallback: string): string {
  return normalizeString(value, fallback)
}

function normalizeFolder(folder: string): string {
  const normalized = normalizeString(folder)
  if (normalized.length === 0) {
    throw new Error('Documents folder is required for embeddings cache operations.')
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

function normalizeVector(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalizedValues: number[] = []
  for (const entry of value) {
    const normalized = typeof entry === 'number' ? entry : Number(entry)
    if (!Number.isFinite(normalized)) {
      continue
    }

    normalizedValues.push(normalized)
  }

  return normalizedValues
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

function createDocumentIdArgs(documentId: string): { documentId: string, document_id: string } {
  return {
    documentId,
    document_id: documentId,
  }
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

  const updatedAt = normalizeTimestamp(
    cached.updated_at ?? cached.updatedAt,
    EPOCH_ISO_TIMESTAMP,
  )

  return {
    document_id: documentId,
    model: readStringEntry(cached, 'model'),
    content_hash: readStringEntry(cached, 'content_hash', 'contentHash'),
    updated_at: updatedAt,
  }
}

function toSemanticSearchHit(payload: unknown): SemanticSearchHit | null {
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

function normalizeEmbeddingPayload(
  embedding: CachedDocumentEmbeddingPayload,
): CachedDocumentEmbeddingPayload | null {
  const documentId = normalizeString(embedding.document_id)
  if (documentId.length === 0) {
    return null
  }

  const model = normalizeString(embedding.model)
  const contentHash = normalizeString(embedding.content_hash)
  const vector = normalizeVector(embedding.vector)
  if (model.length === 0 || contentHash.length === 0 || vector.length === 0) {
    return null
  }

  const updatedAt = normalizeTimestamp(embedding.updated_at, nowIsoString())
  return {
    document_id: documentId,
    model,
    content_hash: contentHash,
    vector,
    updated_at: updatedAt,
  }
}

function createInvokeEmbeddingPayload(embedding: CachedDocumentEmbeddingPayload): RecordLike {
  return {
    document_id: embedding.document_id,
    documentId: embedding.document_id,
    model: embedding.model,
    content_hash: embedding.content_hash,
    contentHash: embedding.content_hash,
    vector: embedding.vector,
    updated_at: embedding.updated_at,
    updatedAt: embedding.updated_at,
  }
}

function normalizeSemanticSearchArgs(args: SemanticSearchCachedDocumentsArgs): NormalizedSemanticSearchArgs {
  const queryVector = normalizeVector(args.query_vector ?? args.queryVector)

  return {
    query_vector: queryVector,
    limit: normalizeLimit(args.limit),
    min_score: normalizeMinScore(args.min_score ?? args.minScore),
    exclude_document_id: normalizeNullableString(
      args.exclude_document_id ?? args.excludeDocumentId,
    ),
  }
}

export async function readCachedEmbeddingMetadata(folder: string): Promise<DocumentEmbeddingMetadata[]> {
  const normalizedFolder = normalizeFolder(folder)
  const payload = await invoke<unknown>(
    'get_cached_document_embedding_metadata',
    createFolderArgs(normalizedFolder),
  )

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

      const byDocumentId = a.document_id.localeCompare(b.document_id)
      if (byDocumentId !== 0) {
        return byDocumentId
      }

      return a.content_hash.localeCompare(b.content_hash)
    })
}

export async function upsertCachedDocumentEmbedding(
  folder: string,
  embedding: CachedDocumentEmbeddingPayload,
): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedEmbedding = normalizeEmbeddingPayload(embedding)

  if (!normalizedEmbedding) {
    return
  }

  await invoke('upsert_cached_document_embedding', {
    ...createFolderArgs(normalizedFolder),
    embedding: createInvokeEmbeddingPayload(normalizedEmbedding),
  })
}

export async function deleteCachedDocumentEmbedding(
  folder: string,
  documentId: string,
): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedDocumentId = normalizeString(documentId)

  if (normalizedDocumentId.length === 0) {
    return
  }

  await invoke('delete_cached_document_embedding', {
    ...createFolderArgs(normalizedFolder),
    ...createDocumentIdArgs(normalizedDocumentId),
  })
}

export async function replaceCachedDocumentEmbeddings(
  folder: string,
  embeddings: CachedDocumentEmbeddingPayload[],
): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedEmbeddings = embeddings
    .map(normalizeEmbeddingPayload)
    .filter((embedding): embedding is CachedDocumentEmbeddingPayload => embedding !== null)

  await invoke('replace_cached_document_embeddings', {
    ...createFolderArgs(normalizedFolder),
    embeddings: normalizedEmbeddings.map(createInvokeEmbeddingPayload),
  })
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
  return { document_id: documentId, score }
}

export async function semanticSearchCachedDocuments(
  folder: string,
  args: SemanticSearchCachedDocumentsArgs,
): Promise<SemanticSearchHit[]> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedArgs = normalizeSemanticSearchArgs(args)

  if (normalizedArgs.query_vector.length === 0) {
    return []
  }

  const payload = await invoke<unknown>('semantic_search_cached_documents', {
    ...createFolderArgs(normalizedFolder),
    queryVector: normalizedArgs.query_vector,
    query_vector: normalizedArgs.query_vector,
    limit: normalizedArgs.limit,
    minScore: normalizedArgs.min_score,
    min_score: normalizedArgs.min_score,
    excludeDocumentId: normalizedArgs.exclude_document_id,
    exclude_document_id: normalizedArgs.exclude_document_id,
  })

  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map(toSemanticSearchHit)
    .filter((hit): hit is SemanticSearchHit => hit !== null)
    .sort((a, b) => {
      const byScore = b.score - a.score
      if (byScore !== 0) {
        return byScore
      }

      return a.document_id.localeCompare(b.document_id)
    })
}

export async function hybridSearchCachedDocuments(
  folder: string,
  args: HybridSearchCachedDocumentsArgs,
): Promise<HybridSearchHit[]> {
  const normalizedFolder = normalizeFolder(folder)
  const queryVector = normalizeVector(args.query_vector ?? args.queryVector)

  if (queryVector.length === 0) {
    return []
  }

  const queryText = normalizeString(args.query_text ?? args.queryText)
  const semanticWeight = normalizeFiniteNumber(args.semantic_weight ?? args.semanticWeight, 0.5)
  const bm25Weight = normalizeFiniteNumber(args.bm25_weight ?? args.bm25Weight, 0.5)
  const limit = normalizeLimit(args.limit)
  const minScore = normalizeMinScore(args.min_score ?? args.minScore)
  const excludeDocumentId = normalizeNullableString(args.exclude_document_id ?? args.excludeDocumentId)

  const payload = await invoke<unknown>('hybrid_search_cached_documents', {
    ...createFolderArgs(normalizedFolder),
    queryVector,
    query_vector: queryVector,
    queryText,
    query_text: queryText,
    semanticWeight,
    semantic_weight: semanticWeight,
    bm25Weight,
    bm25_weight: bm25Weight,
    limit,
    minScore,
    min_score: minScore,
    excludeDocumentId: excludeDocumentId,
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

export async function replaceCachedDocumentChunkEmbeddings(
  folder: string,
  documentId: string,
  chunks: CachedDocumentChunkEmbeddingPayload[],
): Promise<void> {
  const normalizedFolder = normalizeFolder(folder)
  const normalizedDocumentId = normalizeString(documentId)

  if (normalizedDocumentId.length === 0 || chunks.length === 0) {
    return
  }

  await invoke('replace_cached_document_chunk_embeddings', {
    ...createFolderArgs(normalizedFolder),
    documentId: normalizedDocumentId,
    document_id: normalizedDocumentId,
    chunks: chunks.map((chunk) => ({
      document_id: chunk.document_id,
      documentId: chunk.document_id,
      chunk_index: chunk.chunk_index,
      chunkIndex: chunk.chunk_index,
      chunk_text: chunk.chunk_text,
      chunkText: chunk.chunk_text,
      content_hash: chunk.content_hash,
      contentHash: chunk.content_hash,
      model: chunk.model,
      vector: chunk.vector,
      updated_at: chunk.updated_at,
      updatedAt: chunk.updated_at,
    })),
  })
}
