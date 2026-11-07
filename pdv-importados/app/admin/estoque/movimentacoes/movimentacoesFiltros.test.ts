/**
 * Roadmap UX, Tarefa 8 — filtros de Movimentações no padrão do Admin V2: busca + sentido +
 * presets de período (Todos · 7 dias · 30 dias · Mês atual), tudo espelhado na URL.
 * "Todos" é o default e preserva o comportamento anterior (sem recorte de data).
 */
import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import {
  PERIODOS_MOVIMENTACAO,
  filtrosMovimentacao,
  hrefMovimentacoes,
  periodoMovimentacao,
  sentidoAtivo,
} from './movimentacoesFiltros'

const ui = getMessages('pt').admin_ui

describe('Movimentações — filtros', () => {
  it('oferece os presets 7d / 30d / mês atual, com "Todos" como default', () => {
    const periodo = filtrosMovimentacao(ui).find((f) => f.key === 'periodo')
    expect(periodo?.type).toBe('pills')
    if (periodo?.type !== 'pills') throw new Error('periodo deve ser pills')
    expect(periodo.defaultValue).toBe('tudo')
    expect(periodo.options.map((o) => o.value)).toEqual(['tudo', '7d', '30d', 'mes'])
    expect(periodo.options.map((o) => o.label)).toEqual([
      ui.filtro_todos,
      ui.auditoria_periodo_7d,
      ui.vendas_periodo_label_30d,
      ui.vendas_periodo_label_mes,
    ])
  })

  it('mantém busca e sentido (regressão)', () => {
    const chaves = filtrosMovimentacao(ui).map((f) => `${f.type}:${f.key}`)
    expect(chaves).toEqual(['search:q', 'pills:sentido', 'pills:periodo'])
  })

  it('normaliza período e sentido vindos da URL', () => {
    expect(PERIODOS_MOVIMENTACAO).toEqual(['tudo', '7d', '30d', 'mes'])
    expect(periodoMovimentacao('30d')).toBe('30d')
    expect(periodoMovimentacao('hoje')).toBe('tudo') // fora dos presets desta tela
    expect(periodoMovimentacao(undefined)).toBe('tudo')
    expect(sentidoAtivo('entrada')).toBe('entrada')
    expect(sentidoAtivo('xyz')).toBe('')
  })

  it('a paginação preserva o período; "tudo" não polui a URL', () => {
    expect(hrefMovimentacoes({ q: 'cabo', sentido: 'saida', periodo: '7d', page: 2 })).toBe(
      '/admin/estoque/movimentacoes?q=cabo&sentido=saida&page=2&periodo=7d',
    )
    expect(hrefMovimentacoes({ q: '', sentido: '', periodo: 'tudo', page: 3 })).toBe(
      '/admin/estoque/movimentacoes?q=&sentido=&page=3',
    )
  })
})
