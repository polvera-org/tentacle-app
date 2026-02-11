'use client'

import { useEffect, useRef, useState } from 'react'
import { getDocumentsFolder, getDocumentsFolderAsync, pickDocumentsFolder, setDocumentsFolder } from '@/lib/settings/documents-folder'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [documentsFolder, setDocumentsFolderState] = useState<string | null>(null)
  const [isPickingFolder, setIsPickingFolder] = useState(false)
  const [isLoadingFolder, setIsLoadingFolder] = useState(false)

  useEffect(() => {
    if (!open) return

    const loadFolder = async () => {
      setIsLoadingFolder(true)
      try {
        // First check if user has manually set a folder
        const storedFolder = getDocumentsFolder()
        if (storedFolder) {
          setDocumentsFolderState(storedFolder)
        } else {
          // Get the default folder (will be created if needed)
          const defaultFolder = await getDocumentsFolderAsync()
          setDocumentsFolderState(defaultFolder)
        }
      } catch (error) {
        console.error('Failed to load documents folder:', error)
        setDocumentsFolderState(null)
      } finally {
        setIsLoadingFolder(false)
      }
    }

    loadFolder()
    closeButtonRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  async function handleChooseFolder() {
    setIsPickingFolder(true)
    try {
      const selectedFolder = await pickDocumentsFolder()
      if (!selectedFolder) return

      setDocumentsFolder(selectedFolder)
      setDocumentsFolderState(selectedFolder)
    } finally {
      setIsPickingFolder(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6"
      >
        <h3 id="settings-modal-title" className="text-lg font-semibold text-gray-900">
          Settings
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Choose where your documents are stored on this device.
        </p>

        <div className="mt-5 rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-900">Documents folder</p>
          <p className="mt-2 text-sm text-gray-600 break-all">
            {documentsFolder ?? 'No folder selected'}
          </p>
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <button
            ref={closeButtonRef}
            onClick={onClose}
            disabled={isPickingFolder}
            className="h-11 px-4 text-sm font-medium text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={handleChooseFolder}
            disabled={isPickingFolder}
            className="h-11 px-4 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isPickingFolder ? 'Choosing...' : 'Choose Folder'}
          </button>
        </div>
      </div>
    </div>
  )
}
