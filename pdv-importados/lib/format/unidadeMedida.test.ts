import { describe, expect, it } from 'vitest'
import {
  ajustarQuantidadeUnidade,
  normalizarUnidadeMedida,
  quantidadeValidaParaUnidade,
  unidadeAceitaFracao,
  UNIDADES_MEDIDA,
} from '@shared/format/unidadeMedida'

describe('unidadeMedida (SSoT)', () => {
  it('lista as cinco unidades do formulário de produto, sem MT', () => {
    expect([...UNIDADES_MEDIDA]).toEqual(['UN', 'KG', 'CX', 'FD', 'M'])
  })

  it('apenas KG e M são fracionáveis', () => {
    expect(unidadeAceitaFracao('UN')).toBe(false)
    expect(unidadeAceitaFracao('CX')).toBe(false)
    expect(unidadeAceitaFracao('FD')).toBe(false)
    expect(unidadeAceitaFracao('KG')).toBe(true)
    expect(unidadeAceitaFracao('M')).toBe(true)
  })

  it('normaliza valor ausente ou desconhecido para UN (regra conservadora)', () => {
    expect(normalizarUnidadeMedida(null)).toBe('UN')
    expect(normalizarUnidadeMedida(undefined)).toBe('UN')
    expect(normalizarUnidadeMedida('MT')).toBe('UN')
    expect(normalizarUnidadeMedida(' kg ')).toBe('KG')
  })

  describe('quantidadeValidaParaUnidade', () => {
    it('UN, CX e FD exigem inteiro >= 1', () => {
      for (const u of ['UN', 'CX', 'FD'] as const) {
        expect(quantidadeValidaParaUnidade(1, u)).toBe(true)
        expect(quantidadeValidaParaUnidade(35, u)).toBe(true)
        expect(quantidadeValidaParaUnidade(2.5, u)).toBe(false)
        expect(quantidadeValidaParaUnidade(1.002, u)).toBe(false)
        expect(quantidadeValidaParaUnidade(0, u)).toBe(false)
        expect(quantidadeValidaParaUnidade(0.5, u)).toBe(false)
      }
    })

    it('KG e M aceitam fração de até 3 casas', () => {
      for (const u of ['KG', 'M'] as const) {
        expect(quantidadeValidaParaUnidade(2.5, u)).toBe(true)
        expect(quantidadeValidaParaUnidade(0.125, u)).toBe(true)
        expect(quantidadeValidaParaUnidade(0.001, u)).toBe(true)
        expect(quantidadeValidaParaUnidade(1.0005, u)).toBe(false)
        expect(quantidadeValidaParaUnidade(0, u)).toBe(false)
        expect(quantidadeValidaParaUnidade(-1, u)).toBe(false)
      }
    })

    it('rejeita NaN e infinito em qualquer unidade', () => {
      for (const u of UNIDADES_MEDIDA) {
        expect(quantidadeValidaParaUnidade(Number.NaN, u)).toBe(false)
        expect(quantidadeValidaParaUnidade(Number.POSITIVE_INFINITY, u)).toBe(false)
      }
    })
  })

  describe('ajustarQuantidadeUnidade (+1 / −1)', () => {
    it('em unidade inteira, fração vai ao inteiro vizinho', () => {
      expect(ajustarQuantidadeUnidade(2.5, 'UN', 1)).toBe(3)
      expect(ajustarQuantidadeUnidade(2.5, 'UN', -1)).toBe(1)
      expect(ajustarQuantidadeUnidade(4, 'CX', -1)).toBe(3)
    })
    it('em unidade fracionável, soma com 3 casas', () => {
      expect(ajustarQuantidadeUnidade(2.125, 'KG', 1)).toBe(3.125)
      expect(ajustarQuantidadeUnidade(0.5, 'M', -1)).toBe(-0.5)
    })
  })
})
