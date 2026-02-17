'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { fetchProfileByUserId, saveProfileName } from '@/lib/account/profile'
import { getProWaitlistUrl } from '@/lib/account/pro-plan'

interface MyAccountModalProps {
  open: boolean
  onClose: () => void
}

type SaveStatus =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }
  | null

function getMetadataFullName(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : ''
}

export function MyAccountModal({ open, onClose }: MyAccountModalProps) {
  const { user, isLoading, signOut } = useAuth()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [fullName, setFullName] = useState('')
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null)
  const proWaitlistUrl = getProWaitlistUrl()

  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return

    setSaveStatus(null)

    if (!user) {
      setFullName('')
      setIsProfileLoading(false)
      return
    }

    let disposed = false
    const metadataFullName = getMetadataFullName(user.user_metadata?.full_name)

    setIsProfileLoading(true)
    void (async () => {
      const profile = await fetchProfileByUserId(user.id)
      if (disposed) {
        return
      }

      setFullName(profile?.full_name ?? metadataFullName)
      setIsProfileLoading(false)
    })()

    return () => {
      disposed = true
    }
  }, [open, user?.id])

  async function handleSave() {
    if (!user) {
      setSaveStatus({ type: 'error', message: 'Sign in to update your account details.' })
      return
    }

    const email = user.email?.trim() ?? ''
    if (!email) {
      setSaveStatus({ type: 'error', message: 'No email is available for this account.' })
      return
    }

    setIsSaving(true)
    setSaveStatus(null)

    try {
      const updatedProfile = await saveProfileName({
        userId: user.id,
        email,
        fullName,
      })

      if (!updatedProfile) {
        setSaveStatus({ type: 'error', message: 'Could not save your name right now. Please try again.' })
        return
      }

      setFullName(updatedProfile.full_name ?? '')
      setSaveStatus({ type: 'success', message: 'Profile updated.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleLogout() {
    await signOut()
    onClose()
  }

  if (!open) return null

  const disableForm = isLoading || isProfileLoading || isSaving || !user
  const emailText = user?.email ?? 'Not available'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-account-modal-title"
        className="relative mx-4 flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl"
      >
        <div className="border-b border-gray-200 p-6">
          <h3 id="my-account-modal-title" className="text-lg font-semibold text-gray-900">
            My account
          </h3>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="rounded-xl border border-gray-200 p-4">
            <label htmlFor="my-account-full-name" className="text-sm font-medium text-gray-900">
              Full name
            </label>
            <input
              id="my-account-full-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value)
                setSaveStatus(null)
              }}
              disabled={disableForm}
              className="mt-3 h-11 w-full rounded-full border border-gray-300 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
              placeholder="Your name"
            />
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-900">Email</p>
            <p className="mt-2 break-all text-sm text-gray-600">{emailText}</p>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gray-900">Plan</p>
              <span className="inline-flex h-7 items-center rounded-full bg-gray-100 px-3 text-xs font-medium text-gray-700">
                Free plan
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">Cloud sync is part of Pro. Join the waitlist for early access.</p>
            {proWaitlistUrl ? (
              <a
                href={proWaitlistUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full bg-brand-600 px-4 text-sm font-medium text-white transition-all hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              >
                Join Pro waitlist
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full bg-brand-600 px-4 text-sm font-medium text-white opacity-50"
              >
                Join Pro waitlist
              </button>
            )}
          </div>

          {isLoading && <p className="text-sm text-gray-600">Loading account...</p>}
          {!isLoading && !user && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              Sign in to edit your account details.
            </p>
          )}
          {saveStatus && (
            <p
              role="status"
              aria-live="polite"
              className={`rounded-xl border p-3 text-sm ${
                saveStatus.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {saveStatus.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-6">
          {user && (
            <button
              onClick={() => void handleLogout()}
              disabled={isSaving}
              className="h-11 rounded-full border border-red-300 bg-white px-4 text-sm font-medium text-red-600 transition-all hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
            >
              Logout
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button
              ref={closeButtonRef}
              onClick={onClose}
              disabled={isSaving}
              className="h-11 rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
            >
              Close
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={disableForm}
              className="h-11 rounded-full bg-brand-600 px-4 text-sm font-medium text-white transition-all hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
