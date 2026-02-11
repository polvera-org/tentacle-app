export const DOCUMENTS_FOLDER_STORAGE_KEY = 'tentacle.documents-folder'

function normalizeFolderPath(path: string): string | null {
  const normalizedPath = path.trim()
  return normalizedPath.length > 0 ? normalizedPath : null
}

async function getDefaultDocumentsFolder(): Promise<string> {
  try {
    const { homeDir, join } = await import('@tauri-apps/api/path')
    const fs = await import('@tauri-apps/plugin-fs')

    const homePath = await homeDir()
    const defaultPath = await join(homePath, 'Tentacle')

    // Ensure the default directory exists
    const dirExists = await fs.exists(defaultPath)
    if (!dirExists) {
      await fs.mkdir(defaultPath, { recursive: true })
    }

    return defaultPath
  } catch (error) {
    console.error('Failed to get default documents folder:', error)
    throw error
  }
}

export async function getDocumentsFolderAsync(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot access documents folder on server side')
  }

  try {
    const storedFolderPath = window.localStorage.getItem(DOCUMENTS_FOLDER_STORAGE_KEY)
    if (storedFolderPath) {
      const normalized = normalizeFolderPath(storedFolderPath)
      if (normalized) {
        return normalized
      }
    }

    // No folder configured, use default
    return await getDefaultDocumentsFolder()
  } catch (error) {
    console.error('Failed to get documents folder:', error)
    throw error
  }
}

export function getDocumentsFolder(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const storedFolderPath = window.localStorage.getItem(DOCUMENTS_FOLDER_STORAGE_KEY)
    if (!storedFolderPath) {
      return null
    }

    return normalizeFolderPath(storedFolderPath)
  } catch {
    return null
  }
}

export function setDocumentsFolder(path: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedPath = normalizeFolderPath(path)
  if (!normalizedPath) {
    return
  }

  try {
    window.localStorage.setItem(DOCUMENTS_FOLDER_STORAGE_KEY, normalizedPath)
  } catch {
    // Ignore storage failures (private mode, quota errors, etc.)
  }
}

export async function pickDocumentsFolder(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const { invoke, isTauri } = await import('@tauri-apps/api/core')
    if (!isTauri()) {
      return null
    }

    let selectedPath: string | string[] | null
    try {
      selectedPath = await invoke<string | string[] | null>('plugin:dialog|open', {
        options: {
          directory: true,
          multiple: false,
          title: 'Choose Documents Folder',
        },
      })
    } catch {
      selectedPath = await invoke<string | string[] | null>('plugin:dialog|open', {
        directory: true,
        multiple: false,
        title: 'Choose Documents Folder',
      })
    }

    if (typeof selectedPath !== 'string') {
      return null
    }

    return normalizeFolderPath(selectedPath)
  } catch {
    return null
  }
}
