import { createClient } from '@/lib/supabase/client'

type ClientLogoutResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Encerra sessão do Supabase no cliente.
 * Se a chamada principal falhar, tenta fallback local para limpar cookies da app.
 */
export async function performClientLogout(): Promise<ClientLogoutResult> {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  if (!error) return { ok: true }

  try {
    const response = await fetch('/auth/signout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (response.ok) return { ok: true }
  } catch {
    // noop: retorna erro principal abaixo.
  }

  return {
    ok: false,
    error: 'Não foi possível encerrar a sessão agora. Verifique a conexão e tente novamente.',
  }
}
