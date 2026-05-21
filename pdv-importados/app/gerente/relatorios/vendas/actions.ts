'use server'

import { createClient } from '@/lib/supabase/server'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

export type VendaReportRow = {
  id: string
  data: string | null
  cliente_nome: string | null
  vendedor_nome: string | null
  categoria_principal: string | null
  total_liquido: number
  forma_pagamento: string | null
  status: string
}

export type DiaSerie = { dia: string; total_liquido: number; num_vendas: number }

export type RelatorioVendasAvancadoFilters = {
  de: string // YYYY-MM-DD
  ate: string
  vendedor_id?: string
  categoria_id?: string
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
 * Consulta principal do relatório avançado de vendas.
 * - `vendas` é a listagem (até 1 000 linhas por chamada).
 * - `serie_por_dia` é a agregação diária para o gráfico.
 *
 * Espera tabelas:
 *   - vendas (com data, status, total_liquido, forma_pagamento, vendedor_id, cliente_id, categoria_principal)
 *   - usuarios (vendedor.nome)
 *   - clientes (cliente.nome)
 *
 * Para datasets grandes considere usar a RPC `relatorio_vendas_avancado(p_de, p_ate, ...)`
 * (análoga à `relatorio_vendas_por_dia_periodo` já em produção).
 */
export async function buscarRelatorioVendasAvancadoAction(
  filters: RelatorioVendasAvancadoFilters,
): Promise<
  | { ok: true } & RelatorioVendasAvancadoPayload
  | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const ateFim = new Date(filters.ate)
    ateFim.setHours(23, 59, 59, 999)

    let query = supabase
      .from('vendas')
      .select(
        `
        id, data, total_liquido, forma_pagamento, status, categoria_principal,
        cliente:clientes!vendas_cliente_id_fkey ( nome ),
        vendedor:usuarios!vendas_operador_id_fkey ( nome )
      `,
      )
      .gte('data', new Date(filters.de).toISOString())
      .lte('data', ateFim.toISOString())
      .order('data', { ascending: false })
      .limit(1000)

    if (filters.vendedor_id) query = query.eq('operador_id', filters.vendedor_id)
    if (filters.categoria_id) query = query.eq('categoria_id', filters.categoria_id)
    if (filters.forma_pagamento) query = query.eq('forma_pagamento', filters.forma_pagamento)

    const { data, error } = await query
    if (error) return { ok: false, error: mensagemErroComSecao('Relatório', error.message) }

    const vendas: VendaReportRow[] = (data ?? []).map((r) => {
      const cli = (r as any).cliente
      const vd = (r as any).vendedor
      return {
        id: String((r as any).id),
        data: ((r as any).data as string | null) ?? null,
        cliente_nome: cli && typeof cli === 'object' && 'nome' in cli ? String(cli.nome) : null,
        vendedor_nome: vd && typeof vd === 'object' && 'nome' in vd ? String(vd.nome) : null,
        categoria_principal: ((r as any).categoria_principal as string | null) ?? null,
        total_liquido: Number((r as any).total_liquido ?? 0),
        forma_pagamento: ((r as any).forma_pagamento as string | null) ?? null,
        status: String((r as any).status ?? 'CONCLUIDA').toUpperCase(),
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
