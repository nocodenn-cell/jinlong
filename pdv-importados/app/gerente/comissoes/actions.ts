'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type ComissaoResumoRow = {
  operador_id: string
  operador_nome: string
  total_vendas: number
  total_comissao: number
  total_pago: number
  total_pendente: number
}

export type ComissaoDetalheRow = {
  comissao_id: string
  venda_id: string
  valor_comissao: number
  base_calculo: number
  status: string
  pago_em: string | null
  created_at: string
}

const FiltroComissoesSchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['todos', 'pendente', 'pago']).default('todos'),
})

export type FiltroComissoes = z.infer<typeof FiltroComissoesSchema>

export async function carregarResumoComissoes(
  filtro: unknown,
): Promise<ActionResult<ComissaoResumoRow[]>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = FiltroComissoesSchema.safeParse(filtro)
  if (!parsed.success) return { success: false, error: 'Filtro inválido.' }

  const { lojaId: _lojaId } = await getUsuarioAtual()
  const lojaId = _lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('resumo_comissoes_por_operador', {
    p_loja_id: lojaId,
    p_de: parsed.data.de ?? null,
    p_ate: parsed.data.ate ?? null,
    p_status: parsed.data.status,
  })

  if (error) return { success: false, error: mensagemErroComSecao('Comissões', error.message) }

  return {
    success: true,
    data: (data ?? []).map((r: Record<string, unknown>) => ({
      operador_id: String(r.operador_id),
      operador_nome: String(r.operador_nome),
      total_vendas: Number(r.total_vendas),
      total_comissao: Number(r.total_comissao),
      total_pago: Number(r.total_pago),
      total_pendente: Number(r.total_pendente),
    })),
  }
}

export async function carregarDetalheComissoes(
  operadorId: string,
  filtro: FiltroComissoes,
): Promise<ActionResult<ComissaoDetalheRow[]>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const { lojaId: _lojaId } = await getUsuarioAtual()
  const lojaId = _lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('detalhe_comissoes_operador', {
    p_loja_id: lojaId,
    p_operador_id: operadorId,
    p_de: filtro.de ?? null,
    p_ate: filtro.ate ?? null,
  })

  if (error) return { success: false, error: mensagemErroComSecao('Comissões detalhe', error.message) }

  return {
    success: true,
    data: (data ?? []).map((r: Record<string, unknown>) => ({
      comissao_id: String(r.comissao_id),
      venda_id: String(r.venda_id),
      valor_comissao: Number(r.valor_comissao),
      base_calculo: Number(r.base_calculo),
      status: String(r.status),
      pago_em: r.pago_em ? String(r.pago_em) : null,
      created_at: String(r.created_at),
    })),
  }
}

const MarcarPagasSchema = z.object({
  operador_id: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1),
})

export async function marcarComissoesPagas(
  input: unknown,
): Promise<ActionResult<{ marcadas: number }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = MarcarPagasSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Dados inválidos.' }

  const { lojaId: _lojaId } = await getUsuarioAtual()
  const lojaId = _lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('marcar_comissoes_pagas', {
    p_loja_id: lojaId,
    p_operador_id: parsed.data.operador_id,
    p_ids: parsed.data.ids,
  })

  if (error) return { success: false, error: mensagemErroComSecao('Marcar pago', error.message) }

  revalidatePath('/gerente/comissoes')
  return { success: true, data: { marcadas: Number(data ?? 0) } }
}
