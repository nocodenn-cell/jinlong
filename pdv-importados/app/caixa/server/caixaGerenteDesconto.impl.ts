import { createClient } from '@/lib/supabase/server'
import { assertSupabasePublicEnv } from '@/lib/supabase/env'
import {
  mensagemErroComSecao,
  mensagemErroDeExcecao,
  mensagemErroParaUsuario,
} from '@/lib/errors/mensagemErroUsuario'
import { gerarTokenHmacGerente } from '@/lib/security/gerenteTokenHmac'
import type { LimiteSangriaResult, ValidarGerenteDescontoResult } from '@/app/caixa/caixaActionTypes'

export async function validarGerenteDescontoImpl(input: {
  senha: string
  lojaId?: string
  deviceFingerprint?: string
}): Promise<ValidarGerenteDescontoResult> {
  const senha = input.senha.trim()
  if (!senha) return { ok: false, error: 'Senha do gerente é obrigatória.' }
  if (senha.length > 128) return { ok: false, error: 'Senha inválida (máx. 128 caracteres).' }

  try {
    const supabase = await createClient()
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession()

    if (sessionErr || !session?.access_token) {
      return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    }

    const { url } = assertSupabasePublicEnv()
    const response = await fetch(`${url}/functions/v1/validar-gerente`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        'x-device-fingerprint': (input.deviceFingerprint ?? '').trim().toLowerCase().slice(0, 200),
      },
      body: JSON.stringify({
        senha,
        loja_id: input.lojaId?.trim() || undefined,
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok || payload.ok !== true) {
      const code = typeof payload.error === 'string' ? payload.error : ''
      const getErrorMessage = (code: string | null, status: number) => {
        if (code === 'ERRO_PERSISTENCIA_TOKEN') {
          return 'Não foi possível registrar o desconto no servidor. Tente novamente em instantes.'
        }
        if (code) {
          return mensagemErroParaUsuario(code)
        }
        return `Não foi possível validar o gerente (servidor respondeu com código ${status}). Verifique a internet e tente de novo.`
      }

      const error = getErrorMessage(code, response.status)
      return {
        ok: false,
        error,
        scope: typeof payload.scope === 'string' ? payload.scope : undefined,
        lockUntil: typeof payload.lock_until === 'string' ? payload.lock_until : undefined,
      }
    }

    const edgeToken = String(payload.token ?? '')
    const expiraEm = String(payload.expira_em ?? '')
    const maxDescontoPercentual = Number(payload.max_desconto_percentual ?? 0)
    const gerenteId = String(payload.gerente_id ?? '')

    const secret = process.env.GERENTE_TOKEN_SECRET
    const token = secret
      ? await gerarTokenHmacGerente(
          {
            edgeToken,
            gerenteId,
            deviceFingerprint: (input.deviceFingerprint ?? '').trim().toLowerCase().slice(0, 200),
            expiraEm,
            maxDesconto: maxDescontoPercentual,
          },
          secret,
        )
      : edgeToken

    return { ok: true, token, expiraEm, maxDescontoPercentual, gerenteId }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível validar a senha do gerente.'),
    }
  }
}

export async function obterLimiteSangriaSemGerenteImpl(): Promise<LimiteSangriaResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data, error } = await supabase.rpc('obter_limite_sangria_sem_gerente')
    if (error) {
      return { ok: false, error: mensagemErroComSecao('Limite de sangria', error.message) }
    }
    const limite = Number(data ?? 200)
    return { ok: true, limite: Number.isFinite(limite) && limite > 0 ? limite : 200 }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar o limite de sangria.'),
    }
  }
}
