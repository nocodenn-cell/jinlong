import { describe, expect, it } from 'vitest'
import {
  META_CADASTRO_CONHECIDO_MS,
  META_CADASTRO_MANUAL_MS,
  avaliarMetaCadastroDuration,
  isGtinLookupCandidate,
  isSugestaoConhecida,
  medianaPrecos,
  normalizeGtinDigits,
  sugerirCategoriaId,
  sugerirPrecoVarejoDeCusto,
} from './sugestaoCadastro'

describe('sugestaoCadastro — política Fase 3', () => {
  it('normaliza GTIN para dígitos', () => {
    expect(normalizeGtinDigits('789 1000-100103')).toBe('7891000100103')
  })

  it('aceita GTIN 8–14 dígitos', () => {
    expect(isGtinLookupCandidate('78912345')).toBe(true)
    expect(isGtinLookupCandidate('123')).toBe(false)
  })

  it('sugere varejo a partir do custo com markup 1.5', () => {
    expect(sugerirPrecoVarejoDeCusto(10)).toBe(15)
    expect(sugerirPrecoVarejoDeCusto(null)).toBeNull()
  })

  it('mediana de preços', () => {
    expect(medianaPrecos([10, 20, 30])).toBe(20)
    expect(medianaPrecos([10, 20])).toBe(15)
  })

  it('sugere categoria por pista de nome', () => {
    const id = sugerirCategoriaId(
      [
        { id: 'a', nome: 'Bebidas' },
        { id: 'b', nome: 'Limpeza' },
      ],
      ['refrigerante bebidas'],
    )
    expect(id).toBe('a')
  })

  it('known suggestion exige nome + preço', () => {
    expect(isSugestaoConhecida({ nome: 'Leite', precoVarejo: 9 })).toBe(true)
    expect(isSugestaoConhecida({ nome: 'Leite', precoVarejo: null })).toBe(false)
  })

  it('meta duração: 8s conhecido / 15s manual', () => {
    expect(
      avaliarMetaCadastroDuration({ durationMs: 7_500, knownSuggestion: true }),
    ).toEqual({ metaMs: META_CADASTRO_CONHECIDO_MS, metaOk: true })
    expect(
      avaliarMetaCadastroDuration({ durationMs: 9_000, knownSuggestion: true }),
    ).toMatchObject({ metaOk: false })
    expect(
      avaliarMetaCadastroDuration({ durationMs: 14_000, knownSuggestion: false }),
    ).toEqual({ metaMs: META_CADASTRO_MANUAL_MS, metaOk: true })
  })
})
