/**
 * Onda A — TESTE DE CONTRATO ENTRE TELAS.
 *
 * Mesmo cenário (idêntico ao harness SQL backend/scripts/vendas-lista-kpis-por-venda.test.sql, cujas
 * constantes o banco já provou): 4 vendas; 3 concluídas = 353,90; 1 cancelada = 129,90; devolução
 * pós-venda = 50,00. Verifica que Dashboard, Vendas, Relatórios e CSV contam os mesmos fatos.
 *
 * Os stubs de RPC devolvem exatamente o que o banco devolve nesse cenário (numerics como string).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── valores de referência (= saída provada do harness SQL) ──────────────────────────────────
const LOJA = 'a0000001-0000-4000-8000-000000000001'

const LISTA_RPC = [
  { venda_id: 'v4', status: 'CANCELADA', data: '2026-09-30T16:00:00Z', total_liquido: '129.90', total_bruto: '129.90', forma_pagamento: 'DINHEIRO', caixa_id: 'c', operador_id: 'o', qtd_itens_total: '1', qtd_itens_distintos: 1, primeiro_produto: 'Cabo' },
  { venda_id: 'v3', status: 'CONCLUIDA', data: '2026-09-30T15:00:00Z', total_liquido: '130.00', total_bruto: '130.00', forma_pagamento: 'PIX', caixa_id: 'c', operador_id: 'o', qtd_itens_total: '2', qtd_itens_distintos: 2, primeiro_produto: 'Fone' },
  { venda_id: 'v2', status: 'CONCLUIDA', data: '2026-09-30T14:00:00Z', total_liquido: '123.90', total_bruto: '123.90', forma_pagamento: 'DINHEIRO', caixa_id: 'c', operador_id: 'o', qtd_itens_total: '1', qtd_itens_distintos: 1, primeiro_produto: 'Case' },
  { venda_id: 'v1', status: 'CONCLUIDA', data: '2026-09-30T13:00:00Z', total_liquido: '100.00', total_bruto: '100.00', forma_pagamento: 'PIX', caixa_id: 'c', operador_id: 'o', qtd_itens_total: '5', qtd_itens_distintos: 2, primeiro_produto: 'Carregador' },
]

const KPIS_RPC = {
  vendas_registradas: 4,
  vendas_concluidas: 3,
  faturado: '353.90',
  vendas_canceladas: 1,
  valor_cancelado: '129.90',
  devolucoes: '50.00',
  receita_liquida: '303.90',
  ticket_medio: '117.9666666666666667',
  taxa_cancelamento: '0.2500',
}

/** Relatórios: RPCs existentes (vendas.status = CONCLUIDA, por vendas.data). */
const RESUMO_RPC = {
  itens_vendidos: 9,
  vendas_concluidas: 3,
  vendas_canceladas: 1,
  taxa_cancelamento: 0.25,
  cobertura_custo: 1,
  custo_confiavel: true,
  margem_bruta_estimada: 100,
}
const POR_DIA_RPC = [
  { dia: '2026-09-30', num_vendas: 3, total_liquido: 353.9, ticket_medio: 117.9667, total_desconto: 0 },
]

/** Dashboard: linhas de `vendas` (CONCLUIDA) com devoluções embutidas — mesmo universo. */
const DASHBOARD_ROWS = [
  { status: 'CONCLUIDA', total_liquido: 100, devolucoes: [] },
  { status: 'CONCLUIDA', total_liquido: 123.9, devolucoes: [{ valor: 50, operacao_id: 'op-1' }] },
  { status: 'CONCLUIDA', total_liquido: 130, devolucoes: [] },
]

// ── mocks de infraestrutura ─────────────────────────────────────────────────────────────────
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

function chain(): unknown {
  const result = { data: [], error: null, count: 0 }
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown) => res(result)
      return () => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

