'use client'

import toast from 'react-hot-toast'
import { createTransformersIndexedDbCache } from '@/lib/ai/transformers-idb-cache'

export const LOCAL_EMBEDDING_MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

type FeatureExtractionPipeline = (
  input: string,
  options?: {
    pooling?: 'mean'
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

  toast.loading('Loading local AI Model', {
    id: MODEL_DOWNLOAD_TOAST_ID,
    duration: Infinity,
  })

  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@xenova/transformers')

    const persistentCache = await createTransformersIndexedDbCache()
    env.allowLocalModels = false
    env.useFS = false
    env.useFSCache = false
    env.useBrowserCache = false
    env.useCustomCache = persistentCache !== null
    env.customCache = persistentCache

    const extractor = await pipeline('feature-extraction', LOCAL_EMBEDDING_MODEL_ID, {
      progress_callback: handlePipelineProgress,
    })

    pipelineInstance = extractor as FeatureExtractionPipeline
    return pipelineInstance
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
  const normalizedText = normalizeString(text)
  if (normalizedText.length === 0) {
    return []
  }

  const extractor = await getFeatureExtractionPipeline()
  const result = await extractor(normalizedText, {
    pooling: 'mean',
    normalize: true,
  })

  return normalizePipelineVectorResult(result)
}
