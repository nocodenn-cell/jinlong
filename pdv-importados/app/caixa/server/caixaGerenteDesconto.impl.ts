import { createClient } from '@/lib/supabase/server'
import { assertSupabasePublicEnv } from '@/lib/supabase/env'
import {
  mensagemErroComSecao,
  mensagemErroDeExcecao,
  mensagemErroParaUsuario,
} from '@/lib/errors/mensagemErroUsuario'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import { caixaMsgServidor } from '@/app/caixa/server/caixaMensagensServidor'
import type { LimiteSangriaResult, ValidarGerenteDescontoResult } from '@/app/caixa/caixaActionTypes'

export async function validarGerenteDescontoImpl(input: {
  senha: string
  lojaId?: string
  deviceFingerprint?: string
}): Promise<ValidarGerenteDescontoResult> {
  const idioma = await idiomaOperadorParaErro()
  const senha = input.senha.trim()
  if (!senha) return { ok: false, error: caixaMsgServidor(idioma, 'msg_senha_obrigatoria') }
  if (senha.length > 128) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_senha_invalida') }

  try {
    const supabase = await createClient()
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession()

    if (sessionErr || !session?.access_token) {
      return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }
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
      const getErrorMessage = (code: string | null, status: number, idiomaMsg?: string) => {
        if (code === 'ERRO_PERSISTENCIA_TOKEN') {
          return caixaMsgServidor(idiomaMsg, 'err_srv_registrar_desconto')
        }
        if (code) {
          return mensagemErroParaUsuario(code, idiomaMsg)
        }
        return caixaMsgServidor(idiomaMsg, 'err_srv_validar_gerente_http', { status })
      }

      const error = getErrorMessage(code, response.status, idioma)
      return {
        ok: false,
        error,
        scope: typeof payload.scope === 'string' ? payload.scope : undefined,
        lockUntil: typeof payload.lock_until === 'string' ? payload.lock_until : undefined,
      }
    }

    const token = String(payload.token ?? '')
    const expiraEm = String(payload.expira_em ?? '')
    const maxDescontoPercentual = Number(payload.max_desconto_percentual ?? 0)
    const gerenteId = String(payload.gerente_id ?? '')

    return { ok: true, token, expiraEm, maxDescontoPercentual, gerenteId }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_validar_gerente'), await idiomaOperadorParaErro()),
    }
  }
}

export async function obterLimiteSangriaSemGerenteImpl(): Promise<LimiteSangriaResult> {
  const idioma = await idiomaOperadorParaErro()
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }

    const { data, error } = await supabase.rpc('obter_limite_sangria_sem_gerente')
    if (error) {
      return { ok: false, error: mensagemErroComSecao('Limite de sangria', error.message, await idiomaOperadorParaErro()) }
    }
    const limite = Number(data ?? 200)
    return { ok: true, limite: Number.isFinite(limite) && limite > 0 ? limite : 200 }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_limite_sangria'), await idiomaOperadorParaErro()),
    }
  }
}
