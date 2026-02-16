'use client'

import { useMemo } from 'react'

import { useVoiceRecording, formatDuration } from '@/hooks/use-voice-recording'
import { ErrorToast } from '@/components/ui/error-toast'

export interface VoiceCaptureProps {
  onTranscription: (text: string) => void
  onError?: (message: string) => void
}

export function VoiceCapture({ onTranscription, onError }: VoiceCaptureProps) {
  const {
    isRecording,
    isTranscribing,
    recordingDuration,
    errorMessage,
    startRecording,
    stopRecording,
    clearError,
  } = useVoiceRecording({ onTranscription, onError })

  const statusMessage = useMemo(() => {
    if (isRecording) {
      return `Recording ${formatDuration(recordingDuration)}`
    }

    if (isTranscribing) {
      return 'Transcribing...'
    }

    return 'Tap to record'
  }, [isRecording, isTranscribing, recordingDuration])

  const handleButtonClick = () => {
    if (isRecording) {
      stopRecording()
      return
    }

    void startRecording()
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleButtonClick}
          disabled={isTranscribing}
          title={isRecording ? 'Stop recording' : 'Start recording'}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          className={`min-w-[44px] h-[44px] rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-brand-600 text-white ring-4 ring-brand-200'
              : 'bg-brand-100 text-brand-700 hover:bg-brand-200'
          } ${isTranscribing ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {isRecording ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="2" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a5.25 5.25 0 0 0 5.25-5.25V8.25a5.25 5.25 0 1 0-10.5 0v5.25A5.25 5.25 0 0 0 12 18.75Zm0 0v2.25m-4.5 0h9" />
            </svg>
          )}
        </button>

        <p className="text-xs text-gray-600 min-h-[20px]">{statusMessage}</p>
      </div>

      {errorMessage ? <ErrorToast message={errorMessage} onDismiss={clearError} /> : null}
    </>
  )
}
