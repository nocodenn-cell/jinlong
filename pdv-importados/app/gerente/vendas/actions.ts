'use server'

import { createClient } from '@/lib/supabase/server'
import { cancelarVenda } from '@/app/caixa/actions'
import { parseCancelarVendaGerenteForm } from '@/app/gerente/vendas/parseCancelarVendaGerenteForm'

export type VendaListRow = {
  id: string
  data: string | null
  total_liquido: number | null
  total_bruto: number | null
  forma_pagamento: string | null
  status: string | null
  caixa_id: string | null
}

const PAGE_SIZE = 20

export async function buscarVendasPaginadasAction(
  page: number,
): Promise<{ ok: true; vendas: VendaListRow[]; hasMore: boolean } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE // fetch one extra to determine hasMore

    const { data, error } = await supabase
      .from('vendas')
      .select('id, data, total_liquido, total_bruto, forma_pagamento, status, caixa_id')
      .order('data', { ascending: false })
      .range(from, to)

    if (error) return { ok: false, error: error.message }

    const rows = (data ?? []) as VendaListRow[]
    const hasMore = rows.length > PAGE_SIZE
    return { ok: true, vendas: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao buscar vendas.' }
  }
}

export async function cancelarVendaGerenteAction(formData: FormData): Promise<void> {
  const parsed = parseCancelarVendaGerenteForm(formData)
  if (!parsed) throw new Error('Dados inválidos.')
  const result = await cancelarVenda(parsed.vendaId, parsed.motivo)
  if (!result.ok) throw new Error(result.error)
}
