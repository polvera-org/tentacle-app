'use client'

import toast from 'react-hot-toast'
import { createTransformersIndexedDbCache } from '@/lib/ai/transformers-idb-cache'
import type { TransformersCustomCache } from '@/lib/ai/transformers-idb-cache'

export const LOCAL_EMBEDDING_MODEL_ID = 'onnx-community/Qwen3-Embedding-0.6B-ONNX'
export const LOCAL_EMBEDDING_DIMENSIONS = 1024

const QUERY_EMBEDDING_INSTRUCTION = 'Given a user query, retrieve relevant notes and passages.'

type FeatureExtractionPipeline = (
  input: string,
  options?: {
    pooling?: 'mean' | 'last_token'
    normalize?: boolean
  },
) => Promise<unknown>

const MODEL_DOWNLOAD_TOAST_ID = 'model-download'

let pipelineInstance: FeatureExtractionPipeline | null = null
let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null
let modelReadyToastShown = false

interface PipelineProgressEvent {
  status?: unknown
}

interface PipelineTensorLike {
  data?: unknown
  tolist?: () => unknown
}

interface TiptapTextNode {
  type?: unknown
  text?: unknown
  content?: unknown
}

interface TokenizerJsonModelLike {
  type?: unknown
  merges?: unknown
}

interface TokenizerJsonLike {
  model?: unknown
}

const BPE_TOKENIZER_TYPE = 'BPE'

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\s+/g, ' ').trim()
}

function normalizeFiniteNumberArray(value: unknown): number[] {
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

function normalizeTensorData(value: unknown): number[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return normalizeFiniteNumberArray(value)
  }

  if (!ArrayBuffer.isView(value)) {
    return []
  }

  const arrayLikeValue = value as unknown as { [index: number]: unknown, length?: unknown }
  const length = typeof arrayLikeValue.length === 'number' ? arrayLikeValue.length : 0
  if (length <= 0) {
    return []
  }

  const normalizedEntries: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    normalizedEntries.push(arrayLikeValue[index])
  }

  return normalizeFiniteNumberArray(normalizedEntries)
}

