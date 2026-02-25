'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { listen } from '@tauri-apps/api/event'
import { getCurrent } from '@tauri-apps/plugin-deep-link'
import { isTauriEnvironment } from '@/lib/utils/environment'
import { createClient } from './supabase-client'

export function DeepLinkHandler() {
  const router = useRouter()

  const handleDeepLinkUrl = async (url: string) => {
    console.log('[DeepLinkHandler] Processing URL:', url)

    try {
      const urlObj = new URL(url)
      console.log('[DeepLinkHandler] Pathname:', urlObj.pathname, 'Hash:', urlObj.hash)

      // Handle OAuth callback - pathname can be /callback or /auth/callback
      if (urlObj.pathname === '/callback' || urlObj.pathname === '/auth/callback') {
        console.log('[DeepLinkHandler] OAuth callback detected')
        // Supabase returns tokens in the hash fragment for implicit flow
        const hashParams = new URLSearchParams(urlObj.hash.slice(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        console.log('[DeepLinkHandler] Tokens extracted from deep link:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken
        })

        if (accessToken && refreshToken) {
          // Set the session with the tokens
          const supabase = createClient()
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (error) {
            console.error('[DeepLinkHandler] Failed to set session from deep link:', error)
            return
          }

          console.log('[DeepLinkHandler] Session set successfully from deep link:', data)

          // Navigate to the app
          router.push('/app')
        } else {
          console.error('[DeepLinkHandler] Missing tokens in deep link callback')
        }
      }
    } catch (err) {
      console.error('[DeepLinkHandler] Error processing deep link:', err)
    }
  }

  useEffect(() => {
    // Only set up listener in Tauri environment
    if (!isTauriEnvironment()) {
      console.log('[DeepLinkHandler] Not in Tauri environment, skipping setup')
      return
    }

    console.log('[DeepLinkHandler] Setting up deep link listener...')
    let unlisten: (() => void) | null = null

    const setupListener = async () => {
      try {
        // First, check if there's a pending deep link (app opened via deep link)
        console.log('[DeepLinkHandler] Checking for initial deep link URLs...')
        try {
          const urls = await getCurrent()
          console.log('[DeepLinkHandler] Initial URLs:', urls)
          if (urls && urls.length > 0) {
            console.log('[DeepLinkHandler] Processing initial deep link')
            await handleDeepLinkUrl(urls[0])
          }
        } catch (err) {
          console.log('[DeepLinkHandler] No initial deep link or error:', err)
        }

        // Then set up listener for future deep links
        console.log('[DeepLinkHandler] Registering deep-link://new-url listener')
        unlisten = await listen<string[]>('deep-link://new-url', async (event) => {
          console.log('[DeepLinkHandler] Deep link event received:', event.payload)

          try {
            const urls = event.payload
            if (!urls || urls.length === 0) {
              console.error('[DeepLinkHandler] No URLs in deep link event')
              return
            }

            await handleDeepLinkUrl(urls[0])
          } catch (err) {
            console.error('[DeepLinkHandler] Error in deep link event handler:', err)
          }
        })
        console.log('[DeepLinkHandler] Deep link listener registered successfully')
      } catch (err) {
        console.error('[DeepLinkHandler] Failed to set up deep link listener:', err)
      }
    }

    setupListener()

    // Cleanup
    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [router])

  return null
}
