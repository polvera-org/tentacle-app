'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface GridCreateMenuProps {
  open: boolean
  x: number
  y: number
  onCreateNote: () => void
  onCreateFolder: () => void
  onClose: () => void
}

interface Position {
  x: number
  y: number
}

const VIEWPORT_MARGIN = 8

export function GridCreateMenu({
  open,
  x,
  y,
  onCreateNote,
  onCreateFolder,
  onClose,
}: GridCreateMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position>({ x, y })

  useLayoutEffect(() => {
    if (!open) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const menuElement = menuRef.current
      if (!menuElement) {
        setPosition({ x, y })
        return
      }

      const bounds = menuElement.getBoundingClientRect()
      const maxX = Math.max(
        VIEWPORT_MARGIN,
        window.innerWidth - bounds.width - VIEWPORT_MARGIN,
      )
      const maxY = Math.max(
        VIEWPORT_MARGIN,
        window.innerHeight - bounds.height - VIEWPORT_MARGIN,
      )

      setPosition({
        x: Math.min(Math.max(VIEWPORT_MARGIN, x), maxX),
        y: Math.min(Math.max(VIEWPORT_MARGIN, y), maxY),
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [open, x, y])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleDocumentPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (menuRef.current?.contains(target)) {
        return
      }

      onClose()
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleDocumentPointer)
    document.addEventListener('touchstart', handleDocumentPointer)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentPointer)
      document.removeEventListener('touchstart', handleDocumentPointer)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Create new"
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-40 w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={onCreateNote}
        className="flex h-10 w-full items-center rounded-lg px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      >
        Create document
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onCreateFolder}
        className="flex h-10 w-full items-center rounded-lg px-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
      >
        Create folder
      </button>
    </div>
  )
}