function normalizePipelineVectorResult(value: unknown): number[] {
  const directValues = normalizeFiniteNumberArray(value)
  if (directValues.length > 0) {
    return directValues
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const tensorLike = value as PipelineTensorLike
  const dataValues = normalizeTensorData(tensorLike.data)
  if (dataValues.length > 0) {
    return dataValues
  }

  if (typeof tensorLike.tolist !== 'function') {
    return []
  }

  const listResult = tensorLike.tolist()
  if (Array.isArray(listResult) && listResult.length > 0 && Array.isArray(listResult[0])) {
    return normalizeFiniteNumberArray(listResult[0])
  }

  return normalizeFiniteNumberArray(listResult)
}

function normalizeBpeMergeEntry(entry: unknown): string | null {
  if (typeof entry === 'string') {
    const normalized = normalizeString(entry)
    return normalized.length > 0 ? normalized : null
  }

  if (!Array.isArray(entry) || entry.length < 2) {
    return null
  }

  const left = normalizeString(entry[0])
  const right = normalizeString(entry[1])
  if (left.length === 0 || right.length === 0) {
    return null
  }

  return `${left} ${right}`
}

function normalizeTokenizerJsonForLegacyBpe(payload: unknown): { changed: boolean, value: unknown } {
  if (!payload || typeof payload !== 'object') {
    return { changed: false, value: payload }
  }

  const tokenizer = payload as TokenizerJsonLike
  if (!tokenizer.model || typeof tokenizer.model !== 'object') {
    return { changed: false, value: payload }
  }

  const model = tokenizer.model as TokenizerJsonModelLike
  const modelType = normalizeString(model.type)
  if (modelType !== BPE_TOKENIZER_TYPE || !Array.isArray(model.merges)) {
    return { changed: false, value: payload }
  }

  let changed = false
  const normalizedMerges: string[] = []
  for (const entry of model.merges) {
    const normalizedEntry = normalizeBpeMergeEntry(entry)
    if (normalizedEntry === null) {
      changed = true
      continue
    }

    if (normalizedEntry !== entry) {
      changed = true
    }
    normalizedMerges.push(normalizedEntry)
  }

  if (!changed) {
    return { changed: false, value: payload }
  }

  return {
    changed: true,
    value: {
      ...(payload as Record<string, unknown>),
      model: {
        ...model,
        merges: normalizedMerges,
      },
    },
  }
}

function shouldNormalizeQwenTokenizerResponse(url: string): boolean {
  const normalizedUrl = url.toLowerCase()
  return normalizedUrl.includes('qwen3-embedding-0.6b-onnx') && normalizedUrl.includes('tokenizer.json')
}

function buildLikelyTokenizerCacheKeys(): string[] {
  const encodedModelId = encodeURIComponent(LOCAL_EMBEDDING_MODEL_ID)
  return [
    `https://huggingface.co/${LOCAL_EMBEDDING_MODEL_ID}/resolve/main/tokenizer.json`,
    `https://huggingface.co/${LOCAL_EMBEDDING_MODEL_ID}/resolve/main/tokenizer.json?download=true`,
    `https://huggingface.co/${encodedModelId}/resolve/main/tokenizer.json`,
    `https://huggingface.co/${encodedModelId}/resolve/main/tokenizer.json?download=true`,
  ]
}

interface ParsedTokenizerJsonResult {
  payload: TokenizerJsonLike
  body: string
  hadNullBytes: boolean
}

function stripNullBytes(value: string): string {
  return value.replace(/\u0000/g, '')
}

async function parseTokenizerJsonFromResponse(response: Response): Promise<ParsedTokenizerJsonResult | null> {
  try {
    const rawBody = await response.clone().text()
    const sanitizedBody = stripNullBytes(rawBody)
    const parsed: unknown = JSON.parse(sanitizedBody)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    return {
      payload: parsed as TokenizerJsonLike,
      body: sanitizedBody,
      hadNullBytes: sanitizedBody.length !== rawBody.length,
    }
  } catch {
    return null
  }
}

async function hasValidTokenizerPayload(response: Response): Promise<boolean> {
  return (await parseTokenizerJsonFromResponse(response)) !== null
}

async function maybeNormalizeTokenizerResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    return response
  }

  const parsed = await parseTokenizerJsonFromResponse(response)
  if (!parsed) {
    return response
  }

  const normalized = normalizeTokenizerJsonForLegacyBpe(parsed.payload)
  if (!normalized.changed && !parsed.hadNullBytes) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(normalized.value), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function normalizeTokenizerFromCustomCache(cache: TransformersCustomCache): Promise<void> {
  const cacheKeys = buildLikelyTokenizerCacheKeys()
  for (const cacheKey of cacheKeys) {
    const cachedResponse = await cache.match(cacheKey)
    if (!cachedResponse) {
      continue
    }

    const normalizedResponse = await maybeNormalizeTokenizerResponse(cachedResponse)
    if (normalizedResponse === cachedResponse) {
      if (!(await hasValidTokenizerPayload(cachedResponse))) {
        await cache.delete(cacheKey)
      }
      continue
    }

    await cache.put(cacheKey, normalizedResponse)
  }
}

function installQwenTokenizerCompatibilityFetch(): (() => void) | null {
  if (typeof window === 'undefined' || typeof globalThis.fetch !== 'function') {
    return null
  }

  const globalLike = globalThis as typeof globalThis & { fetch: typeof fetch }
  const originalFetch = globalLike.fetch.bind(globalThis)
  const patchedFetch: typeof fetch = async (input, init) => {
    const response = await originalFetch(input, init)

    const requestUrl = (() => {
      if (typeof input === 'string') {
        return input
      }
      if (input instanceof URL) {
        return input.toString()
      }
      return input.url
    })()

    if (!response.ok || !shouldNormalizeQwenTokenizerResponse(requestUrl)) {
      return response
    }

    const normalizedResponse = await maybeNormalizeTokenizerResponse(response)
    if (await hasValidTokenizerPayload(normalizedResponse)) {
      return normalizedResponse
    }

    const retryUrl = requestUrl.includes('?')
      ? `${requestUrl}&refresh=${Date.now()}`
      : `${requestUrl}?refresh=${Date.now()}`
    const retriedResponse = await originalFetch(retryUrl, { cache: 'no-store' })
    if (!retriedResponse.ok) {
      return normalizedResponse
    }

    const normalizedRetriedResponse = await maybeNormalizeTokenizerResponse(retriedResponse)
    if (await hasValidTokenizerPayload(normalizedRetriedResponse)) {
      return normalizedRetriedResponse
    }

    throw new Error(`Failed to load a valid tokenizer payload for ${LOCAL_EMBEDDING_MODEL_ID}.`)
  }

  globalLike.fetch = patchedFetch
  return () => {
    globalLike.fetch = originalFetch
  }
}