const supabaseStub = {
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args })
    switch (name) {
      case 'listar_vendas_gerente': {
        const status = args.p_status as string[] | null
        const rows = status ? LISTA_RPC.filter((r) => status.includes(r.status)) : LISTA_RPC
        const off = Number(args.p_offset ?? 0)
        const lim = Number(args.p_limit ?? 100)
        return { data: rows.slice(off, off + lim), error: null }
      }
      case 'kpis_vendas_gerente':
        return { data: [KPIS_RPC], error: null }
      case 'relatorio_resumo_executivo_periodo':
        return { data: [RESUMO_RPC], error: null }
      case 'relatorio_vendas_por_dia_periodo':
        return { data: POR_DIA_RPC, error: null }
      default:
        return { data: [], error: null }
    }
  }),
  from: vi.fn(() => chain()),
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supabaseStub }))
vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: async () => ({ ok: true, session: { userId: 'u1' } }),
}))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId: async () => LOJA }))
vi.mock('@/lib/relatorios/getRelatorioTimezone', () => ({
  getRelatorioTimezone: async () => 'America/Sao_Paulo',
}))
vi.mock('@/app/caixa/actions', () => ({ cancelarVenda: vi.fn() }))
vi.mock('@/app/gerente/vendas/devolverOuTrocarVenda.impl', () => ({ devolverOuTrocarVendaImpl: vi.fn() }))

import {
  buscarVendasPaginadasAction,
  obterKpisVendas,
  obterVendasCompletaParaExport,
} from '@/app/gerente/vendas/actions'
import { carregarDadosRelatoriosGerente } from '@/app/gerente/relatorios/actions'
import { sumFaturamento } from '@/app/admin/relatorios/_components/relatoriosUi'
import { calcularMetricasVendas, formatarPercentual } from '@/lib/vendas/metricasVendas'

const FILTRO_TODOS = { inicio: null, fim: null, status: [], formaPagamento: [] } as const

