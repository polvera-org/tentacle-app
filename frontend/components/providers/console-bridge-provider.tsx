'use client'

import { useEffect } from 'react'
import { setupConsoleBridge } from '@/lib/utils/console-bridge'

export function ConsoleBridgeProvider() {
  useEffect(() => {
    setupConsoleBridge()
  }, [])

  return null
}
