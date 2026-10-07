'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao, mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import {
  runServerActionWithObservability,
} from '@/lib/observability/runServerAction'
import { actionResultToLegacyData } from '@/lib/observability/actionResultAdapters'
import {
  validarCriarTituloInput,
  validarLiquidarTituloInput,
} from './actions.validation'
import {
  createReceivableLiquidationService,
  createReceivableWriter,
} from '@/app/admin/financeiro/receivableWriter'
import { createReceivableReader } from '@/app/admin/financeiro/receivableReader'
import type { ReceivableLiquidacaoRow } from '@shared-core/src/financial'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

export async function criarTituloReceber(input: {
  cliente_id: string
  valor_total: number
  descricao?: string
  vencimento?: string
}): Promise<R<string>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  const erro = validarCriarTituloInput({
    cliente_id: input.cliente_id,
    valor_total: input.valor_total,
  })
  if (erro) return { success: false, error: erro }

  const supabase = await createClient()

  // contas_receber.loja_id é NOT NULL (migration 112). Achado de review:
  // usar sempre a loja da SESSÃO (auth.session.lojaId) quebra para ADMIN —
  // buscarClientesPaginadosAction(1) não filtra por loja para esse perfil,
  // então um ADMIN pode selecionar cliente de outra loja e o INSERT
  // anterior sempre gravava a loja do ATOR, criando um título financeiro
  // atribuído à loja errada (a policy de INSERT valida cliente_id e
  // loja_id de forma independente, então isso passava sem erro). Deriva
  // a loja do PRÓPRIO cliente selecionado — correto tanto para GERENTE
  // (só vê clientes da própria loja, resultado é o mesmo de antes) quanto
  // para ADMIN (título fica na loja real do cliente, não na do ator).
  const { data: clienteRow, error: clienteErr } = await supabase
    .from('clientes')
    .select('loja_id')
    .eq('id', input.cliente_id)
    .maybeSingle()
  if (clienteErr || !clienteRow?.loja_id) {
    return { success: false, error: 'Cliente não encontrado ou sem loja associada.' }
  }
  const lojaId = clienteRow.loja_id as string

  return actionResultToLegacyData(
    await runServerActionWithObservability('gerente/financeiro/criar-titulo', async () => {
      const writer = createReceivableWriter(supabase)
      const created = await writer.create({
        clienteId: input.cliente_id,
        lojaId,
        valorTotal: input.valor_total,
        descricao: input.descricao,
        vencimento: input.vencimento,
      })
      if (!created.ok) {
        throw new Error(mensagemErroComSecao('Conta a receber', created.error))
      }
      revalidatePath('/gerente/financeiro')
      revalidatePath('/admin/financeiro')
      return created.tituloId
    }),
  )
}

export async function liquidarTitulo(input: {
  titulo_id: string
  valor: number
  forma_pagamento: 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'OUTROS'
  idempotency_key: string
  caixa_id?: string | null
}): Promise<R> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  const erro = validarLiquidarTituloInput({
    titulo_id: input.titulo_id,
    valor: input.valor,
  })
  if (erro) return { success: false, error: erro }

  const supabase = await createClient()
  const liquidation = createReceivableLiquidationService(supabase)
  const result = await liquidation.liquidate({
    tituloId: input.titulo_id,
    valor: input.valor,
    formaPagamento: input.forma_pagamento,
    observacao: null,
    idempotencyKey: input.idempotency_key,
    caixaId: input.caixa_id,
  })
  if (!result.ok) {
    return { success: false, error: mensagemErroComSecao('Liquidação', result.error) }
  }
  revalidatePath('/gerente/financeiro')
  revalidatePath('/admin/financeiro')
  return { success: true, data: null }
}

export async function listarLiquidacoesReceber(tituloId: string): Promise<R<ReceivableLiquidacaoRow[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!tituloId?.trim()) return { success: false, error: 'Título obrigatório.' }

  const supabase = await createClient()
  const reader = createReceivableReader(supabase)
  const result = await reader.listLiquidacoes({ tituloId })
  if (!result.ok) {
    return { success: false, error: mensagemErroComSecao('Liquidações', result.error) }
  }
  return { success: true, data: result.liquidacoes }
}

