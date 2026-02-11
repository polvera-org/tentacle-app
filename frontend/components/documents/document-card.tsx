'use client'

import Link from 'next/link'
import type { DocumentListItem } from '@/types/documents'

interface DocumentCardProps {
  document: DocumentListItem
}

interface TiptapNode {
  text?: string
  content?: TiptapNode[]
}

function extractPreviewText(body: string, maxLength: number): string {
  if (!body) return ''
  try {
    const json: TiptapNode = JSON.parse(body)
    const texts: string[] = []
    function walk(node: TiptapNode) {
      if (node.text) texts.push(node.text)
      if (node.content) node.content.forEach(walk)
    }
    walk(json)
    const full = texts.join(' ')
    return full.length > maxLength ? full.slice(0, maxLength) + '...' : full
  } catch {
    return body.length > maxLength ? body.slice(0, maxLength) + '...' : body
  }
}

export function DocumentCard({ document }: DocumentCardProps) {
  const bodyPreview = extractPreviewText(document.body, 120)

  return (
    <Link
      href={`/app/documents?id=${document.id}`}
      className="block h-48 border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-gray-300 transition-all group"
    >
      {document.banner_image_url ? (
        <div className="h-20 bg-gray-100 overflow-hidden">
          <img
            src={document.banner_image_url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="h-20 bg-gray-50 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </div>
      )}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 text-sm truncate">
          {document.title || 'Untitled'}
        </h3>
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
          {bodyPreview || 'Empty document'}
        </p>
      </div>
    </Link>
  )
}
