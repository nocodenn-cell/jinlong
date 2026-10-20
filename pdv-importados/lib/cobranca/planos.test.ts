import { describe, expect, it } from 'vitest'
import { calcularValorMensal, PLANOS_FALLBACK, recursoDaRota, temRecurso } from './planos'

describe('calcularValorMensal', () => {
  it('Básico 1 loja 1 caixa = preço da loja', () => {
    expect(calcularValorMensal(PLANOS_FALLBACK, 'BASICO', [], 1, 1).totalCentavos).toBe(9900)
  })
  it('caixas adicionais e add-on Fiscal por loja', () => {
    const r = calcularValorMensal(PLANOS_FALLBACK, 'REDE', ['FISCAL'], 2, 5)
    expect(r.totalCentavos).toBe(24900 * 2 + 3 * 3900 + 5900 * 2)
    expect(r.linhas).toHaveLength(3)
  })
  it('caixas < lojas conta 1 caixa por loja', () => {
    expect(calcularValorMensal(PLANOS_FALLBACK, 'REDE', [], 3, 1).totalCentavos).toBe(24900 * 3)
  })
  it('limite de lojas do plano', () => {
    expect(() => calcularValorMensal(PLANOS_FALLBACK, 'ATACADO', [], 2, 2)).toThrow('PLANO_LIMITE_LOJAS')
  })
  it('add-on não pode ser plano e vice-versa', () => {
    expect(() => calcularValorMensal(PLANOS_FALLBACK, 'FISCAL', [], 1, 1)).toThrow('PLANO_INVALIDO')
    expect(() => calcularValorMensal(PLANOS_FALLBACK, 'BASICO', ['REDE'], 1, 1)).toThrow('ADDON_INVALIDO')
  })
  it('todos os preços de fallback estão marcados como placeholder', () => {
    expect(PLANOS_FALLBACK.every((p) => p.preco_placeholder)).toBe(true)
  })
})

describe('gating', () => {
  it('legado (null) libera tudo; lista restringe', () => {
    expect(temRecurso(null, 'transferencias')).toBe(true)
    expect(temRecurso(['pdv'], 'transferencias')).toBe(false)
    expect(temRecurso([], 'pdv')).toBe(false)
  })
  it('rotas do painel mapeiam para recurso', () => {
    expect(recursoDaRota('/admin/financeiro/contas-pagar')).toBe('financeiro')
    expect(recursoDaRota('/admin/estoque/transferencias')).toBe('transferencias')
    expect(recursoDaRota('/admin/estoque')).toBeNull()
    expect(recursoDaRota('/admin/financeiroX')).toBeNull()
  })
})
