import { describe, expect, it } from 'vitest'
import {
  CAIXAS_PERIODOS,
  clampPage,
  oneOf,
  periodoFim,
  periodoInicio,
} from './caixasFiltros'
import {
  agregarMovimentosPorCaixa,
  mapCaixaAbertoLinha,
  mapCaixaHistoricoLinha,
  normalizarTipoMovimentacao,
  temDiferenca,
} from './caixasHistorico'

// Quarta-feira, 2026-09-30 15:30 (hora local do runner).
const AGORA = new Date(2026, 8, 30, 15, 30, 0)

describe('períodos do histórico de caixas', () => {
  it('tudo não limita o intervalo', () => {
    expect(periodoInicio('tudo', AGORA)).toBeNull()
    expect(periodoFim('tudo', AGORA)).toBeNull()
  })

  it('hoje começa à meia-noite local e não tem fim', () => {
    expect(new Date(periodoInicio('hoje', AGORA) as string).getTime()).toBe(new Date(2026, 8, 30, 0, 0, 0, 0).getTime())
    expect(periodoFim('hoje', AGORA)).toBeNull()
  })

  it('ontem cobre 00:00:00.000 a 23:59:59.999 do dia anterior', () => {
    expect(new Date(periodoInicio('ontem', AGORA) as string).getTime()).toBe(new Date(2026, 8, 29, 0, 0, 0, 0).getTime())
    expect(new Date(periodoFim('ontem', AGORA) as string).getTime()).toBe(new Date(2026, 8, 29, 23, 59, 59, 999).getTime())
  })

  it('7d volta exatamente 7 dias; mes começa no dia 1', () => {
    expect(new Date(periodoInicio('7d', AGORA) as string).getTime()).toBe(AGORA.getTime() - 7 * 86_400_000)
    expect(new Date(periodoInicio('mes', AGORA) as string).getTime()).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).getTime())
  })
})

describe('normalizadores de searchParams', () => {
  it('oneOf cai no fallback para valor desconhecido/ausente', () => {
    expect(oneOf('hoje', CAIXAS_PERIODOS, '7d')).toBe('hoje')
    expect(oneOf('xyz', CAIXAS_PERIODOS, '7d')).toBe('7d')
    expect(oneOf(undefined, CAIXAS_PERIODOS, '7d')).toBe('7d')
  })

  it('clampPage nunca devolve menos que 1', () => {
    expect(clampPage(undefined)).toBe(1)
    expect(clampPage('0')).toBe(1)
    expect(clampPage('-3')).toBe(1)
    expect(clampPage('abc')).toBe(1)
    expect(clampPage('4')).toBe(4)
  })
})

describe('status e divergência', () => {
  it('temDiferenca respeita a tolerância de 1 centavo', () => {
    expect(temDiferenca(0)).toBe(false)
    expect(temDiferenca(0.005)).toBe(false)
    expect(temDiferenca(-10)).toBe(true)
    expect(temDiferenca(0.01)).toBe(true)
  })

  it('mapCaixaHistoricoLinha marca retomado por turno_anterior_id ou motivo_retomada', () => {
    const base = {
      id: 'c1',
      operador_id: 'o1',
      data_abertura: '2026-09-17T10:00:00Z',
      data_fechamento: '2026-09-17T18:00:00Z',
      valor_inicial: 100,
      valor_fechamento: 150,
      fechamento_diferenca: -10,
      fechamento_observacao: null,
      operador: { nome: 'Maria' },
    }
    expect(mapCaixaHistoricoLinha(base)?.retomado).toBe(false)
    expect(mapCaixaHistoricoLinha({ ...base, turno_anterior_id: 'c0' })?.retomado).toBe(true)
    expect(mapCaixaHistoricoLinha({ ...base, motivo_retomada: 'erro de digitação' })?.retomado).toBe(true)
  })
})

describe('movimentações (tipo em minúsculas no banco)', () => {
  it('normalizarTipoMovimentacao ignora caixa e espaços', () => {
    expect(normalizarTipoMovimentacao('sangria')).toBe('SANGRIA')
    expect(normalizarTipoMovimentacao(' Suprimento ')).toBe('SUPRIMENTO')
  })

  it('agrega por caixa, soma só aprovadas e ignora estorno/pendente/cancelado', () => {
    const totais = agregarMovimentosPorCaixa([
      { caixa_id: 'a', tipo: 'sangria', valor: 100.1, status: 'aprovado' },
      { caixa_id: 'a', tipo: 'sangria', valor: 0.2, status: 'aprovado' },
      { caixa_id: 'a', tipo: 'suprimento', valor: 50, status: 'aprovado' },
      { caixa_id: 'a', tipo: 'sangria', valor: 500, status: 'pendente' },
      { caixa_id: 'a', tipo: 'sangria', valor: 700, status: 'cancelado' },
      { caixa_id: 'a', tipo: 'estorno', valor: 10, status: 'aprovado' },
      { caixa_id: 'b', tipo: 'SUPRIMENTO', valor: 5, status: 'APROVADO' },
    ])
    expect(totais.get('a')).toEqual({ sangrias: 100.3, suprimentos: 50 })
    expect(totais.get('b')).toEqual({ sangrias: 0, suprimentos: 5 })
    expect(totais.has('c')).toBe(false)
  })

  it('mapCaixaAbertoLinha usa zero quando o turno não tem movimentações', () => {
    const linha = mapCaixaAbertoLinha(
      {
        id: 'c1',
        operador_id: 'o1',
        data_abertura: '2026-09-29T08:00:00Z',
        valor_inicial: 200,
        operador: { nome: 'João' },
      },
      undefined,
    )
    expect(linha).toEqual({
      id: 'c1',
      operadorNome: 'João',
      dataAbertura: '2026-09-29T08:00:00Z',
      valorInicial: 200,
      sangrias: 0,
      suprimentos: 0,
      retomado: false,
    })
  })
})
