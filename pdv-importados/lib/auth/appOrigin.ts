/**
 * Origem pública do app para redirects Auth (reset de senha).
 * Browser: window.location.origin. SSR: NEXT_PUBLIC_APP_URL.
 */
export function resolveAppOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return ''
}

export function buildAuthCallbackUrl(nextPath: string): string {
  const origin = resolveAppOrigin()
  const next = nextPath.startsWith('/') ? nextPath : `/${nextPath}`
  const path = `/auth/callback?next=${encodeURIComponent(next)}`
  return origin ? `${origin}${path}` : path
}
