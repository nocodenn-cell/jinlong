import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import { FINANCEIRO_TAB_ORDER, type FinanceiroTabId } from './financeiroTabId'
import {
  FINANCEIRO_GROUPS,
  buildFinanceiroHub,
  financeiroGroupOf,
  type FinanceiroHubLabels,
} from './financeiroHubGroups'

const L: FinanceiroHubLabels = {
  resumo: 'Resumo',
  resultado: 'Resultado de caixa',
  receber: 'A receber',
  pagar: 'A pagar',
  contasConciliacao: 'Contas e conciliação',
  contas: 'Contas e saldos',
  recebiveis: 'PIX e cartões',
  conciliacao: 'Conciliação',
  fiscal: 'Fiscal',
  comissoes: 'Comissões',
}
const hub = (tab: FinanceiroTabId, pathname: string = ROUTES.admin.financeiro, qs = '') =>
  buildFinanceiroHub({ pathname, activeTab: tab, searchParams: new URLSearchParams(qs), labels: L })

describe('Financeiro — barra agrupada (PR 5)', () => {
  it('nenhuma aba some: todo ?tab= atual continua alcançável e pertence a exatamente um grupo', () => {
    const todas = FINANCEIRO_GROUPS.flatMap((g) => [...g.tabs])
    expect(new Set(todas).size).toBe(todas.length)
    expect([...todas].sort()).toEqual([...FINANCEIRO_TAB_ORDER].sort())
  })

  it('a linha principal tem 6 controles (categorias foram para Loja e equipe)', () => {
    const { primary } = hub('receber')
    expect(primary.map((i) => i.label)).toEqual([
      'Resumo',
      'A receber',
      'A pagar',
      'Contas e conciliação',
      'Fiscal',
      'Comissões',
    ])
  })

  it('cada item principal entra pela primeira aba do grupo (URLs antigas preservadas)', () => {
    const h = Object.fromEntries(hub('receber').primary.map((i) => [i.id, i.href]))
    expect(h.resumo).toBe('/admin/financeiro?tab=resumo')
    expect(h.contas).toBe('/admin/financeiro?tab=contas')
    expect(h.fiscal).toBe('/admin/financeiro?tab=fiscal')
    expect(h.comissoes).toBe(ROUTES.admin.comissoes)
    // Categorias financeiras mudaram para Loja e equipe (IA por jornada).
    expect(h.categorias).toBeUndefined()
  })

  it.each([
    ['resumo', 'resumo'],
    ['resultado', 'resumo'],
    ['receber', 'receber'],
    ['pagar', 'pagar'],
    ['contas', 'contas'],
    ['recebiveis', 'contas'],
    ['conciliacao', 'contas'],
    ['fiscal', 'fiscal'],
  ] as const)('aba %s ativa o grupo %s', (tab, grupo) => {
    expect(financeiroGroupOf(tab)).toBe(grupo)
    expect(hub(tab).primary.filter((i) => i.active).map((i) => i.id)).toEqual([grupo])
  })

  it('grupo com várias vistas mostra o seletor; o Resultado de caixa fica dentro do Resumo', () => {
    expect(hub('contas').secondary?.map((i) => i.label)).toEqual(['Contas e saldos', 'PIX e cartões', 'Conciliação'])
    expect(hub('resumo').secondary?.map((i) => i.label)).toEqual(['Resumo', 'Resultado de caixa'])
    expect(hub('resultado').secondary?.find((i) => i.active)?.id).toBe('resultado')
    expect(hub('conciliacao').secondary?.find((i) => i.active)?.id).toBe('conciliacao')
  })

  it('grupos de uma vista só não mostram seletor', () => {
    for (const tab of ['receber', 'pagar', 'fiscal'] as const) expect(hub(tab).secondary, tab).toBeNull()
  })

  it('Comissões (página própria) marca só o próprio item e não mostra seletor', () => {
    const c = hub('receber', ROUTES.admin.comissoes)
    expect(c.primary.filter((i) => i.active).map((i) => i.id)).toEqual(['comissoes'])
    expect(c.secondary).toBeNull()
  })

  it('documento fiscal (rota própria) não ativa nenhum item pela rota', () => {
    expect(hub('fiscal', '/admin/financeiro/documento/abc').primary.filter((i) => i.active)).toEqual([])
  })

  it('trocar de vista preserva só os parâmetros da vista (sem filtros fantasma)', () => {
    const h = hub('contas', ROUTES.admin.financeiro, 'tab=contas&de=2026-09-01&ate=2026-09-30&pagina=3&status=aberto')
    const rec = h.secondary!.find((i) => i.id === 'recebiveis')!
    const u = new URL(rec.href, 'http://x')
    expect(u.searchParams.get('tab')).toBe('recebiveis')
    expect(u.searchParams.get('de')).toBe('2026-09-01')
    expect(u.searchParams.get('pagina')).toBe('3')
    expect(u.searchParams.has('status')).toBe(false)
  })
})
