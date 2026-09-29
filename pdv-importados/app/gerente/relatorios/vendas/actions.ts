'use server'

import { createClient } from '@/lib/supabase/server'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { getRelatorioTimezone } from '@/lib/relatorios/getRelatorioTimezone'
import { inicioDoDiaCivilEmUtc, subtrairDiasCivis } from '@/lib/relatorios/periodoRelatorio'
import type { Database } from '@/lib/supabase/database.types'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'

export type VendaReportRow = {
  id: string
  data: string | null
  cliente_nome: string | null
  vendedor_nome: string | null
  total_liquido: number
  forma_pagamento: string | null
  status: string
}

export type DiaSerie = { dia: string; total_liquido: number; num_vendas: number }

export type RelatorioVendasAvancadoFilters = {
  de: string // YYYY-MM-DD
  ate: string
  vendedor_id?: string
  produto_id?: string
  forma_pagamento?: string
}

export type RelatorioVendasAvancadoPayload = {
  filters: RelatorioVendasAvancadoFilters
  serie_por_dia: DiaSerie[]
  vendas: VendaReportRow[]
  totais: {
    faturamento: number
    num_concluidas: number
    num_canceladas: number
    ticket_medio: number
  }
}

/**
 * Shape do resultado bruto da query com joins de cliente e vendedor.
 * Sem tipos gerados pelo Supabase, FK joins são inferidos como array —
 * usamos `as unknown as VendaQueryRow[]` para a conversão controlada.
 */
type VendaQueryRow = {
  id: string
  data: string | null
  total_liquido: number | null
  forma_pagamento: string | null
  status: string | null
  cliente: { nome: string } | { nome: string }[] | null
  vendedor: { nome: string } | { nome: string }[] | null
}

/**
 * Consulta principal do relatório avançado de vendas.
 * - `vendas` é a listagem (até 1 000 linhas por chamada).
 * - `serie_por_dia` é a agregação diária para o gráfico.
 *
 * Espera tabelas:
 *   - vendas (com data, status, total_liquido, forma_pagamento, operador_id, cliente_id)
 *   - usuarios (vendedor.nome)
 *   - clientes (cliente.nome)
 *
 * Para datasets grandes considere usar a RPC `relatorio_vendas_avancado(p_de, p_ate, ...)`
 * (análoga à `relatorio_vendas_por_dia_periodo` já em produção).
 */
/**
 * Colunas escalares lidas de `vendas`. Ancoradas no schema gerado porque a
 * string do `.select()` (template com embeds) não é validada pelo tsc — foi
 * exatamente assim que `categoria_principal`, uma coluna que nunca existiu,
 * ficou no select e transformava o relatório inteiro em 42703.
 */
const COLS_VENDA = [
  'id',
  'data',
  'total_liquido',
  'forma_pagamento',
  'status',
] satisfies ReadonlyArray<keyof Database['public']['Tables']['vendas']['Row']>

export async function buscarRelatorioVendasAvancadoAction(
  filters: RelatorioVendasAvancadoFilters,
): Promise<
  | { ok: true } & RelatorioVendasAvancadoPayload
  | { ok: false; error: string }
> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()
    const tz = await getRelatorioTimezone(supabase)
    // Dia civil no fuso do relatório, não hora local do processo (Node roda em UTC
    // em produção) — ver mesmo fix em app/admin/dashboard/dashboardUtils.ts.
    const inicio = inicioDoDiaCivilEmUtc(filters.de, tz)
    const fimExclusivo = inicioDoDiaCivilEmUtc(subtrairDiasCivis(filters.ate, -1), tz)

    let query = supabase
      .from('vendas')
      .select(
        `
        ${COLS_VENDA.join(', ')},
        cliente:clientes!vendas_cliente_id_fkey ( nome ),
        vendedor:usuarios!vendas_operador_id_fkey ( nome )
      `,
      )
      .gte('data', inicio.toISOString())
      .lt('data', fimExclusivo.toISOString())
      .order('data', { ascending: false })
      .limit(1000)

    if (filters.vendedor_id) query = query.eq('operador_id', filters.vendedor_id)
    if (filters.forma_pagamento) query = query.eq('forma_pagamento', filters.forma_pagamento)

    const { data, error } = await query
    if (error) return { ok: false, error: mensagemErroComSecao('Relatório', error.message) }

    const vendas: VendaReportRow[] = (
      (data ?? []) as unknown as VendaQueryRow[]
    ).map((r) => {
      const cli = Array.isArray(r.cliente) ? r.cliente[0] : r.cliente
      const vd = Array.isArray(r.vendedor) ? r.vendedor[0] : r.vendedor
      return {
        id: r.id,
        data: r.data,
        cliente_nome: cli?.nome ?? null,
        vendedor_nome: vd?.nome ?? null,
        total_liquido: r.total_liquido ?? 0,
        forma_pagamento: r.forma_pagamento,
        status: (r.status ?? 'CONCLUIDA').toUpperCase(),
      }
    })

    // Agrupa série por dia (concluídas)
    const mapa = new Map<string, DiaSerie>()
    for (const v of vendas) {
      if (v.status !== 'CONCLUIDA' || !v.data) continue
      const dia = v.data.slice(0, 10)
      const acc = mapa.get(dia) ?? { dia, total_liquido: 0, num_vendas: 0 }
      acc.total_liquido += v.total_liquido
      acc.num_vendas += 1
      mapa.set(dia, acc)
    }
    const serie_por_dia = [...mapa.values()].sort((a, b) => a.dia.localeCompare(b.dia))

    const concluidas = vendas.filter((v) => v.status === 'CONCLUIDA')
    const faturamento = concluidas.reduce((s, v) => s + v.total_liquido, 0)
    const ticket = concluidas.length ? faturamento / concluidas.length : 0

    return {
      ok: true,
      filters,
      vendas,
      serie_por_dia,
      totais: {
        faturamento,
        num_concluidas: concluidas.length,
        num_canceladas: vendas.length - concluidas.length,
        ticket_medio: ticket,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao gerar relatório de vendas.' }
  }
}
