'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getInputDevice, getOpenAIApiKey } from '@/lib/settings/openai-config'

export interface UseVoiceRecordingProps {
  onTranscription: (text: string) => void
  onError?: (message: string) => void
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

function getMicrophoneErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'Microphone permission denied. Please allow microphone access and try again.'
    }

    if (error.name === 'NotFoundError') {
      return 'No microphone found. Connect an input device and try again.'
    }

    if (error.name === 'OverconstrainedError') {
      return 'Saved microphone is unavailable. Update your input device in Settings.'
    }
  }

  return 'Unable to start recording. Please try again.'
}

export function useVoiceRecording({ onTranscription, onError }: UseVoiceRecordingProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const apiKeyRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopMediaTracks = useCallback(() => {
    const stream = mediaStreamRef.current

    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
  }, [])

  const notifyError = useCallback(
    (message: string) => {
      setErrorMessage(message)
      onError?.(message)
    },
    [onError],
  )

  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      const apiKey = apiKeyRef.current
      if (!apiKey) {
        notifyError('OpenAI API key not configured. Set it in Settings.')
        return
      }

      const formData = new FormData()
      formData.append('model', 'whisper-1')
      formData.append('file', new File([audioBlob], 'voice-capture.webm', { type: audioBlob.type || 'audio/webm' }))

      const abortController = new AbortController()
      abortControllerRef.current = abortController
      setIsTranscribing(true)

      try {
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
          signal: abortController.signal,
        })

        if (!response.ok) {
          const responseBody = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          const apiMessage = responseBody?.error?.message?.trim()
          throw new Error(apiMessage || 'Transcription failed. Please try again.')
        }

        const payload = (await response.json()) as { text?: unknown }
        const text = typeof payload.text === 'string' ? payload.text.trim() : ''

        if (text.length > 0) {
          onTranscription(text)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        const message = error instanceof Error ? error.message : 'Network error while transcribing. Please try again.'
        notifyError(message)
      } finally {
        setIsTranscribing(false)
        abortControllerRef.current = null
      }
    },
    [notifyError, onTranscription],
  )

  const stopRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      return
    }

    clearTimer()
    setIsRecording(false)

    try {
      mediaRecorder.stop()
    } catch {
      stopMediaTracks()
      notifyError('Unable to stop recording. Please try again.')
    }
  }, [clearTimer, notifyError, stopMediaTracks])

  const startRecording = useCallback(async () => {
    if (isTranscribing) {
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      notifyError('Voice capture is not supported in this browser.')
      return
    }

    try {
      const apiKey = await getOpenAIApiKey()
      if (!apiKey) {
        notifyError('OpenAI API key not configured. Set it in Settings.')
        return
      }

      apiKeyRef.current = apiKey

      const savedInputDevice = await getInputDevice()
      const audioConstraints: MediaTrackConstraints | boolean = savedInputDevice
        ? { deviceId: { exact: savedInputDevice } }
        : true

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      mediaStreamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onerror = () => {
        clearTimer()
        setIsRecording(false)
        stopMediaTracks()
        notifyError('Recording failed. Please try again.')
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        })

        chunksRef.current = []
        stopMediaTracks()
        setRecordingDuration(0)

        if (audioBlob.size > 0) {
          void transcribeAudio(audioBlob)
        }
      }

      setErrorMessage(null)
      setRecordingDuration(0)
      setIsRecording(true)
      clearTimer()
      timerRef.current = window.setInterval(() => {
        setRecordingDuration((current) => current + 1)
      }, 1000)

      mediaRecorder.start()
    } catch (error) {
      clearTimer()
      setIsRecording(false)
      stopMediaTracks()

      const message = getMicrophoneErrorMessage(error)
      notifyError(message)
    }
  }, [clearTimer, isTranscribing, notifyError, stopMediaTracks, transcribeAudio])

  const clearError = useCallback(() => {
    setErrorMessage(null)
  }, [])

  useEffect(() => {
    return () => {
      clearTimer()
      abortControllerRef.current?.abort()

      const mediaRecorder = mediaRecorderRef.current
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.ondataavailable = null
        mediaRecorder.onstop = null
        mediaRecorder.onerror = null

        try {
          mediaRecorder.stop()
        } catch {
          // no-op cleanup
        }
      }

      stopMediaTracks()
    }
  }, [clearTimer, stopMediaTracks])

  return {
    isRecording,
    isTranscribing,
    recordingDuration,
    errorMessage,
    startRecording,
    stopRecording,
    clearError,
  }
}
