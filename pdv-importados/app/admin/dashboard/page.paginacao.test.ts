/**
 * B1 — o Dashboard pagina as consultas de `vendas` do período (atual e anterior) e avisa de forma explícita
 * quando o teto de páginas é atingido, em vez de exibir totais truncados como se fossem completos.
 */
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Query = { table: string; select?: unknown; ranges: Array<[number, number]>; orders: string[] }
const queries: Query[] = []
let volume: 'pequeno' | 'infinito' = 'pequeno'

function linhaPeriodo(i: number) {
  return {
    id: `v${i}`,
    data: new Date().toISOString(),
    total_liquido: 10,
    status: 'CONCLUIDA',
    forma_pagamento: 'PIX',
    operador_id: null,
    venda_pos_venda_operacoes: [],
  }
}

function resolveQuery(q: Query) {
  if (q.table === 'vendas' && q.ranges.length > 0) {
    const [from, to] = q.ranges[q.ranges.length - 1]
    const n = volume === 'infinito' ? to - from + 1 : from === 0 ? 3 : 0
    return { data: Array.from({ length: n }, (_, i) => linhaPeriodo(from + i)), error: null, count: n }
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
import { DASHBOARD_MAX_PAGES } from './dashboardUtils'
import { getMessages } from '@/i18n/getMessages'

function contemTexto(node: unknown, alvo: string): boolean {
  if (typeof node === 'string') return node.includes(alvo)
  if (Array.isArray(node)) return node.some((n) => contemTexto(n, alvo))
  if (React.isValidElement(node)) return contemTexto((node.props as { children?: unknown }).children, alvo)
  return false
}

const AVISO = getMessages('pt').admin_ui.dashboard_dados_incompletos

describe('Dashboard — paginação das vendas do período (B1)', () => {
  beforeEach(() => {
    queries.length = 0
    volume = 'pequeno'
  })

  it('usa range + ordenação estável (data, id) nas duas consultas do período e não avisa com volume baixo', async () => {
    const tree = await AdminDashboardPage({ searchParams: Promise.resolve({}) })
    const paginadas = queries.filter((q) => q.table === 'vendas' && q.ranges.length > 0)
    expect(paginadas).toHaveLength(2) // atual + anterior
    for (const q of paginadas) {
      expect(q.orders).toEqual(['data', 'id'])
      expect(q.ranges[0]).toEqual([0, 999])
    }
    expect(AVISO).toBeTruthy()
    expect(contemTexto(tree, AVISO)).toBe(false)
  })

  it('teto de páginas atingido: busca até o teto e mostra aviso visível de dados possivelmente incompletos', async () => {
    volume = 'infinito'
    const tree = await AdminDashboardPage({ searchParams: Promise.resolve({}) })
    const paginadas = queries.filter((q) => q.table === 'vendas' && q.ranges.length > 0)
    // 2 consultas (atual + anterior) × teto de páginas, cada página uma chamada `.range` nova
    expect(paginadas).toHaveLength(2 * DASHBOARD_MAX_PAGES)
    const inicios = paginadas.map((q) => q.ranges[0][0]).sort((x, y) => x - y)
    expect(inicios[0]).toBe(0)
    expect(inicios[inicios.length - 1]).toBe((DASHBOARD_MAX_PAGES - 1) * 1000)
    expect(contemTexto(tree, AVISO)).toBe(true)
  })
})
