'use client'

import { useVoiceRecording, formatDuration } from '@/hooks/use-voice-recording'
import { ErrorToast } from '@/components/ui/error-toast'

interface InputSourceCardsProps {
  onVoiceTranscription: (text: string) => void
}

function VoiceIllustration({ isRecording = false }: { isRecording?: boolean }) {
  if (isRecording) {
    // Stop icon - clean red square
    return (
      <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Stop button - filled red square */}
        <rect x="32" y="32" width="32" height="32" rx="6" fill="#dc2626" stroke="#b91c1c" strokeWidth="3" />
      </svg>
    )
  }

  // Microphone icon - default state
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Outer sound waves */}
      <path
        d="M68 32c5.523 4.418 9 11.243 9 16s-3.477 11.582-9 16"
        stroke="#ddd6fe"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M28 32c-5.523 4.418-9 11.243-9 16s3.477 11.582 9 16"
        stroke="#ddd6fe"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Inner sound waves */}
      <path
        d="M60 38c3.314 2.65 5.5 6.746 5.5 10s-2.186 7.35-5.5 10"
        stroke="#c4b5fd"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M36 38c-3.314 2.65-5.5 6.746-5.5 10s2.186 7.35 5.5 10"
        stroke="#c4b5fd"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Microphone body */}
      <rect x="40" y="28" width="16" height="28" rx="8" fill="#ede9fe" stroke="#7c3aed" strokeWidth="2" />
      {/* Microphone stand */}
      <path d="M48 60v10" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
      <path d="M42 70h12" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
      {/* Microphone base arc */}
      <path
        d="M35 48c0 7.18 5.82 13 13 13s13-5.82 13-13"
        stroke="#7c3aed"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Decorative dots */}
      <circle cx="44" cy="38" r="1.5" fill="#7c3aed" opacity="0.5" />
      <circle cx="48" cy="35" r="1.5" fill="#7c3aed" opacity="0.5" />
      <circle cx="52" cy="38" r="1.5" fill="#7c3aed" opacity="0.5" />
    </svg>
  )
}

function LinkIllustration() {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Globe */}
      <circle cx="48" cy="44" r="20" fill="#ede9fe" stroke="#7c3aed" strokeWidth="2" />
      {/* Globe latitude lines */}
      <ellipse cx="48" cy="44" rx="20" ry="8" stroke="#c4b5fd" strokeWidth="1.5" fill="none" />
      <ellipse cx="48" cy="44" rx="10" ry="20" stroke="#c4b5fd" strokeWidth="1.5" fill="none" />
      {/* Globe vertical line */}
      <line x1="48" y1="24" x2="48" y2="64" stroke="#c4b5fd" strokeWidth="1.5" />
      {/* Globe horizontal line */}
      <line x1="28" y1="44" x2="68" y2="44" stroke="#c4b5fd" strokeWidth="1.5" />
      {/* Link chain icon */}
      <g transform="translate(54, 56)">
        <rect x="0" y="0" width="20" height="12" rx="6" fill="white" stroke="#7c3aed" strokeWidth="2" />
        <rect x="-4" y="4" width="20" height="12" rx="6" fill="white" stroke="#7c3aed" strokeWidth="2" />
        <line x1="10" y1="6" x2="10" y2="14" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* Decorative signal lines */}
      <path d="M22 30l-4-4" stroke="#ddd6fe" strokeWidth="2" strokeLinecap="round" />
      <path d="M74 30l4-4" stroke="#ddd6fe" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 58l-4 4" stroke="#ddd6fe" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function FileIllustration() {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Shadow/back document */}
      <rect x="32" y="18" width="36" height="46" rx="4" fill="#ede9fe" stroke="#ddd6fe" strokeWidth="1.5" />
      {/* Main document */}
      <rect x="28" y="22" width="36" height="46" rx="4" fill="white" stroke="#7c3aed" strokeWidth="2" />
      {/* Document fold corner */}
      <path d="M52 22v10a2 2 0 002 2h10" stroke="#7c3aed" strokeWidth="2" fill="#ede9fe" />
      <path d="M52 22l12 12" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
      {/* Document lines */}
      <line x1="34" y1="42" x2="50" y2="42" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" />
      <line x1="34" y1="48" x2="56" y2="48" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" />
      <line x1="34" y1="54" x2="46" y2="54" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" />
      {/* Upload arrow */}
      <g transform="translate(48, 62)">
        <circle cx="12" cy="8" r="12" fill="#ede9fe" stroke="#7c3aed" strokeWidth="2" />
        <path d="M12 14V3" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 6l4-4 4 4" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export function InputSourceCards({ onVoiceTranscription }: InputSourceCardsProps) {
  const {
    isRecording,
    isTranscribing,
    recordingDuration,
    errorMessage,
    startRecording,
    stopRecording,
    clearError,
  } = useVoiceRecording({ onTranscription: onVoiceTranscription })

  const sources = [
    {
      title: 'Voice',
      description: 'Capture ephemeral thoughts',
      Illustration: VoiceIllustration,
      onClick: () => {
        if (isRecording) {
          stopRecording()
        } else if (!isTranscribing) {
          void startRecording()
        }
      },
      isActive: isRecording || isTranscribing,
      statusText: isRecording
        ? `Recording ${formatDuration(recordingDuration)}`
        : isTranscribing
        ? 'Transcribing...'
        : undefined,
      illustrationProps: { isRecording },
    },
    {
      title: 'Link',
      description: 'Source any video, article or site as a document',
      Illustration: LinkIllustration,
      onClick: undefined,
      isActive: false,
      statusText: undefined,
      illustrationProps: {},
    },
    {
      title: 'File',
      description: 'Upload an existing document',
      Illustration: FileIllustration,
      onClick: undefined,
      isActive: false,
      statusText: undefined,
      illustrationProps: {},
    },
  ]

  return (
    <>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {sources.map((source) => (
          <button
            key={source.title}
            type="button"
            onClick={source.onClick}
            disabled={!source.onClick || (source.title === 'Voice' && isTranscribing)}
            className={`border rounded-2xl p-6 flex flex-col items-center text-center transition-all ${
              source.onClick
                ? 'cursor-pointer hover:border-brand-300 hover:shadow-sm'
                : 'cursor-default opacity-60'
            } ${
              source.isActive && source.title === 'Voice' && isRecording
                ? 'border-red-500 bg-red-50 shadow-md'
                : source.isActive
                ? 'border-brand-500 bg-brand-50 shadow-md'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="w-24 h-24 mb-4">
              <source.Illustration {...source.illustrationProps} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{source.title}</h3>
            <p className="text-xs text-gray-500">
              {source.statusText || source.description}
            </p>
          </button>
        ))}
      </div>

      {errorMessage ? <ErrorToast message={errorMessage} onDismiss={clearError} /> : null}
    </>
  )
}
