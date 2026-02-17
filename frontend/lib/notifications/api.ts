'use client'

import { createClient } from '@/lib/auth/supabase-client'
import { compareVersionIds, isDottedNumericVersion } from '@/lib/notifications/version'
import type { UpdateNotificationData } from '@/types/notifications'

type LatestUpdateNotification = UpdateNotificationData & { id: string; created_at: string }

interface ParsedUpdateRow {
  id: string
  created_at: string
  createdAtTimestamp: number
  version_id: string
  title?: string
  message?: string
  release_url?: string
}

const FALLBACK_LOCAL_VERSION = '0.0.0'

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function parseUpdateRow(row: unknown): ParsedUpdateRow | null {
  if (!isObjectRecord(row)) {
    return null
  }

  const id = parseOptionalString(row.id)
  const createdAt = parseOptionalString(row.created_at)
  const notificationType = row.notification_type
  const userId = row.user_id
  const notificationData = row.notification_data

  if (!id || !createdAt || notificationType !== 'UPDATE') {
    return null
  }

  if (userId !== null && typeof userId !== 'string') {
    return null
  }

  const createdAtTimestamp = Date.parse(createdAt)
  if (!Number.isFinite(createdAtTimestamp)) {
    return null
  }

  if (!isObjectRecord(notificationData)) {
    return null
  }

  const versionId = parseOptionalString(notificationData.version_id)
  if (!versionId || !isDottedNumericVersion(versionId)) {
    return null
  }

  return {
    id,
    created_at: createdAt,
    createdAtTimestamp,
    version_id: versionId,
    title: parseOptionalString(notificationData.title),
    message: parseOptionalString(notificationData.message),
    release_url: parseOptionalString(notificationData.release_url),
  }
}

function normalizeLocalVersion(localVersion: string): string {
  const trimmedLocalVersion = localVersion.trim()
  if (!isDottedNumericVersion(trimmedLocalVersion)) {
    return FALLBACK_LOCAL_VERSION
  }

  return trimmedLocalVersion
}

async function fetchUpdateRowsForUser(userId: string | null): Promise<unknown[]> {
  const supabase = createClient()
  const baseQuery = () =>
    supabase
      .from('notifications')
      .select('id,user_id,notification_type,notification_data,created_at')
      .eq('notification_type', 'UPDATE')

  if (!userId) {
    const { data, error } = await baseQuery().is('user_id', null)
    if (error) {
      console.error('Failed to fetch global update notifications', {
        code: error.code,
        message: error.message,
        details: error.details,
      })
      return []
    }

    return data ?? []
  }

  const [globalResult, userResult] = await Promise.all([
    baseQuery().is('user_id', null),
    baseQuery().eq('user_id', userId),
  ])

  if (globalResult.error || userResult.error) {
    console.error('Failed to fetch visible update notifications', {
      globalError: globalResult.error
        ? {
            code: globalResult.error.code,
            message: globalResult.error.message,
            details: globalResult.error.details,
          }
        : null,
      userError: userResult.error
        ? {
            code: userResult.error.code,
            message: userResult.error.message,
            details: userResult.error.details,
          }
        : null,
      userId,
    })
    return []
  }

  return [...(globalResult.data ?? []), ...(userResult.data ?? [])]
}

export async function fetchLatestUpdateNotification(params: {
  userId: string | null
  localVersion: string
}): Promise<LatestUpdateNotification | null> {
  const { userId, localVersion } = params
  const normalizedLocalVersion = normalizeLocalVersion(localVersion)
  const rows = await fetchUpdateRowsForUser(userId)

  let selectedNotification: ParsedUpdateRow | null = null

  for (const row of rows) {
    const parsedRow = parseUpdateRow(row)
    if (!parsedRow) {
      continue
    }

    if (compareVersionIds(parsedRow.version_id, normalizedLocalVersion) <= 0) {
      continue
    }

    if (!selectedNotification) {
      selectedNotification = parsedRow
      continue
    }

    const versionComparison = compareVersionIds(
      parsedRow.version_id,
      selectedNotification.version_id
    )

    if (versionComparison > 0) {
      selectedNotification = parsedRow
      continue
    }

    if (
      versionComparison === 0 &&
      parsedRow.createdAtTimestamp > selectedNotification.createdAtTimestamp
    ) {
      selectedNotification = parsedRow
    }
  }

  if (!selectedNotification) {
    return null
  }

  return {
    id: selectedNotification.id,
    created_at: selectedNotification.created_at,
    version_id: selectedNotification.version_id,
    title: selectedNotification.title,
    message: selectedNotification.message,
    release_url: selectedNotification.release_url,
  }
}
