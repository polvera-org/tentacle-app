'use client'

interface UpdateNotificationPopupNotification {
  version_id: string
  title?: string
  message?: string
  release_url?: string
}

interface UpdateNotificationPopupProps {
  notification: UpdateNotificationPopupNotification
  onDismiss: () => void
}

const DEFAULT_TITLE = 'Update available'

export function UpdateNotificationPopup({
  notification,
  onDismiss,
}: UpdateNotificationPopupProps) {
  const message = notification.message?.trim().length
    ? notification.message
    : 'A new app update is ready. Restart when convenient to apply it.'

  return (
    <div className="pointer-events-none fixed inset-x-4 z-40 bottom-[calc(env(safe-area-inset-bottom)+1rem)] sm:inset-x-auto sm:left-4 sm:w-[22rem]">
      <section
        className="pointer-events-auto rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur"
        aria-live="polite"
        role="status"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-900">
              {notification.title?.trim().length ? notification.title : DEFAULT_TITLE}
            </p>
            <p className="mt-1 text-xs text-zinc-600">{message}</p>
            <p className="mt-2 text-xs font-medium text-zinc-700">
              Target version: <span className="font-mono">{notification.version_id}</span>
            </p>
            {notification.release_url ? (
              <a
                href={notification.release_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
              >
                View update details
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label={`Dismiss update notification for version ${notification.version_id}`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </section>
    </div>
  )
}
