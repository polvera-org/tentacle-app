import { isTauri } from '@tauri-apps/api/core'

export function getAuthRedirectUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000/auth/callback'
  }

  if (isTauri()) {
    return 'tentacle://auth/callback'
  }

  return `${window.location.origin}/auth/callback`
}

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && isTauri()
}
