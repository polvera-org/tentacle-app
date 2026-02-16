'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  getDefaultEmbeddingModelLoadState,
  getEmbeddingModelLoadState,
  listenToEmbeddingModelLoadState,
  preloadEmbeddingModel,
  type EmbeddingModelLoadStage,
  type EmbeddingModelLoadState,
} from '@/lib/embeddings/model-runtime'

interface EmbeddingModelStartupGateProps {
  children: ReactNode
}

function stageDescription(stage: EmbeddingModelLoadStage): string {
  switch (stage) {
    case 'resolving_artifacts':
      return 'Resolving model artifacts...'
    case 'loading_tokenizer':
      return 'Loading tokenizer...'
    case 'creating_session':
      return 'Creating ONNX runtime session...'
    case 'ready':
      return 'Embedding model is ready.'
    case 'failed':
      return 'Failed to load embedding model.'
    case 'starting':
    default:
      return 'Starting embedding model initialization...'
  }
}

function fallbackReadyState(): EmbeddingModelLoadState {
  return {
    status: 'ready',
    stage: 'ready',
    progress: 1,
    message: 'Embedding model startup is unavailable in this environment.',
    error: null,
  }
}

export function EmbeddingModelStartupGate({ children }: EmbeddingModelStartupGateProps) {
  const [loadState, setLoadState] = useState<EmbeddingModelLoadState>(getDefaultEmbeddingModelLoadState)
  const [isRetrying, setIsRetrying] = useState(false)

  useEffect(() => {
    let isDisposed = false
    let unlisten: (() => void) | null = null

    const bootstrap = async () => {
      try {
        const initialState = await getEmbeddingModelLoadState()
        if (isDisposed) {
          return
        }
        setLoadState(initialState)
      } catch (error) {
        console.warn('[embeddings][startup] unable to read model load state; skipping startup gate', error)
        if (!isDisposed) {
          setLoadState(fallbackReadyState())
        }
        return
      }

      try {
        unlisten = await listenToEmbeddingModelLoadState((nextState) => {
          if (!isDisposed) {
            setLoadState(nextState)
          }
        })
      } catch (error) {
        console.warn('[embeddings][startup] unable to listen for model load state updates', error)
      }

      try {
        await preloadEmbeddingModel()
      } catch (error) {
        console.warn('[embeddings][startup] preload request failed', error)
      }
    }

    void bootstrap()

    return () => {
      isDisposed = true
      if (unlisten) {
        unlisten()
      }
    }
  }, [])

  const handleRetry = useCallback(() => {
    setIsRetrying(true)
    void preloadEmbeddingModel()
      .catch((error) => {
        console.error('[embeddings][startup] retry failed', error)
      })
      .finally(() => {
        setIsRetrying(false)
      })
  }, [])

  const isReady = loadState.status === 'ready'
  const progressPercent = useMemo(() => {
    const clamped = Math.min(1, Math.max(0, loadState.progress))
    return Math.round(clamped * 100)
  }, [loadState.progress])
  const description = loadState.message.trim().length > 0
    ? loadState.message
    : stageDescription(loadState.stage)

  if (isReady) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen w-full bg-white text-gray-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6">
        <h1 className="text-xl font-semibold text-gray-900">
          Loading embedding model
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          {description}
        </p>
        <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gray-900 transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500" role="status" aria-live="polite">
          {progressPercent}% complete
        </p>
        {loadState.status === 'failed' ? (
          <div className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-medium">Embedding model failed to load.</p>
            {loadState.error ? (
              <p className="mt-1 break-words text-xs text-red-700/90">{loadState.error}</p>
            ) : null}
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRetrying ? 'Retrying...' : 'Retry model loading'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

