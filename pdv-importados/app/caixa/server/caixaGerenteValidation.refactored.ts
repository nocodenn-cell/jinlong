/**
 * Função refatorada para resolver erro do SonarCloud
 * Antes: 11 parâmetros individuais
 * Depois: 1 parâmetro objeto com todos os dados
 */

import { createClient } from '@/lib/supabase/server'
import { assertSupabasePublicEnv } from '@/lib/supabase/env'
import {
  mensagemErroComSecao,
  mensagemErroDeExcecao,
  mensagemErroParaUsuario,
} from '@/lib/errors/mensagemErroUsuario'
import type {
  GerenteValidationParams,
  ValidarSenhaGerenteResultType,
} from './caixaGerenteValidation.types'

/**
 * ✅ VERSÃO REFACTORADA - Resolvido erro SonarCloud
 * 
 * ANTES (11 parâmetros):
 * async function respondSenhaGerenteInvalida(
 *   senha: string,
 *   lojaId: string,
 *   deviceFingerprint: string,
 *   sessionId: string,
 *   userAgent: string,
 *   ipAddress: string,
 *   timestamp: Date,
 *   motivo: string,
 *   valor: number,
 *   operadorId: string,
 *   caixaId: string
 * ): Promise<ValidarSenhaGerenteResultType>
 * 
 * DEPOIS (1 parâmetro objeto):
 * async function respondSenhaGerenteInvalida(
 *   params: GerenteValidationParams
 * ): Promise<ValidarSenhaGerenteResultType>
 */
export async function respondSenhaGerenteInvalida(
  params: GerenteValidationParams
): Promise<ValidarSenhaGerenteResultType> {
  // Desestruturação dos parâmetros do objeto
  const {
    senha,
    lojaId,
    deviceFingerprint,
    sessionId,
    userAgent,
    ipAddress,
    timestamp,
    motivo,
    valor,
    operadorId,
    caixaId
  } = params

  // Validações iniciais
  const senhaTrim = senha.trim()
  if (!senhaTrim) return { ok: false, error: 'Senha do gerente é obrigatória.' }
  if (senhaTrim.length > 128) return { ok: false, error: 'Senha inválida (máx. 128 caracteres).' }

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
        'x-device-fingerprint': (deviceFingerprint ?? '').trim().toLowerCase().slice(0, 200),
        'x-session-id': sessionId?.trim() || '',
        'x-user-agent': userAgent?.trim() || '',
        'x-ip-address': ipAddress?.trim() || '',
      },
      body: JSON.stringify({
        senha: senhaTrim,
        loja_id: lojaId?.trim() || undefined,
        timestamp: timestamp?.toISOString() || new Date().toISOString(),
        motivo: motivo?.trim() || '',
        valor: valor || 0,
        operador_id: operadorId?.trim() || '',
        caixa_id: caixaId?.trim() || '',
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok || payload.ok !== true) {
      const code = typeof payload.error === 'string' ? payload.error : ''
      const error =
        code === 'ERRO_PERSISTENCIA_TOKEN'
          ? 'Não foi possível registrar o desconto no servidor. Tente novamente em instantes.'
          : code
            ? mensagemErroParaUsuario(code)
            : `Não foi possível validar o gerente (servidor respondeu com código ${response.status}). Verifique a internet e tente de novo.`
      return {
        ok: false,
        error,
        scope: typeof payload.scope === 'string' ? payload.scope : undefined,
        lockUntil: typeof payload.lock_until === 'string' ? payload.lock_until : undefined,
      }
    }

    return {
      ok: true,
      token: String(payload.token ?? ''),
      expiraEm: String(payload.expira_em ?? ''),
      maxDescontoPercentual: Number(payload.max_desconto_percentual ?? 0),
      gerenteId: String(payload.gerente_id ?? ''),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível validar a senha do gerente.'),
    }
  }
}

/**
 * ✅ VERSÃO LEGADA (Para referência - NÃO USAR)
 * 
 * Esta é a versão original com 11 parâmetros que causava o erro do SonarCloud.
 * Mantida aqui apenas para referência e comparação.
 * 
 * export async function respondSenhaGerenteInvalida_LEGADO(
 *   senha: string,
 *   lojaId: string,
 *   deviceFingerprint: string,
 *   sessionId: string,
 *   userAgent: string,
 *   ipAddress: string,
 *   timestamp: Date,
 *   motivo: string,
 *   valor: number,
 *   operadorId: string,
 *   caixaId: string
 * ): Promise<ValidarSenhaGerenteResultType> {
 *   // Implementação idêntica à versão refatorada
 * }
 */

/**
 * Helper function para facilitar a migração das chamadas existentes
 */
export function createGerenteValidationParams(
  senha: string,
  lojaId?: string,
  deviceFingerprint?: string,
  sessionId?: string,
  userAgent?: string,
  ipAddress?: string,
  timestamp?: Date,
  motivo?: string,
  valor?: number,
  operadorId?: string,
  caixaId?: string
): GerenteValidationParams {
  return {
    senha,
    lojaId,
    deviceFingerprint,
    sessionId,
    userAgent,
    ipAddress,
    timestamp,
    motivo,
    valor,
    operadorId,
    caixaId,
  }
}
