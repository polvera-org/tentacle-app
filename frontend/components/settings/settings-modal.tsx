'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { getDocumentsFolderAsync, pickDocumentsFolder, setDocumentsFolder } from '@/lib/settings/documents-folder'
import { getInputDevice, getOpenAIApiKey, setInputDevice, setOpenAIApiKey } from '@/lib/settings/openai-config'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

interface InputDeviceOption {
  deviceId: string
  label: string
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [documentsFolder, setDocumentsFolderState] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [inputDevice, setInputDeviceState] = useState('')
  const [availableDevices, setAvailableDevices] = useState<InputDeviceOption[]>([])
  const [isPickingFolder, setIsPickingFolder] = useState(false)
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)

  useEffect(() => {
    if (!open) return

    const loadSettings = async () => {
      const [folderResult, apiKeyResult, inputDeviceResult] = await Promise.allSettled([
        getDocumentsFolderAsync(),
        getOpenAIApiKey(),
        getInputDevice(),
      ])

      if (folderResult.status === 'fulfilled') {
        setDocumentsFolderState(folderResult.value)
      } else {
        console.error('Failed to load documents folder:', folderResult.reason)
        setDocumentsFolderState(null)
      }

      if (apiKeyResult.status === 'fulfilled') {
        setApiKey(apiKeyResult.value ?? '')
      } else {
        console.error('Failed to load OpenAI API key:', apiKeyResult.reason)
        setApiKey('')
      }

      if (inputDeviceResult.status === 'fulfilled') {
        setInputDeviceState(inputDeviceResult.value ?? '')
      } else {
        console.error('Failed to load input device:', inputDeviceResult.reason)
        setInputDeviceState('')
      }

      if (!navigator.mediaDevices?.enumerateDevices) {
        setAvailableDevices([])
        return
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const microphones = devices
          .filter((device) => device.kind === 'audioinput')
          .filter((device) => device.deviceId.trim().length > 0)
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label.trim() || `Microphone ${index + 1}`,
          }))

        setAvailableDevices(microphones)
      } catch (error) {
        console.error('Failed to enumerate input devices:', error)
        setAvailableDevices([])
      }
    }

    loadSettings()
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

      await setDocumentsFolder(selectedFolder)
      setDocumentsFolderState(selectedFolder)

      // Notify the app that documents folder has changed
      window.dispatchEvent(new CustomEvent('documents-folder-changed'))
    } finally {
      setIsPickingFolder(false)
    }
  }

  async function handleApiKeyBlur() {
    setIsSavingApiKey(true)
    try {
      await setOpenAIApiKey(apiKey)
    } catch (error) {
      console.error('Failed to save OpenAI API key:', error)
    } finally {
      setIsSavingApiKey(false)
    }
  }

  async function handleInputDeviceChange(event: ChangeEvent<HTMLSelectElement>) {
    const selectedInputDevice = event.target.value
    setInputDeviceState(selectedInputDevice)

    try {
      await setInputDevice(selectedInputDevice)
    } catch (error) {
      console.error('Failed to save input device:', error)
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
          Configure your documents folder, voice input, and API keys.
        </p>

        <div className="mt-5 rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-900">Documents folder</p>
          <p className="mt-2 text-sm text-gray-600 break-all">
            {documentsFolder ?? 'No folder selected'}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 p-4">
          <label htmlFor="openai-api-key" className="text-sm font-medium text-gray-900">
            OpenAI API Key
          </label>
          <p className="mt-1 text-sm text-gray-600">
            Required for voice transcription. Your key is stored locally.
          </p>
          <input
            id="openai-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onBlur={handleApiKeyBlur}
            placeholder="sk-..."
            autoComplete="off"
            disabled={isSavingApiKey}
            className="mt-3 h-11 w-full rounded-full border border-gray-300 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50"
          />
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 p-4">
          <label htmlFor="input-device" className="text-sm font-medium text-gray-900">
            Input Device
          </label>
          <select
            id="input-device"
            value={inputDevice}
            onChange={handleInputDeviceChange}
            className="mt-3 h-11 w-full rounded-full border border-gray-300 bg-white px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
          >
            <option value="">Default</option>
            {availableDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
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
