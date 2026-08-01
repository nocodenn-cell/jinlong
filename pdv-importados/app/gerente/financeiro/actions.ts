'use server'

import { revalidarDominio } from '@/lib/navigation/revalidarDominio'
import { adminFinanceiroDocumentoHref } from '@shared-core/navigation/routes'
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
  return actionResultToLegacyData(
    await runServerActionWithObservability('gerente/financeiro/criar-titulo', async () => {
      const writer = createReceivableWriter(supabase)
      const created = await writer.create({
        clienteId: input.cliente_id,
        valorTotal: input.valor_total,
        descricao: input.descricao,
        vencimento: input.vencimento,
      })
      if (!created.ok) {
        throw new Error(mensagemErroComSecao('Conta a receber', created.error))
      }
      revalidarDominio('financeiro.titulo.alterado')
      return created.tituloId
    }),
  )
}

export async function liquidarTitulo(input: {
  titulo_id: string
  valor: number
  forma_pagamento: 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'OUTROS'
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
  })
  if (!result.ok) {
    return { success: false, error: mensagemErroComSecao('Liquidação', result.error) }
  }
  revalidarDominio('financeiro.titulo.alterado')
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
  revalidarDominio('fiscal.documento.alterado', {
    escopo: 'layout',
    extras: [adminFinanceiroDocumentoHref(documento_id)],
  })
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
    revalidarDominio('fiscal.documento.alterado', { escopo: 'layout' })
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
