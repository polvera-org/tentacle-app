const DEFAULT_LOCAL_APP_VERSION = '0.0.0'
const DOTTED_NUMERIC_VERSION_PATTERN = /^\d+(?:\.\d+)*$/

function normalizeVersionId(versionId: string): string {
  return versionId.trim()
}

export function isDottedNumericVersion(versionId: string): boolean {
  const normalizedVersionId = normalizeVersionId(versionId)
  return DOTTED_NUMERIC_VERSION_PATTERN.test(normalizedVersionId)
}

export function parseVersionId(versionId: string): number[] {
  const normalizedVersionId = normalizeVersionId(versionId)

  if (!isDottedNumericVersion(normalizedVersionId)) {
    return []
  }

  return normalizedVersionId.split('.').map((segment) => Number.parseInt(segment, 10))
}

export function compareVersionIds(leftVersionId: string, rightVersionId: string): number {
  const leftSegments = parseVersionId(leftVersionId)
  const rightSegments = parseVersionId(rightVersionId)
  const segmentCount = Math.max(leftSegments.length, rightSegments.length)

  for (let index = 0; index < segmentCount; index += 1) {
    const leftValue = leftSegments[index] ?? 0
    const rightValue = rightSegments[index] ?? 0

    if (leftValue > rightValue) {
      return 1
    }

    if (leftValue < rightValue) {
      return -1
    }
  }

  return 0
}

function getFallbackLocalVersion(): string {
  const envVersion = process.env.NEXT_PUBLIC_APP_VERSION
  if (!envVersion) {
    return DEFAULT_LOCAL_APP_VERSION
  }

  const normalizedEnvVersion = normalizeVersionId(envVersion)
  if (isDottedNumericVersion(normalizedEnvVersion)) {
    return normalizedEnvVersion
  }

  return DEFAULT_LOCAL_APP_VERSION
}

export async function getLocalAppVersion(): Promise<string> {
  try {
    const { isTauri } = await import('@tauri-apps/api/core')
    if (!isTauri()) {
      return getFallbackLocalVersion()
    }

    const { getVersion } = await import('@tauri-apps/api/app')
    const tauriVersion = normalizeVersionId(await getVersion())
    if (isDottedNumericVersion(tauriVersion)) {
      return tauriVersion
    }
  } catch {
    // Ignore runtime detection errors and use the configured fallback version.
  }

  return getFallbackLocalVersion()
}
