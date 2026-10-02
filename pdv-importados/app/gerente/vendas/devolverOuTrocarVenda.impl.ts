'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { mensagemErroDevolverVenda } from '@/app/gerente/vendas/devolverVendaErro'
import type { DevolverVendaInput } from '@/app/gerente/vendas/parseDevolverVendaForm'

type RpcDevolverItem = {
  nome?: unknown
  quantidade?: unknown
  preco_unitario?: unknown
  subtotal?: unknown
}

type RpcDevolverRow = {
  operacao_id?: unknown
  venda_id?: unknown
  tipo?: unknown
  valor_estornado?: unknown
  valor_caixa_estornado?: unknown
  status_venda?: unknown
  itens?: unknown
}

function firstRpcRow<T>(data: unknown): T | undefined {
  if (data == null) return undefined
  return (Array.isArray(data) ? data[0] : data) as T
}

export type DevolverVendaItemResult = {
  nome: string
  quantidade: number
  precoUnitario: number
  subtotal: number
}

function mapRpcItens(raw: unknown): DevolverVendaItemResult[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r) => {
    const item = r as RpcDevolverItem
    return {
      nome: typeof item.nome === 'string' ? item.nome : 'Produto',
      quantidade: Number(item.quantidade ?? 0),
      precoUnitario: Number(item.preco_unitario ?? 0),
      subtotal: Number(item.subtotal ?? 0),
    }
  })
}

export type DevolverVendaResult =
  | {
      ok: true
      operacaoId: string
      vendaId: string
      tipo: string
      valorEstornado: number
      valorCaixaEstornado: number
      itens: DevolverVendaItemResult[]
      operadorNome: string
    }
  | { ok: false; error: string }

export async function devolverOuTrocarVendaImpl(
  input: DevolverVendaInput,
): Promise<DevolverVendaResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data, error } = await supabase.rpc('devolver_ou_trocar_venda', {
      p_venda_id: input.vendaId,
      p_idempotency_key: input.idempotencyKey,
      p_motivo: input.motivo,
      p_tipo: input.tipo,
      p_itens: input.itens.map((i) => ({
        item_venda_id: i.itemVendaId,
        quantidade: i.quantidade,
      })),
      p_valor_estorno: input.valorEstorno,
      p_forma_estorno: input.formaEstorno,
      p_venda_substituta_id: input.vendaSubstitutaId ?? null,
      p_operador_id: user.id,
      p_caixa_id: input.caixaId ?? null,
    })

    if (error) {
      return { ok: false, error: mensagemErroDevolverVenda(error.message) }
    }

    const row = firstRpcRow<RpcDevolverRow>(data)
    if (!row?.operacao_id) {
      return { ok: false, error: 'Devolução não retornou identificador da operação.' }
    }

    revalidatePath('/admin/vendas')
    revalidatePath('/gerente/vendas')
    revalidatePath(`/gerente/vendas/${input.vendaId}`)
    revalidatePath('/gerente/financeiro')
    revalidatePath('/admin/financeiro')
    revalidatePath('/admin/estoque')

    const { data: usuarioRow } = await supabase
      .from('usuarios')
      .select('nome')
      .eq('id', user.id)
      .maybeSingle()

    return {
      ok: true,
      operacaoId: String(row.operacao_id),
      vendaId: String(row.venda_id ?? input.vendaId),
      tipo: String(row.tipo ?? input.tipo),
      valorEstornado: Number(row.valor_estornado ?? input.valorEstorno),
      valorCaixaEstornado: Number(row.valor_caixa_estornado ?? 0),
      itens: mapRpcItens(row.itens),
      operadorNome: usuarioRow?.nome ?? '—',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro inesperado.'
    return { ok: false, error: mensagemErroDevolverVenda(msg) }
  }
}
