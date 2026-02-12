import { invoke } from '@tauri-apps/api/core'

export const CONFIG_KEY_DOCUMENTS_FOLDER = 'documents_folder'

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
    const configuredFolderPath = await invoke<string | null>('get_config', {
      key: CONFIG_KEY_DOCUMENTS_FOLDER,
    })

    if (configuredFolderPath !== null) {
      const normalized = normalizeFolderPath(configuredFolderPath)
      if (normalized) {
        return normalized
      }
    }

    const defaultPath = await getDefaultDocumentsFolder()
    await invoke('set_config', {
      key: CONFIG_KEY_DOCUMENTS_FOLDER,
      value: defaultPath,
    })

    return defaultPath
  } catch (error) {
    console.error('Failed to get documents folder:', error)
    throw error
  }
}

export async function setDocumentsFolder(path: string): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot set documents folder on server side')
  }

  const normalizedPath = normalizeFolderPath(path)
  if (!normalizedPath) {
    return
  }

  await invoke('set_config', {
    key: CONFIG_KEY_DOCUMENTS_FOLDER,
    value: normalizedPath,
  })
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
