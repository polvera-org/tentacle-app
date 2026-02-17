'use client'

import { createClient } from '@/lib/auth/supabase-client'

export type ProfileRecord = {
  id: string
  email: string
  full_name: string | null
  updated_at: string
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRequiredString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : null
}

function normalizeProfileName(fullName: string): string | null {
  const trimmedFullName = fullName.trim()
  return trimmedFullName.length > 0 ? trimmedFullName : null
}

function parseProfileRow(row: unknown): ProfileRecord | null {
  if (!isObjectRecord(row)) {
    return null
  }

  const id = parseRequiredString(row.id)
  const email = parseRequiredString(row.email)
  const updatedAt = parseRequiredString(row.updated_at)

  if (!id || !email || !updatedAt) {
    return null
  }

  if (!Number.isFinite(Date.parse(updatedAt))) {
    return null
  }

  const fullNameValue = row.full_name
  if (fullNameValue !== null && typeof fullNameValue !== 'string') {
    return null
  }

  return {
    id,
    email,
    full_name: fullNameValue ? normalizeProfileName(fullNameValue) : null,
    updated_at: updatedAt,
  }
}

export async function fetchProfileByUserId(userId: string): Promise<ProfileRecord | null> {
  const normalizedUserId = userId.trim()
  if (!normalizedUserId) {
    console.error('Cannot fetch profile: userId is empty')
    return null
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,updated_at')
    .eq('id', normalizedUserId)
    .maybeSingle()

  if (error) {
    console.error('Failed to fetch profile', {
      code: error.code,
      message: error.message,
      details: error.details,
      userId: normalizedUserId,
    })
    return null
  }

  if (!data) {
    return null
  }

  const parsedProfile = parseProfileRow(data)
  if (!parsedProfile) {
    console.error('Failed to parse fetched profile row', { userId: normalizedUserId })
    return null
  }

  return parsedProfile
}

export async function saveProfileName(params: {
  userId: string
  email: string
  fullName: string
}): Promise<ProfileRecord | null> {
  const normalizedUserId = params.userId.trim()
  const normalizedEmail = params.email.trim()

  if (!normalizedUserId || !normalizedEmail) {
    console.error('Cannot save profile name: required identity values are empty', {
      userId: normalizedUserId,
      email: normalizedEmail,
    })
    return null
  }

  const fullName = normalizeProfileName(params.fullName)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: normalizedUserId,
        email: normalizedEmail,
        full_name: fullName,
      },
      { onConflict: 'id' }
    )
    .select('id,email,full_name,updated_at')
    .maybeSingle()

  if (error) {
    console.error('Failed to save profile name', {
      code: error.code,
      message: error.message,
      details: error.details,
      userId: normalizedUserId,
    })
    return null
  }

  if (!data) {
    return null
  }

  const parsedProfile = parseProfileRow(data)
  if (!parsedProfile) {
    console.error('Failed to parse saved profile row', { userId: normalizedUserId })
    return null
  }

  return parsedProfile
}