describe('contrato entre telas — Onda A (4 vendas, 3 concluídas = 353,90, 1 cancelada = 129,90, devolução 50,00)', () => {
  beforeEach(() => {
    rpcCalls.length = 0
  })

  it('VENDAS: lista e CSV usam a mesma identidade (uma linha por venda, UUID único, status atual)', async () => {
    const pagina = await buscarVendasPaginadasAction(1, FILTRO_TODOS)
    expect(pagina.ok).toBe(true)
    if (!pagina.ok) return

    const csv = await obterVendasCompletaParaExport(FILTRO_TODOS)

    for (const vendas of [pagina.vendas, csv]) {
      expect(vendas).toHaveLength(4)
      expect(new Set(vendas.map((v) => v.id)).size).toBe(4)
      expect(vendas.filter((v) => v.status === 'CONCLUIDA')).toHaveLength(3)
      expect(vendas.filter((v) => v.status === 'CANCELADA')).toHaveLength(1)
    }
    // lista e exportação: mesma população, na mesma ordem
    expect(csv.map((v) => v.id)).toEqual(pagina.vendas.map((v) => v.id))
    // o ledger de eventos não é consultado
    expect(rpcCalls.every((c) => !/venda_eventos/.test(c.name))).toBe(true)
    // cancelada fora do faturado somado a partir das linhas concluídas
    const somaConcluidas = csv
      .filter((v) => v.status === 'CONCLUIDA')
      .reduce((a, v) => a + Number(v.total_liquido), 0)
    expect(Math.round(somaConcluidas * 100) / 100).toBe(353.9)
  })

  it('VENDAS: filtro por status CANCELADA devolve só a venda cancelada', async () => {
    const r = await buscarVendasPaginadasAction(1, { ...FILTRO_TODOS, status: ['CANCELADA'] })
    expect(r.ok && r.vendas).toHaveLength(1)
    expect(rpcCalls.find((c) => c.name === 'listar_vendas_gerente')?.args.p_status).toEqual(['CANCELADA'])
  })

  it('VENDAS: paginação por cursor (hasMore) sem duplicar vendas entre páginas', async () => {
    // PAGE_SIZE = 20 e há 4 vendas: uma página só, sem hasMore
    const r = await buscarVendasPaginadasAction(1, FILTRO_TODOS)
    expect(r.ok && r.hasMore).toBe(false)
  })

  it('VENDAS: KPIs canônicos', async () => {
    const k = await obterKpisVendas(FILTRO_TODOS)
    expect(k.qtdConcluidas).toBe(3)
    expect(k.qtdCanceladas).toBe(1)
    expect(k.faturado).toBe(353.9)
    expect(k.valorCanceladas).toBe(129.9)
    expect(k.ticketMedio.toFixed(2)).toBe('117.97')
    expect(k.taxaCancelamento).toBe(0.25)
    expect(k.devolucoes).toBe(50)
    expect(k.receitaLiquida).toBe(303.9)
  })

  it('DASHBOARD: mesma definição, aplicada às linhas de vendas CONCLUIDA com devoluções embutidas', () => {
    const m = calcularMetricasVendas(DASHBOARD_ROWS)
    expect(m.vendasConcluidas).toBe(3)
    expect(m.faturado).toBe(353.9)
    expect(m.ticketMedio.toFixed(2)).toBe('117.97')
    expect(m.devolucoes).toBe(50)
    expect(m.receitaLiquida).toBe(303.9)
  })

  it('RELATÓRIOS: contagens, faturamento, taxa, devolução e receita líquida concordam', async () => {
    const d = await carregarDadosRelatoriosGerente({ de: '2026-09-30', ate: '2026-09-30' })
    expect(d.resumoExecutivo.vendas_concluidas).toBe(3)
    expect(d.resumoExecutivo.vendas_canceladas).toBe(1)
    expect(d.resumoExecutivo.taxa_cancelamento).toBe(0.25)
    expect(formatarPercentual(d.resumoExecutivo.taxa_cancelamento)).toBe('25,0%')
    expect(Math.round(sumFaturamento(d.porDia) * 100) / 100).toBe(353.9)
    expect(d.devolucoes).toBe(50)
    expect(d.receitaLiquida).toBe(303.9)
    // limites do período: dia civil inteiro no fuso da loja, com a loja do gerente
    const kpis = rpcCalls.find((c) => c.name === 'kpis_vendas_gerente')
    expect(kpis?.args.p_loja_id).toBe(LOJA)
    expect(kpis?.args.p_inicio).toBe('2026-09-30T03:00:00.000Z')
    expect(kpis?.args.p_fim).toBe('2026-10-01T02:59:59.999Z')
  })

  it('TODAS AS TELAS: mesmos fatos (concluídas, canceladas, faturado, ticket, taxa, devolução, receita líquida)', async () => {
    const vendas = await obterKpisVendas(FILTRO_TODOS)
    const relat = await carregarDadosRelatoriosGerente({ de: '2026-09-30', ate: '2026-09-30' })
    const dash = calcularMetricasVendas(DASHBOARD_ROWS)

    expect(vendas.qtdConcluidas).toBe(relat.resumoExecutivo.vendas_concluidas)
    expect(vendas.qtdConcluidas).toBe(dash.vendasConcluidas)
    expect(vendas.qtdCanceladas).toBe(relat.resumoExecutivo.vendas_canceladas)
    expect(vendas.faturado).toBeCloseTo(sumFaturamento(relat.porDia), 2)
    expect(vendas.faturado).toBeCloseTo(dash.faturado, 2)
    expect(vendas.ticketMedio).toBeCloseTo(dash.ticketMedio, 4)
    expect(vendas.taxaCancelamento).toBe(relat.resumoExecutivo.taxa_cancelamento)
    expect(vendas.devolucoes).toBe(relat.devolucoes)
    expect(vendas.devolucoes).toBe(dash.devolucoes)
    expect(vendas.receitaLiquida).toBe(relat.receitaLiquida)
    expect(vendas.receitaLiquida).toBe(dash.receitaLiquida)
  })
})
