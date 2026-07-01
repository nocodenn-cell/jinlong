import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  AbrirCaixaOperadorResult,
  CaixaStatusOperadorResult,
  FecharCaixaOperadorResult,
} from '@/app/caixa/caixaOperadorTypes'
import { LIMITE_DIVERGENCIA_FECHAMENTO, parseMoneyInput } from '@/app/caixa/server/caixaActionsInternals'
import { PDVContext, runPdvEvaluation } from '@/lib/pdv'
import { logJson } from '@/shared/unified-logger'
import { CAIXA_MSG, caixaErroOperador } from '@/app/caixa/server/caixaErroOperador'

type RpcStatusRow = {
  status: string
  caixa_id: string | null
  data_abertura: string | null
  valor_inicial: number | null
  valor_sistema_dinheiro: number | null
  blind_closure_enabled: boolean | null
  mensagem_operador: string | null
}

type RpcFecharRow = {
  o_caixa_id: string
  o_valor_sistema: number
  o_valor_contado: number
  o_diferenca: number
  o_ja_fechado: boolean
}

export async function obterStatusCaixaOperadorImpl(): Promise<CaixaStatusOperadorResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, status: 'ERRO', error: 'Sessão expirada. Faça login novamente.' }

    const { data, error } = await supabase.rpc('obter_status_caixa_operador', {
      p_operador_id: user.id,
    })

    if (error) {
      return { ok: false, status: 'ERRO', error: caixaErroOperador(error.message) }
    }

    const row = (Array.isArray(data) ? data[0] : data) as RpcStatusRow | undefined
    if (!row?.status) {
      return { ok: false, status: 'ERRO', error: CAIXA_MSG.caixaIndisponivel }
    }

    if (row.status === 'ERRO') {
      return {
        ok: false,
        status: 'ERRO',
        error: row.mensagem_operador?.trim() || CAIXA_MSG.caixaIndisponivel,
      }
    }

    if (row.status === 'FECHADO') {
      return { ok: true, status: 'FECHADO' }
    }

    return {
      ok: true,
      status: 'ABERTO',
      caixaId: String(row.caixa_id),
      dataAbertura: String(row.data_abertura),
      valorInicial: Number(row.valor_inicial ?? 0),
      valorSistemaDinheiro: Number(row.valor_sistema_dinheiro ?? 0),
      blindClosureEnabled: Boolean(row.blind_closure_enabled),
    }
  } catch (e) {
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

    // Writer único de abertura (Fase 1). A RPC usa auth.uid(), aplica o invariante
    // (índice caixas_operador_unico_aberto) e elimina o race check-then-insert.
    const { data, error: rpcErr } = await supabase.rpc('abrir_caixa_atomico', {
      p_valor_inicial: valorInicialSanitizado,
    })

    if (rpcErr) {
      const msg = rpcErr.message ?? ''
      if (msg.includes('ABRIR_CAIXA_JA_ABERTO')) {
        return { ok: false, error: 'Já existe um caixa aberto para este operador.' }
      }
      return { ok: false, error: caixaErroOperador(msg) }
    }

    const row = (Array.isArray(data) ? data[0] : data) as { o_caixa_id: string } | undefined
    if (!row?.o_caixa_id) return { ok: false, error: caixaErroOperador(null) }

    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    return { ok: true, caixaId: String(row.o_caixa_id) }
  } catch (e) {
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
  if (motivo.length > 500) {
    return { ok: false, error: 'Motivo muito longo (máx. 500 caracteres).' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data, error: rpcErr } = await supabase.rpc('fechar_caixa_atomico', {
      p_operador_id: user.id,
      p_valor_contado: valorContado,
      p_motivo: motivo,
    })

    if (rpcErr) {
      const msg = rpcErr.message ?? ''
      if (msg.includes('FECHAR_CAIXA_DIVERGENCIA_SEM_MOTIVO')) {
        return {
          ok: false,
          error: `Diferença acima de R$ ${LIMITE_DIVERGENCIA_FECHAMENTO.toFixed(2)} exige motivo (mín. 5 caracteres).`,
        }
      }
      if (msg.includes('FECHAR_CAIXA_MOVIMENTACOES_PENDENTES')) {
        return { ok: false, error: CAIXA_MSG.movimentacoesPendentes }
      }
      if (msg.includes('FECHAR_CAIXA_CAIXA_NAO_ENCONTRADO')) {
        return { ok: false, error: 'Não há caixa aberto para fechar.' }
      }
      return { ok: false, error: caixaErroOperador(msg) }
    }

    const rows = Array.isArray(data) ? data : []
    const row = rows[0] as RpcFecharRow | undefined
    if (!row) return { ok: false, error: CAIXA_MSG.padrao }

    const caixaIdFechado = String(row.o_caixa_id)
    const alreadyClosed = Boolean(row.o_ja_fechado)

    if (!alreadyClosed) {
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
      valorSistemaDinheiro: Number(row.o_valor_sistema),
      valorContado: Number(row.o_valor_contado),
      diferenca: Number(row.o_diferenca),
      alreadyClosed,
    }
  } catch (e) {
    return {
      ok: false,
      error: caixaErroOperador(e instanceof Error ? e.message : null),
    }
  }
}
