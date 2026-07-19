import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import type {
  AbrirCaixaOperadorResult,
  CaixaStatusOperadorResult,
  FecharCaixaOperadorResult,
} from '@/app/caixa/caixaOperadorTypes'
import { LIMITE_DIVERGENCIA_FECHAMENTO, parseMoneyInput } from '@/app/caixa/server/caixaActionsInternals'
import { PDVContext, runPdvEvaluation } from '@/lib/pdv'
import { logJson } from '@/shared/unified-logger'
import { CAIXA_MSG, caixaErroOperador } from '@/app/caixa/server/caixaErroOperador'
import {
  createCashSessionReader,
  createCashSessionWriter,
} from '@/app/caixa/server/cashSession'
import { CASH_ERROR_CODES } from '@shared-core/src/cash'

export async function obterStatusCaixaOperadorImpl(): Promise<CaixaStatusOperadorResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, status: 'ERRO', error: 'Sessão expirada. Faça login novamente.' }

    const reader = createCashSessionReader(supabase)
    const result = await reader.getStatus(user.id)

    if (!result.ok) {
      return {
        ok: false,
        status: 'ERRO',
        error: caixaErroOperador(result.error),
      }
    }
    if (result.status === 'FECHADO') {
      return { ok: true, status: 'FECHADO' }
    }
    return {
      ok: true,
      status: 'ABERTO',
      caixaId: result.session.caixaId,
      dataAbertura: result.session.dataAbertura,
      valorInicial: result.session.valorInicial,
      valorSistemaDinheiro: result.session.valorSistemaDinheiro,
      blindClosureEnabled: result.session.blindClosureEnabled,
    }
  } catch (e) {
    logJson('caixa.status.excecao', {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    })
    return {
      ok: false,
      status: 'ERRO',
      error: caixaErroOperador(e instanceof Error ? e.message : null),
    }
  }
}

export async function abrirCaixaOperadorImpl(valorInicial: number): Promise<AbrirCaixaOperadorResult> {
  const valorInicialSanitizado = parseMoneyInput(valorInicial)
  if (valorInicialSanitizado === null) {
    return { ok: false, error: 'Valor inicial inválido.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID
    const writer = createCashSessionWriter(supabase)
    const opened = await writer.open({
      operadorId: user.id,
      lojaId,
      valorInicial: valorInicialSanitizado,
    })
    if (!opened.ok) {
      return { ok: false, error: caixaErroOperador(opened.error) }
    }
    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    return { ok: true, caixaId: opened.caixaId }
  } catch (e) {
    logJson('caixa.abrir.excecao', {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      valorInicial: valorInicialSanitizado,
    })
    return {
      ok: false,
      error: caixaErroOperador(e instanceof Error ? e.message : null),
    }
  }
}

export async function fecharCaixaOperadorImpl(input: {
  valorContado: number
  motivo?: string
}): Promise<FecharCaixaOperadorResult> {
  const valorContado = parseMoneyInput(input.valorContado)
  if (valorContado === null) return { ok: false, error: 'Valor contado inválido.' }
  const motivo = (input.motivo ?? '').trim()

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const writer = createCashSessionWriter(supabase)
    const closed = await writer.close({
      operadorId: user.id,
      valorContado,
      motivo,
    })
    if (!closed.ok) {
      if (closed.code === CASH_ERROR_CODES.DIVERGENCE_NEEDS_MOTIVO) {
        return {
          ok: false,
          error: `Diferença acima de R$ ${LIMITE_DIVERGENCIA_FECHAMENTO.toFixed(2)} exige motivo (mín. 5 caracteres).`,
        }
      }
      if (closed.code === CASH_ERROR_CODES.PENDING_MOVEMENTS) {
        return { ok: false, error: CAIXA_MSG.movimentacoesPendentes }
      }
      if (closed.code === CASH_ERROR_CODES.SESSION_NOT_FOUND) {
        return { ok: false, error: 'Não há caixa aberto para fechar.' }
      }
      if (closed.code === CASH_ERROR_CODES.MOTIVO_TOO_LONG) {
        return { ok: false, error: 'Motivo muito longo (máx. 500 caracteres).' }
      }
      return { ok: false, error: caixaErroOperador(closed.error) }
    }

    const caixaIdFechado = closed.caixaId
    if (!closed.alreadyClosed) {
      const evaluationOutcome = await runPdvEvaluation(caixaIdFechado, PDVContext.CAIXA_CLOSE)
      if (evaluationOutcome.kind === 'fetch_failed') {
        logJson('pdv.evaluation.fetch_failed', {
          caixaId: caixaIdFechado,
          code: evaluationOutcome.code,
          message: evaluationOutcome.message,
        })
      } else if (evaluationOutcome.validation.violations.length > 0) {
        const { validation } = evaluationOutcome
        logJson('pdv.invariant.violation', {
          caixaId: caixaIdFechado,
          severitySummary: validation.meta.severitySummary,
          violations: validation.violations,
          mode: validation.mode,
          invariantAssert: validation.invariantAssert,
        })
      }
    }

    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    revalidatePath('/gerente/vendas')
    return {
      ok: true,
      caixaId: caixaIdFechado,
      valorSistemaDinheiro: closed.valorSistemaDinheiro,
      valorContado: closed.valorContado,
      diferenca: closed.diferenca,
      alreadyClosed: closed.alreadyClosed,
    }
  } catch (e) {
    return {
      ok: false,
      error: caixaErroOperador(e instanceof Error ? e.message : null),
    }
  }
}
