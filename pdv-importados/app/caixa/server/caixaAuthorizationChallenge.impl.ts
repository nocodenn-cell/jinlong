import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'

/**
 * Infraestrutura de Authorization Challenge (migration 274) — preparação
 * para QR Code/PIN. Nenhuma UI do caixa chama isto ainda; existe para o
 * QrCodeAuthorizationProvider (stub) poder criar um challenge real e para
 * o app do gerente (futuro) ter uma RPC pronta para consultar/aprovar.
 */

export type CriarChallengeResult =
  | { ok: true; id: string; status: string; expiresAt: string }
  | { ok: false; error: string }

export type ObterChallengeResult =
  | { ok: true; id: string; status: string; expiresAt: string; token: string | null }
  | { ok: false; error: string }

function asRecord(data: unknown): Record<string, unknown> | null {
  if (data == null) return null
  const parsed = typeof data === 'string' ? safeParse(data) : data
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return null
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export async function criarAuthorizationChallengeImpl(input: {
  operation: string
  method: string
  caixaId?: string | null
  payload?: Record<string, unknown>
  ttlSeconds?: number
  deviceFingerprint?: string | null
}): Promise<CriarChallengeResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('criar_authorization_challenge', {
      p_operation: input.operation,
      p_method: input.method,
      p_caixa_id: input.caixaId ?? null,
      p_payload: input.payload ?? {},
      p_ttl_seconds: input.ttlSeconds ?? 45,
      p_device_fingerprint: input.deviceFingerprint ?? null,
    })

    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    const row = asRecord(data)
    if (!row?.id) return { ok: false, error: 'Não foi possível criar a autorização.' }
    return {
      ok: true,
      id: String(row.id),
      status: String(row.status ?? 'PENDING'),
      expiresAt: String(row.expires_at ?? ''),
    }
  } catch (e) {
    return { ok: false, error: mensagemErroDeExcecao(e, 'Não foi possível criar a autorização.') }
  }
}

export async function obterAuthorizationChallengeImpl(id: string): Promise<ObterChallengeResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('obter_authorization_challenge', { p_id: id })
    if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
    const row = asRecord(data)
    if (!row?.id) return { ok: false, error: 'Autorização não encontrada.' }
    return {
      ok: true,
      id: String(row.id),
      status: String(row.status ?? ''),
      expiresAt: String(row.expires_at ?? ''),
      token: row.token ? String(row.token) : null,
    }
  } catch (e) {
    return { ok: false, error: mensagemErroDeExcecao(e, 'Não foi possível consultar a autorização.') }
  }
}
