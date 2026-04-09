/**
 * Logout por inatividade (browser). Desativado quando retorno é 0.
 * `NEXT_PUBLIC_*` é embutido no bundle no build.
 */
export function getIdleLogoutMinutes(): number {
  const raw =
    typeof process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES === 'string'
      ? process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES.trim()
      : ''
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 24 * 60)
}
