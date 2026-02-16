'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

interface FolderFormDialogProps {
  open: boolean
  mode: 'create' | 'rename'
  initialValue?: string
  parentPath?: string
  isLoading?: boolean
  errorMessage?: string | null
  onSubmit: (name: string) => void
  onCancel: () => void
}

function getDialogText(mode: 'create' | 'rename'): {
  title: string
  actionLabel: string
} {
  if (mode === 'rename') {
    return {
      title: 'Rename folder',
      actionLabel: 'Rename',
    }
  }

  return {
    title: 'Create folder',
    actionLabel: 'Create',
  }
}

export function FolderFormDialog({
  open,
  mode,
  initialValue = '',
  parentPath,
  isLoading = false,
  errorMessage = null,
  onSubmit,
  onCancel,
}: FolderFormDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(() => initialValue)
  const [validationError, setValidationError] = useState<string | null>(null)
  const text = useMemo(() => getDialogText(mode), [mode])

  useEffect(() => {
    if (!open) {
      return
    }

    inputRef.current?.focus()
    inputRef.current?.select()
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) {
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setValidationError('Folder name is required.')
      return
    }

    setValidationError(null)
    onSubmit(normalizedName)
  }

  const helperText = mode === 'create'
    ? parentPath && parentPath.length > 0
      ? `New folder will be created inside "${parentPath}".`
      : 'New folder will be created at the root.'
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <form
        onSubmit={handleSubmit}
        className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-gray-900">{text.title}</h2>
        {helperText ? <p className="mt-2 text-sm text-gray-500">{helperText}</p> : null}
        <label htmlFor="folder-name-input" className="sr-only">
          Folder name
        </label>
        <input
          id="folder-name-input"
          ref={inputRef}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (validationError) {
              setValidationError(null)
            }
          }}
          placeholder="Folder name"
          autoComplete="off"
          disabled={isLoading}
          className="mt-4 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70"
        />
        {validationError ? (
          <p className="mt-2 text-xs text-red-600" role="alert">
            {validationError}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-2 text-xs text-red-600" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="h-10 rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="h-10 rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition-all hover:bg-black focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50"
          >
            {isLoading ? `${text.actionLabel}...` : text.actionLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
