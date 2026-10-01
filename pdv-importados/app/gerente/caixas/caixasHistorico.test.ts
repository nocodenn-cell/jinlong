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
  it('mapeia campos 1:1, sem transformação de valor (mais a categoria tipada)', () => {
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
      categoria: 'SANGRIA',
    })
  })
})

describe('decomporValorSistema (UX-015)', () => {
  it('turno do exemplo da auditoria: inicial 50 + recebimento 10 → vendas/demais 52 = sistema 112', async () => {
    const { decomporValorSistema } = await import('./caixasHistorico')
    const c = decomporValorSistema(50, 112, [
      { valor: 10, status: 'aprovada', categoria: 'RECEBIMENTO_AR' },
    ])
    expect(c).toEqual({ valorInicial: 50, suprimentos: 0, sangrias: 0, recebimentosReceber: 10, outros: 52, valorSistema: 112 })
  })

  it('a soma das linhas sempre fecha no valor sistema gravado', async () => {
    const { decomporValorSistema } = await import('./caixasHistorico')
    const mov = [
      { valor: 20, status: 'aprovado', categoria: 'SUPRIMENTO' as const },
      { valor: 30, status: 'aprovado', categoria: 'SANGRIA' as const },
      { valor: 15, status: 'aprovada', categoria: 'RECEBIMENTO_AR' as const },
      { valor: 5, status: 'aprovada', categoria: 'ESTORNO_AR' as const },
    ]
    const c = decomporValorSistema(100, 180, mov)
    const soma = c.valorInicial + c.suprimentos - c.sangrias + c.recebimentosReceber + c.outros
    expect(Math.round(soma * 100) / 100).toBe(180)
    expect(c.recebimentosReceber).toBe(10)
  })

  it('pendentes, canceladas e movimentos sem categoria não entram nas linhas (caem em "demais")', async () => {
    const { decomporValorSistema } = await import('./caixasHistorico')
    const c = decomporValorSistema(50, 80, [
      { valor: 99, status: 'pendente', categoria: 'SANGRIA' },
      { valor: 99, status: 'cancelado', categoria: 'SUPRIMENTO' },
      { valor: 7, status: 'aprovado', categoria: undefined },
    ])
    expect(c.sangrias).toBe(0)
    expect(c.suprimentos).toBe(0)
    expect(c.outros).toBe(30)
  })

  it('mapCaixaMovimentacaoLinha tipa sangria/suprimento (banco grava em minúsculas)', async () => {
    const { mapCaixaMovimentacaoLinha } = await import('./caixasHistorico')
    const base = { id: 'x', valor: 1, motivo: 'm', status: 'aprovado', created_at: 'd' }
    expect(mapCaixaMovimentacaoLinha({ ...base, tipo: 'sangria' }).categoria).toBe('SANGRIA')
    expect(mapCaixaMovimentacaoLinha({ ...base, tipo: 'suprimento' }).categoria).toBe('SUPRIMENTO')
    expect(mapCaixaMovimentacaoLinha({ ...base, tipo: 'estorno' }).categoria).toBeUndefined()
  })
})
