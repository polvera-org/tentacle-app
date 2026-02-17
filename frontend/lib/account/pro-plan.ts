export function getProWaitlistUrl(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_PRO_WAITLIST_URL
  if (!configuredUrl) {
    return null
  }

  const trimmedUrl = configuredUrl.trim()
  return trimmedUrl.length > 0 ? trimmedUrl : null
}
