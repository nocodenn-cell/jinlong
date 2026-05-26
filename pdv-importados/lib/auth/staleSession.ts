import type { AuthError, SupabaseClient } from '@supabase/supabase-js'

export function isStaleAuthMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('refresh token') ||
    lower.includes('jwt') ||
    lower.includes('auth session missing') ||
    lower.includes('session missing')
  )
}

/** Limpa cookies de sessão inválida. Retorna true se o erro era sessão expirada. */
export async function clearStaleSessionIfNeeded(
  supabase: SupabaseClient,
  error: AuthError | null,
): Promise<boolean> {
  if (!error || !isStaleAuthMessage(error.message)) return false
  try {
    await supabase.auth.signOut()
  } catch {
    /* cookies já inconsistentes */
  }
  return true
}
