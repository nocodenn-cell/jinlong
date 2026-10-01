/**
 * Onda A — o Dashboard mede a MESMA população de Vendas/Relatórios: só vendas CONCLUIDA
 * (cancelada não é faturamento nem pedido), com devolução pós-venda à parte. "Últimos pedidos"
 * continua podendo mostrar canceladas (informação histórica/operacional).
 *
 * Cenário: 4 vendas (3 concluídas = 353,90; 1 cancelada = 129,90), devolução pós-venda de 50,00.
 */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

type Row = {
  id: string
  data: string
  total_liquido: number
  status: 'CONCLUIDA' | 'CANCELADA'
  forma_pagamento: string
  operador_id: string | null
  devolucoes: Array<{ valor: number; operacao_id: string | null }>
}

const AGORA = new Date().toISOString()
const TODAS: Row[] = [
  { id: 'v1', data: AGORA, total_liquido: 100, status: 'CONCLUIDA', forma_pagamento: 'PIX', operador_id: null, devolucoes: [] },
  { id: 'v2', data: AGORA, total_liquido: 123.9, status: 'CONCLUIDA', forma_pagamento: 'DINHEIRO', operador_id: null, devolucoes: [{ valor: 50, operacao_id: 'op-1' }] },
  { id: 'v3', data: AGORA, total_liquido: 130, status: 'CONCLUIDA', forma_pagamento: 'PIX', operador_id: null, devolucoes: [] },
  { id: 'v4', data: AGORA, total_liquido: 129.9, status: 'CANCELADA', forma_pagamento: 'DINHEIRO', operador_id: null, devolucoes: [{ valor: 129.9, operacao_id: null }] },
]

type Query = { table: string; select?: unknown; eqs: Array<[string, unknown]> }
const queries: Query[] = []

function resolveQuery(q: Query) {
  if (q.table === 'vendas') {
    const soConcluida = q.eqs.some(([k, v]) => k === 'status' && v === 'CONCLUIDA')
    const soCancelada = q.eqs.some(([k, v]) => k === 'status' && v === 'CANCELADA')
    const data = TODAS.filter((r) =>
      soConcluida ? r.status === 'CONCLUIDA' : soCancelada ? r.status === 'CANCELADA' : true,
    )
    return { data, error: null, count: data.length }
  }
  return { data: [], error: null, count: 0 }
}

function builder(table: string): unknown {
  const q: Query = { table, eqs: [] }
  queries.push(q)
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown) => res(resolveQuery(q))
      return (...args: unknown[]) => {
        if (prop === 'select') q.select = args[0]
        if (prop === 'eq') q.eqs.push([String(args[0]), args[1]])
        return new Proxy({}, handler)
      }
    },
  }
  return new Proxy({}, handler)
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: builder }) }))
vi.mock('@/lib/relatorios/getRelatorioTimezone', () => ({
  getRelatorioTimezone: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/admin/auth/loadAdminContext', () => ({
  loadAdminContext: async () => ({ session: { idioma: 'pt' } }),
}))
vi.mock('@/lib/admin/sinaisVisuaisAdmin', () => ({
  contarEstoqueBaixo: async () => ({ count: 0, data: null, error: null }),
  lerFlagsVisuaisPdv: async () => ({ data: [{ show_stock_alerts: false }], error: null }),
}))

import AdminDashboardPage from './page'
import { formatBRL } from '@/lib/format/money'

type Card = { label: string; value: string; hint?: string }

/** Coleta os props de MetricCard percorrendo a árvore de elementos devolvida pelo Server Component. */
function coletarCards(node: unknown, out: Card[] = []): Card[] {
  if (Array.isArray(node)) {
    node.forEach((n) => coletarCards(n, out))
  } else if (React.isValidElement(node)) {
    const p = node.props as Record<string, unknown>
    if (typeof p.label === 'string' && typeof p.value === 'string' && 'icon' in p) {
      out.push({ label: p.label, value: p.value, hint: p.hint as string | undefined })
    }
    coletarCards(p.children, out)
  }
  return out
}

describe('Dashboard — população e fórmulas canônicas (Onda A)', () => {
  it('mede só vendas CONCLUIDA no período e no período anterior', async () => {
    queries.length = 0
    await AdminDashboardPage({ searchParams: Promise.resolve({}) })

    const vendasQ = queries.filter((q) => q.table === 'vendas')
    const periodoAtual = vendasQ.find((q) => String(q.select).includes('devolucoes'))
    const periodoAnterior = vendasQ.find(
      (q) => String(q.select) === 'total_liquido,status',
    )
    const recentes = vendasQ.find((q) => String(q.select).includes('operador_id') && !String(q.select).includes('devolucoes'))

    expect(periodoAtual?.eqs).toContainEqual(['status', 'CONCLUIDA'])
    expect(periodoAnterior?.eqs).toContainEqual(['status', 'CONCLUIDA'])
    // "Últimos pedidos" não filtra status por padrão: pode mostrar cancelada
    expect(recentes?.eqs.some(([k]) => k === 'status')).toBe(false)
  })

  it('faturado = 353,90, pedidos = 3, ticket = 117,97; cancelada fora; devolução à parte', async () => {
    const tree = await AdminDashboardPage({ searchParams: Promise.resolve({}) })
    const cards = coletarCards(tree)

    const vendas = cards.find((c) => c.value === formatBRL(353.9, 'pt-BR'))
    expect(vendas, `cards: ${JSON.stringify(cards)}`).toBeTruthy()
    expect(cards.some((c) => c.value === '3')).toBe(true) // pedidos = concluídas
    expect(cards.some((c) => c.value === formatBRL(353.9 / 3, 'pt-BR'))).toBe(true) // ticket
    // nada de 483,80 (incluindo a cancelada) nem 4 pedidos
    expect(cards.some((c) => c.value === formatBRL(483.8, 'pt-BR'))).toBe(false)
    expect(cards.some((c) => c.value === '4')).toBe(false)

    expect(vendas!.hint).toContain(formatBRL(50, 'pt-BR'))
    expect(vendas!.hint).toContain(formatBRL(303.9, 'pt-BR'))
  })
})
