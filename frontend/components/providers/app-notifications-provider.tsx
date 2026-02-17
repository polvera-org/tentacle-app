'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { fetchLatestUpdateNotification } from '@/lib/notifications/api'
import { getLocalAppVersion } from '@/lib/notifications/version'

type ActiveUpdateNotification = NonNullable<
  Awaited<ReturnType<typeof fetchLatestUpdateNotification>>
>

interface AppNotificationsContextValue {
  activeUpdateNotification: ActiveUpdateNotification | null
  dismissActiveUpdateNotification: () => void
  refreshUpdateNotification: () => Promise<void>
}

const ONE_DAY_MILLISECONDS = 24 * 60 * 60 * 1000
const UPDATE_DISMISSAL_STORAGE_KEY_PREFIX = 'tentacle.notifications.dismissed.update.'

const AppNotificationsContext = createContext<AppNotificationsContextValue | undefined>(undefined)

interface AppNotificationsProviderProps {
  children: ReactNode
}

function getUpdateDismissalStorageKey(versionId: string): string {
  return `${UPDATE_DISMISSAL_STORAGE_KEY_PREFIX}${versionId}`
}

function readDismissedUntilTimestamp(versionId: string): number | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storageKey = getUpdateDismissalStorageKey(versionId)

  try {
    const rawValue = window.localStorage.getItem(storageKey)
    if (!rawValue) {
      return null
    }

    const dismissedUntilTimestamp = Number.parseInt(rawValue, 10)
    if (!Number.isFinite(dismissedUntilTimestamp)) {
      window.localStorage.removeItem(storageKey)
      return null
    }

    return dismissedUntilTimestamp
  } catch {
    return null
  }
}

function dismissUpdateForOneDay(versionId: string, nowTimestamp: number): void {
  if (typeof window === 'undefined') {
    return
  }

  const storageKey = getUpdateDismissalStorageKey(versionId)
  const dismissedUntilTimestamp = nowTimestamp + ONE_DAY_MILLISECONDS

  try {
    window.localStorage.setItem(storageKey, String(dismissedUntilTimestamp))
  } catch {
    // Ignore storage write failures and continue as non-persistent dismissal.
  }
}

function isUpdateDismissed(versionId: string, nowTimestamp: number): boolean {
  const dismissedUntilTimestamp = readDismissedUntilTimestamp(versionId)
  if (!dismissedUntilTimestamp) {
    return false
  }

  if (dismissedUntilTimestamp > nowTimestamp) {
    return true
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(getUpdateDismissalStorageKey(versionId))
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  return false
}

export function AppNotificationsProvider({ children }: AppNotificationsProviderProps) {
  const { user, isLoading } = useAuth()
  const [activeUpdateNotification, setActiveUpdateNotification] = useState<ActiveUpdateNotification | null>(null)
  const userId = user?.id ?? null
  const requestSequenceRef = useRef(0)
  const localVersionRef = useRef<string | null>(null)

  const refreshUpdateNotification = useCallback(async () => {
    if (isLoading) {
      return
    }

    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId

    try {
      if (!localVersionRef.current) {
        localVersionRef.current = await getLocalAppVersion()
      }

      const latestUpdate = await fetchLatestUpdateNotification({
        userId,
        localVersion: localVersionRef.current,
      })

      if (requestId !== requestSequenceRef.current) {
        return
      }

      if (!latestUpdate) {
        setActiveUpdateNotification(null)
        return
      }

      const nowTimestamp = Date.now()
      if (isUpdateDismissed(latestUpdate.version_id, nowTimestamp)) {
        setActiveUpdateNotification(null)
        return
      }

      setActiveUpdateNotification(latestUpdate)
    } catch (error) {
      console.error('[notifications][provider] failed to refresh update notification', {
        userId,
        error,
      })
    }
  }, [isLoading, userId])

  useEffect(() => {
    if (isLoading) {
      return
    }

    let isDisposed = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const runRefresh = async () => {
      if (isDisposed) {
        return
      }

      await refreshUpdateNotification()
    }

    void runRefresh()
    intervalId = setInterval(() => {
      void runRefresh()
    }, ONE_DAY_MILLISECONDS)

    return () => {
      isDisposed = true

      if (intervalId) {
        clearInterval(intervalId)
      }

      requestSequenceRef.current += 1
    }
  }, [isLoading, refreshUpdateNotification])

  const dismissActiveUpdateNotification = useCallback(() => {
    setActiveUpdateNotification((currentNotification) => {
      if (!currentNotification) {
        return currentNotification
      }

      dismissUpdateForOneDay(currentNotification.version_id, Date.now())
      return null
    })
  }, [])

  const contextValue = useMemo<AppNotificationsContextValue>(() => ({
    activeUpdateNotification,
    dismissActiveUpdateNotification,
    refreshUpdateNotification,
  }), [activeUpdateNotification, dismissActiveUpdateNotification, refreshUpdateNotification])

  return (
    <AppNotificationsContext.Provider value={contextValue}>
      {children}
    </AppNotificationsContext.Provider>
  )
}

export function useAppNotifications(): AppNotificationsContextValue {
  const context = useContext(AppNotificationsContext)
  if (!context) {
    throw new Error('useAppNotifications must be used within an AppNotificationsProvider')
  }

  return context
}