function handlePipelineProgress(event: unknown): void {
  if (!event || typeof event !== 'object') {
    return
  }

  const { status } = event as PipelineProgressEvent
  if (status !== 'ready') {
    return
  }

  toast.dismiss(MODEL_DOWNLOAD_TOAST_ID)

  if (modelReadyToastShown) {
    return
  }

  modelReadyToastShown = true
  toast.success('AI model ready')
}

async function getFeatureExtractionPipeline(): Promise<FeatureExtractionPipeline> {
  if (typeof window === 'undefined') {
    throw new Error('Local embeddings are only available in the browser runtime.')
  }

  if (pipelineInstance) {
    return pipelineInstance
  }

  if (pipelinePromise) {
    return pipelinePromise
  }

  toast.loading('Loading local AI model (first run may download ~470MB)', {
    id: MODEL_DOWNLOAD_TOAST_ID,
    duration: Infinity,
  })

  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@xenova/transformers')
    const restoreFetch = installQwenTokenizerCompatibilityFetch()

    const persistentCache = await createTransformersIndexedDbCache()
    env.allowLocalModels = false
    env.useFS = false
    env.useFSCache = false
    env.useBrowserCache = false
    env.useCustomCache = persistentCache !== null
    env.customCache = persistentCache

    if (persistentCache) {
      await normalizeTokenizerFromCustomCache(persistentCache)
    }

    try {
      const extractor = await pipeline('feature-extraction', LOCAL_EMBEDDING_MODEL_ID, {
        progress_callback: handlePipelineProgress,
      })

      pipelineInstance = extractor as FeatureExtractionPipeline
      return pipelineInstance
    } finally {
      restoreFetch?.()
    }
  })()
    .catch((error) => {
      toast.dismiss(MODEL_DOWNLOAD_TOAST_ID)
      throw error
    })
    .finally(() => {
      if (!pipelineInstance) {
        pipelinePromise = null
      }
    })

  return pipelinePromise
}

function collectPlainText(value: unknown, parts: string[]): void {
  if (typeof value === 'string') {
    parts.push(value)
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPlainText(entry, parts)
    }
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  const node = value as TiptapTextNode
  if (node.type === 'hardBreak') {
    parts.push('\n')
  }

  if (typeof node.text === 'string') {
    parts.push(node.text)
  }

  if (Array.isArray(node.content)) {
    collectPlainText(node.content, parts)
  }
}

export function extractPlainTextFromTiptapBody(body: string): string {
  const normalizedBody = normalizeString(body)
  if (normalizedBody.length === 0) {
    return ''
  }

  try {
    const parsed: unknown = JSON.parse(body)
    const parts: string[] = []
    collectPlainText(parsed, parts)
    const extractedText = normalizeString(parts.join(' '))

    if (extractedText.length > 0) {
      return extractedText
    }
  } catch {
    // Fallback to raw text if body is not JSON.
  }

  return normalizedBody
}

export async function embedTextLocally(text: string): Promise<number[]> {
  return await embedDocumentTextLocally(text)
}

function formatQueryForEmbedding(query: string): string {
  return `Instruct: ${QUERY_EMBEDDING_INSTRUCTION}\nQuery: ${query}`
}

async function embedWithPipeline(text: string): Promise<number[]> {
  const normalizedText = normalizeString(text)
  if (normalizedText.length === 0) {
    return []
  }

  const extractor = await getFeatureExtractionPipeline()
  const result = await extractor(normalizedText, {
    pooling: 'last_token',
    normalize: true,
  })

  const vector = normalizePipelineVectorResult(result)
  if (vector.length !== LOCAL_EMBEDDING_DIMENSIONS) {
    console.error(
      `[local-embeddings] Unexpected embedding dimensions for "${LOCAL_EMBEDDING_MODEL_ID}". ` +
      `Expected ${LOCAL_EMBEDDING_DIMENSIONS}, received ${vector.length}.`,
    )
    return []
  }

  return vector
}

export async function embedDocumentTextLocally(text: string): Promise<number[]> {
  return await embedWithPipeline(text)
}

export async function embedQueryTextLocally(query: string): Promise<number[]> {
  const normalizedQuery = normalizeString(query)
  if (normalizedQuery.length === 0) {
    return []
  }

  return await embedWithPipeline(formatQueryForEmbedding(normalizedQuery))
}
