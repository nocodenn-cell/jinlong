/**
 * Roadmap UX, Tarefa 7 — drill-down do Dashboard: Faturamento/Ticket levam a `?detalhe=vendas`,
 * Pedidos a `?detalhe=pedidos` (preservando o período); com `detalhe` na URL a página abre a
 * gaveta com os dados que já carregou. Estoque continua levando à tela de Estoque.
 */
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Query = { table: string; select?: unknown; ranges: Array<[number, number]>; orders: string[] }
const queries: Query[] = []
let volume: 'pequeno' | 'infinito' = 'pequeno'

const LINHA_PERIODO = {
  id: 'v0',
  data: '2026-01-15T15:00:00.000Z',
  total_liquido: 10,
  status: 'CONCLUIDA',
  forma_pagamento: 'PIX',
  operador_id: null,
  venda_pos_venda_operacoes: [] as Array<{ valor_estornado: number }>,
}

/** Página cheia (1000) reutilizada: o teto depende do tamanho, não de 20 mil objetos novos. */
const PAGINA_CHEIA = Array.from({ length: 1000 }, () => LINHA_PERIODO)

function linhasPeriodo(n: number) {
  if (n === 1000) return PAGINA_CHEIA
  if (n <= 0) return []
  return Array.from({ length: n }, () => LINHA_PERIODO)
}

function resolveQuery(q: Query) {
  if (q.table === 'vendas' && q.ranges.length > 0) {
    const [from, to] = q.ranges[q.ranges.length - 1]
    const n = volume === 'infinito' ? to - from + 1 : from === 0 ? 3 : 0
    return { data: linhasPeriodo(n), error: null, count: n }
  }
  return { data: [], error: null, count: 0 }
}

function builder(table: string): unknown {
  const q: Query = { table, ranges: [], orders: [] }
  queries.push(q)
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown) => res(resolveQuery(q))
      return (...args: unknown[]) => {
        if (prop === 'select') q.select = args[0]
        if (prop === 'range') q.ranges.push([Number(args[0]), Number(args[1])])
        if (prop === 'order') q.orders.push(String(args[0]))
        return new Proxy({}, handler)
      }
    },
  }
  return new Proxy({}, handler)
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: builder }) }))
vi.mock('@/lib/relatorios/getRelatorioTimezone', () => ({ getRelatorioTimezone: async () => 'America/Sao_Paulo' }))
vi.mock('@/lib/admin/auth/loadAdminContext', () => ({
  loadAdminContext: async () => ({ session: { idioma: 'pt' } }),
}))
vi.mock('@/lib/admin/sinaisVisuaisAdmin', () => ({
  contarEstoqueBaixo: async () => ({ count: 0, data: null, error: null }),
  lerFlagsVisuaisPdv: async () => ({ data: [{ show_stock_alerts: false }], error: null }),
}))

import AdminDashboardPage from './page'
import { DashboardKpiDrawer } from './_components/DashboardKpiDrawer'
import { ROUTES } from '@/lib/navigation/routes'
import { getMessages } from '@/i18n/getMessages'

/** Primeiro elemento da árvore cujo `type` é `tipo` (desce por props, inclusive JSX em props). */
function acharElemento(node: unknown, tipo: unknown, seen = new Set<unknown>()): React.ReactElement | null {
  if (node == null || typeof node !== 'object' || seen.has(node)) return null
  seen.add(node)
  if (Array.isArray(node)) {
    for (const item of node) {
      const achado = acharElemento(item, tipo, seen)
      if (achado) return achado
    }
    return null
  }
  if (!React.isValidElement(node)) return null
  if (node.type === tipo) return node
  for (const value of Object.values(node.props as Record<string, unknown>)) {
    const achado = acharElemento(value, tipo, seen)
    if (achado) return achado
  }
  return null
}

/** Itens de KPI passados à visão geral (o elemento com a prop `kpis`). */
function kpis(tree: unknown): Array<{ label: string; href?: string; scroll?: boolean }> {
  return (acharVisao(tree)?.props as { kpis: Array<{ label: string; href?: string; scroll?: boolean }> }).kpis
}

function acharVisao(node: unknown, seen = new Set<unknown>()): React.ReactElement | null {
  if (node == null || typeof node !== 'object' || seen.has(node)) return null
  seen.add(node)
  if (Array.isArray(node)) return node.map((n) => acharVisao(n, seen)).find(Boolean) ?? null
  if (!React.isValidElement(node)) return null
  if ((node.props as Record<string, unknown>).kpis) return node
  for (const value of Object.values(node.props as Record<string, unknown>)) {
    const achado = acharVisao(value, seen)
    if (achado) return achado
  }
  return null
}

const L = getMessages('pt').admin.dashboard

describe('Dashboard — drill-down dos KPIs (Tarefa 7)', () => {
  beforeEach(() => {
    queries.length = 0
    volume = 'pequeno'
  })

  it('Faturamento/Ticket abrem ?detalhe=vendas e Pedidos ?detalhe=pedidos, preservando o período', async () => {
    const tree = await AdminDashboardPage({ searchParams: Promise.resolve({ period: '7D' }) })
    const porLabel = new Map(kpis(tree).map((k) => [k.label, k]))
    expect(porLabel.get(L.metricTotalSales.pt)?.href).toBe('/admin/dashboard?period=7D&detalhe=vendas')
    expect(porLabel.get(L.metricTicket.pt)?.href).toBe('/admin/dashboard?period=7D&detalhe=vendas')
    expect(porLabel.get(L.metricOrders.pt)?.href).toBe('/admin/dashboard?period=7D&detalhe=pedidos')
    expect(porLabel.get(L.metricTotalSales.pt)?.scroll).toBe(false)
    // regressão: Estoque continua navegando para a tela de Estoque
    expect(porLabel.get(L.metricStock.pt)?.href).toBe(ROUTES.admin.estoque)
  })

  it('sem ?detalhe= a gaveta fica fechada', async () => {
    const tree = await AdminDashboardPage({ searchParams: Promise.resolve({ period: '7D' }) })
    const gaveta = acharElemento(tree, DashboardKpiDrawer)
    expect((gaveta?.props as { open: boolean }).open).toBe(false)
  })

  it('?detalhe=vendas abre a gaveta de vendas, e fechar volta ao período', async () => {
    const tree = await AdminDashboardPage({ searchParams: Promise.resolve({ period: '7D', detalhe: 'vendas' }) })
    const props = acharElemento(tree, DashboardKpiDrawer)?.props as { open: boolean; title: string; closeHref: string }
    expect(props.open).toBe(true)
    expect(props.title).toBe(L.detalheVendasTitulo.pt)
    expect(props.closeHref).toBe('/admin/dashboard?period=7D')
  })

  it('?detalhe=pedidos abre a gaveta de pedidos', async () => {
    const tree = await AdminDashboardPage({ searchParams: Promise.resolve({ detalhe: 'pedidos' }) })
    const props = acharElemento(tree, DashboardKpiDrawer)?.props as { open: boolean; title: string }
    expect(props.open).toBe(true)
    expect(props.title).toBe(L.detalhePedidosTitulo.pt)
  })
})
