/**
 * Roadmap UX, Tarefa 8 — o preset de período de Movimentações vira um recorte de leitura
 * (`ocorrido_em >= início`) no kardex, calculado no fuso da loja. "Todos" não recorta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Chamada = [metodo: string, ...args: unknown[]]
const chamadas: Chamada[] = []

/** Query builder que registra a cadeia e resolve vazio. */
function builder(): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  for (const metodo of ['select', 'eq', 'in', 'gt', 'lt', 'gte', 'order', 'or', 'limit', 'maybeSingle']) {
    q[metodo] = (...args: unknown[]) => {
      chamadas.push([metodo, ...args])
      return q
    }
  }
  q.range = (...args: unknown[]) => {
    chamadas.push(['range', ...args])
    return Promise.resolve({ data: [], count: 0, error: null })
  }
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      chamadas.push(['from', tabela])
      return builder()
    },
  }),
}))
vi.mock('@/lib/admin/auth/loadAdminContext', () => ({
  loadAdminContext: async () => ({ session: { lojaId: 'loja-1', idioma: 'pt' } }),
}))
vi.mock('@/lib/relatorios/getRelatorioTimezone', () => ({
  getRelatorioTimezone: async () => 'America/Sao_Paulo',
}))

const { listarMovimentacoesEstoque } = await import('./actions')

const gtes = () => chamadas.filter(([m]) => m === 'gte')

describe('listarMovimentacoesEstoque — período', () => {
  beforeEach(() => {
    chamadas.length = 0
    vi.useFakeTimers()
    // 2026-10-15 12:00 em São Paulo (15:00Z)
    vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
  })

  it('"tudo" (default) não recorta por data — comportamento anterior', async () => {
    await listarMovimentacoesEstoque('', '', 1)
    expect(gtes()).toEqual([])
    await listarMovimentacoesEstoque('', '', 1, 'tudo')
    expect(gtes()).toEqual([])
  })

  it('7d começa à meia-noite (fuso da loja) de 6 dias atrás', async () => {
    await listarMovimentacoesEstoque('', '', 1, '7d')
    expect(gtes()).toEqual([['gte', 'ocorrido_em', '2026-10-09T03:00:00.000Z']])
  })

  it('mês atual começa no dia 1 à meia-noite do fuso da loja', async () => {
    await listarMovimentacoesEstoque('', '', 1, 'mes')
    expect(gtes()).toEqual([['gte', 'ocorrido_em', '2026-10-01T03:00:00.000Z']])
  })

  it('o recorte convive com o filtro de sentido e a paginação', async () => {
    await listarMovimentacoesEstoque('', 'saida', 2, '30d')
    const metodos = chamadas.map(([m]) => m)
    expect(metodos).toContain('lt')
    expect(gtes()).toEqual([['gte', 'ocorrido_em', '2026-09-16T03:00:00.000Z']])
    expect(chamadas.find(([m]) => m === 'range')).toEqual(['range', 50, 99])
  })
})