export async function estornarLiquidacaoReceber(input: {
  liquidacao_id: string
  motivo: string
  idempotency_key: string
}): Promise<R> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!input.liquidacao_id?.trim()) return { success: false, error: 'Liquidação obrigatória.' }
  if (!input.motivo?.trim()) return { success: false, error: 'Informe o motivo do estorno.' }
  if (!input.idempotency_key?.trim()) return { success: false, error: 'Chave de idempotência obrigatória.' }

  const supabase = await createClient()
  const liquidation = createReceivableLiquidationService(supabase)
  const result = await liquidation.reverse({
    liquidacaoId: input.liquidacao_id,
    motivo: input.motivo,
    idempotencyKey: input.idempotency_key,
  })
  if (!result.ok) {
    return { success: false, error: mensagemErroComSecao('Estorno', result.error) }
  }
  revalidatePath('/gerente/financeiro')
  revalidatePath('/admin/financeiro')
  return { success: true, data: null }
}

/**
 * Cancelamento fiscal explícito — ciclo do documento, não da venda.
 * Não acopla a `cancelar_venda_transacional`.
 */
export async function cancelarDocumentoFiscal(
  documento_id: string,
  justificativa: string,
): Promise<R> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!documento_id?.trim()) return { success: false, error: 'Documento obrigatório' }
  if (!justificativa?.trim() || justificativa.trim().length < 15) {
    return { success: false, error: 'Justificativa com no mínimo 15 caracteres.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fiscal_cancelar_documento', {
    p_documento_id: documento_id,
    p_justificativa: justificativa.trim(),
  })
  if (error)
    return { success: false, error: mensagemErroComSecao('Cancelar documento fiscal', error.message) }
  revalidatePath('/gerente/financeiro', 'layout')
  revalidatePath('/admin/financeiro', 'layout')
  revalidatePath(`/gerente/financeiro/documento/${documento_id}`)
  revalidatePath(`/admin/financeiro/documento/${documento_id}`)
  return { success: true, data: null }
}

export async function reprocessarDocumentoFiscal(documento_id: string): Promise<R> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!documento_id?.trim()) return { success: false, error: 'Documento obrigatório' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fiscal_reprocessar_documento', {
    p_documento_id: documento_id,
  })
  if (error)
    return { success: false, error: mensagemErroComSecao('Reprocessar documento', error.message) }
  revalidatePath('/gerente/financeiro', 'layout')
  revalidatePath('/admin/financeiro', 'layout')
  revalidatePath(`/gerente/financeiro/documento/${documento_id}`)
  revalidatePath('/admin/financeiro')
  revalidatePath('/admin/financeiro', 'layout')
  revalidatePath(`/admin/financeiro/documento/${documento_id}`)
  return { success: true, data: null }
}

export async function processarFilaFiscalAgora(limit = 20): Promise<R<{ emitted: number; failed: number }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const endpoint = process.env.FISCAL_WORKER_ENDPOINT
  const key = process.env.FISCAL_WORKER_KEY
  if (!endpoint || !key) {
    return { success: false, error: 'FISCAL_WORKER_ENDPOINT/FISCAL_WORKER_KEY não configurados.' }
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FISCAL-WORKER-KEY': key,
      },
      body: JSON.stringify({ limit }),
      cache: 'no-store',
    })
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      emitted?: unknown[]
      failed?: unknown[]
      error?: string
    }
    if (!res.ok || !payload?.ok) {
      const bruto = typeof payload?.error === 'string' ? payload.error : ''
      return {
        success: false,
        error: bruto
          ? mensagemErroParaUsuario(bruto)
          : `O servidor fiscal não respondeu como esperado (código ${res.status}). Verifique a configuração e a internet.`,
      }
    }
    revalidatePath('/gerente/financeiro', 'layout')
  revalidatePath('/admin/financeiro', 'layout')
    return {
      success: true,
      data: {
        emitted: Array.isArray(payload.emitted) ? payload.emitted.length : 0,
        failed: Array.isArray(payload.failed) ? payload.failed.length : 0,
      },
    }
  } catch (e) {
    return {
      success: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível processar a fila fiscal. Tente de novo.'),
    }
  }
}
