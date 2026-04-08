'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'

type R<T = null> = { success: true; data: T } | { success: false; error: string }

export function validarCriarClienteInput(input: { nome: string }): string | null {
  if (!input.nome?.trim()) return 'Nome obrigatório'
  return null
}

export function validarCriarTituloInput(input: {
  cliente_id: string
  valor_total: number
}): string | null {
  if (!input.cliente_id?.trim()) return 'Cliente obrigatório'
  if (!Number.isFinite(input.valor_total) || input.valor_total <= 0) return 'Valor inválido'
  return null
}

export function validarLiquidarTituloInput(input: {
  titulo_id: string
  valor: number
}): string | null {
  if (!input.titulo_id?.trim()) return 'Título obrigatório'
  if (!Number.isFinite(input.valor) || input.valor <= 0) return 'Valor inválido para liquidação'
  return null
}

export async function criarCliente(input: { nome: string; documento?: string; telefone?: string }): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const erro = validarCriarClienteInput({ nome: input.nome })
  if (erro) return { success: false, error: erro }
  const nome = input.nome.trim()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nome,
      documento: input.documento?.trim() || null,
      telefone: input.telefone?.trim() || null,
    })
    .select('id')
    .single()
  if (error || !data) return { success: false, error: error?.message ?? 'Erro ao criar cliente' }
  revalidatePath('/gerente/financeiro')
  return { success: true, data: data.id as string }
}

export async function criarTituloReceber(input: {
  cliente_id: string
  valor_total: number
  descricao?: string
  vencimento?: string
}): Promise<R<string>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const erro = validarCriarTituloInput({
    cliente_id: input.cliente_id,
    valor_total: input.valor_total,
  })
  if (erro) return { success: false, error: erro }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contas_receber')
    .insert({
      cliente_id: input.cliente_id,
      valor_total: input.valor_total,
      valor_aberto: input.valor_total,
      descricao: input.descricao?.trim() || null,
      vencimento: input.vencimento?.trim() || null,
      status: 'ABERTO',
    })
    .select('id')
    .single()
  if (error || !data) return { success: false, error: error?.message ?? 'Erro ao criar título' }
  revalidatePath('/gerente/financeiro')
  return { success: true, data: data.id as string }
}

export async function liquidarTitulo(input: {
  titulo_id: string
  valor: number
  forma_pagamento: 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'OUTROS'
}): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  const erro = validarLiquidarTituloInput({
    titulo_id: input.titulo_id,
    valor: input.valor,
  })
  if (erro) return { success: false, error: erro }

  const supabase = await createClient()
  const { error } = await supabase.rpc('registrar_liquidacao_receber', {
    p_titulo_id: input.titulo_id,
    p_valor: input.valor,
    p_forma_pagamento: input.forma_pagamento,
    p_observacao: null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/gerente/financeiro')
  return { success: true, data: null }
}

export async function enfileirarDocFiscalStub(venda_id: string): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!venda_id?.trim()) return { success: false, error: 'Venda obrigatória' }
  const supabase = await createClient()
  const { error } = await supabase.from('documentos_fiscais_pendentes').insert({
    venda_id,
    tipo_doc: 'NFC_E_STUB',
    status: 'PENDENTE',
    payload: { origem: 'painel_gerente' },
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/gerente/financeiro')
  return { success: true, data: null }
}

export async function reprocessarDocumentoFiscal(documento_id: string): Promise<R> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!documento_id?.trim()) return { success: false, error: 'Documento obrigatório' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fiscal_reprocessar_documento', {
    p_documento_id: documento_id,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/gerente/financeiro')
  return { success: true, data: null }
}

export async function processarFilaFiscalAgora(limit = 20): Promise<R<{ emitted: number; failed: number }>> {
  const auth = await assertGerenteOuDono()
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
      return { success: false, error: payload?.error ?? `Erro HTTP ${res.status}` }
    }
    revalidatePath('/gerente/financeiro')
    return {
      success: true,
      data: {
        emitted: Array.isArray(payload.emitted) ? payload.emitted.length : 0,
        failed: Array.isArray(payload.failed) ? payload.failed.length : 0,
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Falha ao processar fila fiscal.' }
  }
}
