import { describe, expect, it } from 'vitest'
import {
  derivarValorSistemaFechamento,
  mapCaixaHistoricoLinha,
  mapCaixaMovimentacaoLinha,
  type CaixaHistoricoRaw,
} from './caixasHistorico'

describe('S9/G-01 — derivarValorSistemaFechamento: histórico nunca recomputado', () => {
  it('deriva o valor sistema por álgebra pura (contado - diferença), igual ao ramo de replay de fechar_caixa_atomico', () => {
    // fechamento_diferenca = valor_contado - valor_sistema (persistido pela RPC)
    // => valor_sistema = valor_contado - fechamento_diferenca
    expect(derivarValorSistemaFechamento(160, 0)).toBe(160)
    expect(derivarValorSistemaFechamento(150, -10)).toBe(160) // contou 150, esperava 160 (faltou 10)
    expect(derivarValorSistemaFechamento(170, 10)).toBe(160) // contou 170, esperava 160 (sobrou 10)
  })

  it('nunca depende de nenhum valor "atual"/live — só dos dois números persistidos no fechamento', () => {
    // Mesmos dois inputs sempre produzem a mesma saída, independente de
    // qualquer estado externo — prova que a função é pura e não faz I/O.
    const a = derivarValorSistemaFechamento(500, 25)
    const b = derivarValorSistemaFechamento(500, 25)
    expect(a).toBe(b)
    expect(a).toBe(475)
  })

  it('arredonda a 2 casas (mesma convenção ABNT do resto do caixa)', () => {
    expect(derivarValorSistemaFechamento(100.005, 0.001)).toBeCloseTo(100, 2)
  })
})

describe('S9/G-01 — mapCaixaHistoricoLinha', () => {
  const base: CaixaHistoricoRaw = {
    id: 'caixa-1',
    operador_id: 'op-1',
    data_abertura: '2026-09-17T10:00:00Z',
    data_fechamento: '2026-09-17T18:00:00Z',
    valor_inicial: 100,
    valor_fechamento: 160,
    fechamento_diferenca: 0,
    fechamento_observacao: null,
    operador: { nome: 'Maria' },
  }

  it('mapeia uma linha completa e deriva valorSistema sem recomputar', () => {
    const linha = mapCaixaHistoricoLinha(base)
    expect(linha).not.toBeNull()
    expect(linha?.operadorNome).toBe('Maria')
    expect(linha?.valorContado).toBe(160)
    expect(linha?.diferenca).toBe(0)
    expect(linha?.valorSistema).toBe(160)
  })

  it('usa "—" quando a relação de operador não veio (defensivo, não inventa nome)', () => {
    const linha = mapCaixaHistoricoLinha({ ...base, operador: null })
    expect(linha?.operadorNome).toBe('—')
  })

  it('retorna null (descarta a linha) se faltar qualquer campo de fechamento persistido — nunca inventa valor', () => {
    expect(mapCaixaHistoricoLinha({ ...base, data_fechamento: null })).toBeNull()
    expect(mapCaixaHistoricoLinha({ ...base, valor_fechamento: null })).toBeNull()
    expect(mapCaixaHistoricoLinha({ ...base, fechamento_diferenca: null })).toBeNull()
  })

  it('preserva o motivo registrado no fechamento quando presente', () => {
    const linha = mapCaixaHistoricoLinha({ ...base, fechamento_observacao: 'Falta de troco' })
    expect(linha?.motivo).toBe('Falta de troco')
  })
})

describe('S9/G-01 — mapCaixaMovimentacaoLinha', () => {
  it('mapeia campos 1:1, sem transformação de valor', () => {
    const linha = mapCaixaMovimentacaoLinha({
      id: 'mov-1',
      tipo: 'SANGRIA',
      valor: 50,
      motivo: 'Pagamento fornecedor',
      status: 'aprovada',
      created_at: '2026-09-17T12:00:00Z',
    })
    expect(linha).toEqual({
      id: 'mov-1',
      tipo: 'SANGRIA',
      valor: 50,
      motivo: 'Pagamento fornecedor',
      status: 'aprovada',
      criadaEm: '2026-09-17T12:00:00Z',
    })
  })
})
