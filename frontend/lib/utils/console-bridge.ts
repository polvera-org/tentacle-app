'use client'

import { invoke } from '@tauri-apps/api/core'
import { isTauriEnvironment } from './environment'

// Bridge console logs to Tauri backend for better debugging
export function setupConsoleBridge() {
  if (!isTauriEnvironment()) {
    return
  }

  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  }

  console.log = (...args: any[]) => {
    originalConsole.log(...args)
    invoke('log_from_frontend', {
      level: 'info',
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    }).catch(() => {})
  }

  console.error = (...args: any[]) => {
    originalConsole.error(...args)
    invoke('log_from_frontend', {
      level: 'error',
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    }).catch(() => {})
  }

  console.warn = (...args: any[]) => {
    originalConsole.warn(...args)
    invoke('log_from_frontend', {
      level: 'warn',
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    }).catch(() => {})
  }

  console.info = (...args: any[]) => {
    originalConsole.info(...args)
    invoke('log_from_frontend', {
      level: 'info',
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    }).catch(() => {})
  }

  console.log('[ConsoleBridge] Console bridge initialized')
}
