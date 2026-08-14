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
  validarCriarClienteInput,
  validarCriarTituloInput,
  validarLiquidarTituloInput,
} from './actions.validation'
import {
  createReceivableLiquidationService,
  createReceivableWriter,
} from '@/app/admin/financeiro/receivableWriter'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

export async function criarCliente(input: { nome: string; documento?: string; telefone?: string }): Promise<R<string>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  const erro = validarCriarClienteInput({ nome: input.nome })
  if (erro) return { success: false, error: erro }
  const nome = input.nome.trim()

  // clientes.loja_id é NOT NULL (migration 112): preenche com a loja do gerente.
  const lojaId = auth.session.lojaId
  if (!lojaId) {
    return { success: false, error: 'Sua conta não está associada a uma loja. Contate o administrador.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nome,
      documento: input.documento?.trim() || null,
      telefone: input.telefone?.trim() || null,
      loja_id: lojaId,
    })
    .select('id')
    .single()
  if (error || !data) {
    return {
      success: false,
      error: error
        ? mensagemErroComSecao('Cadastro de cliente', error.message)
        : 'Não foi possível criar o cliente. Tente de novo.',
    }
  }
  revalidatePath('/gerente/financeiro')
  revalidatePath('/admin/financeiro')
  return { success: true, data: data.id as string }
}

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

export async function enfileirarDocFiscalStub(venda_id: string): Promise<R> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!venda_id?.trim()) return { success: false, error: 'Venda obrigatória' }
  const supabase = await createClient()
  const { error } = await supabase.from('documentos_fiscais_pendentes').insert({
    venda_id,
    tipo_doc: 'NFC_E_STUB',
    status: 'PENDENTE',
    payload: { origem: 'painel_gerente' },
  })
  if (error)
    return { success: false, error: mensagemErroComSecao('Documento fiscal', error.message) }
  revalidatePath('/gerente/financeiro', 'layout')
  revalidatePath('/admin/financeiro', 'layout')
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
