export const DOCUMENTS_FOLDER_STORAGE_KEY = 'tentacle.documents-folder'

function normalizeFolderPath(path: string): string | null {
  const normalizedPath = path.trim()
  return normalizedPath.length > 0 ? normalizedPath : null
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
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: 'Choose Documents Folder',
    })

    if (typeof selectedPath !== 'string') {
      return null
    }

    return normalizeFolderPath(selectedPath)
  } catch {
    return null
  }
}
