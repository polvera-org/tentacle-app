import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

const EMBEDDING_MODEL_LOAD_EVENT = 'embedding-model-load-state'

export type EmbeddingModelLoadStatus = 'idle' | 'loading' | 'ready' | 'failed'
export type EmbeddingModelLoadStage =
  | 'starting'
  | 'resolving_artifacts'
  | 'loading_tokenizer'
  | 'creating_session'
  | 'ready'
  | 'failed'

export interface EmbeddingModelLoadState {
  status: EmbeddingModelLoadStatus
  stage: EmbeddingModelLoadStage
  progress: number
  message: string
  error: string | null
}

const DEFAULT_LOAD_STATE: EmbeddingModelLoadState = {
  status: 'idle',
  stage: 'starting',
  progress: 0,
  message: 'Waiting to load embedding model.',
  error: null,
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

function normalizeProgress(value: unknown, fallback: number): number {
  const normalized = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(normalized)) {
    return fallback
  }

  if (normalized <= 0) {
    return 0
  }

  if (normalized >= 1) {
    return 1
  }

  return normalized
}

function normalizeStatus(value: unknown): EmbeddingModelLoadStatus {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'loading' || normalized === 'ready' || normalized === 'failed') {
    return normalized
  }

  return 'idle'
}

function normalizeStage(value: unknown): EmbeddingModelLoadStage {
  const normalized = normalizeString(value).toLowerCase()
  if (
    normalized === 'starting' ||
    normalized === 'resolving_artifacts' ||
    normalized === 'loading_tokenizer' ||
    normalized === 'creating_session' ||
    normalized === 'ready' ||
    normalized === 'failed'
  ) {
    return normalized
  }

  return 'starting'
}

function normalizeError(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeState(payload: unknown): EmbeddingModelLoadState {
  if (!payload || typeof payload !== 'object') {
    return { ...DEFAULT_LOAD_STATE }
  }

  const record = payload as RecordLike
  return {
    status: normalizeStatus(record.status),
    stage: normalizeStage(record.stage),
    progress: normalizeProgress(record.progress, DEFAULT_LOAD_STATE.progress),
    message: normalizeString(record.message, DEFAULT_LOAD_STATE.message),
    error: normalizeError(record.error),
  }
}

export function getDefaultEmbeddingModelLoadState(): EmbeddingModelLoadState {
  return { ...DEFAULT_LOAD_STATE }
}

export async function getEmbeddingModelLoadState(): Promise<EmbeddingModelLoadState> {
  const payload = await invoke<unknown>('get_embedding_model_load_state')
  return normalizeState(payload)
}

export async function preloadEmbeddingModel(): Promise<void> {
  await invoke('preload_embedding_model')
}

export async function listenToEmbeddingModelLoadState(
  onStateChanged: (state: EmbeddingModelLoadState) => void,
): Promise<UnlistenFn> {
  return await listen<unknown>(EMBEDDING_MODEL_LOAD_EVENT, (event) => {
    onStateChanged(normalizeState(event.payload))
  })
}

