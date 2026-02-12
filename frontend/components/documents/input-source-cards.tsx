'use client'

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

const sources = [
  {
    title: 'Link',
    description: 'Source any video, article or site as a document',
    Illustration: LinkIllustration,
  },
  {
    title: 'File',
    description: 'Upload an existing document',
    Illustration: FileIllustration,
  },
]

export function InputSourceCards() {
  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {sources.map((source) => (
        <div
          key={source.title}
          className="border border-gray-200 rounded-2xl p-6 flex flex-col items-center text-center hover:border-violet-300 hover:shadow-sm transition-all cursor-default"
        >
          <div className="w-24 h-24 mb-4">
            <source.Illustration />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">{source.title}</h3>
          <p className="text-xs text-gray-500">{source.description}</p>
        </div>
      ))}
    </div>
  )
}
