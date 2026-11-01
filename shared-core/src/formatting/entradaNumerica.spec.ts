import { describe, expect, it } from 'vitest'
import {
  MOEDA_MAX_NUMERIC_10_2,
  parseMoedaEntrada,
  parseQuantidadeEntrada,
  parseQuantidadeInteiraEntrada,
  parseValorEntrada,
} from './entradaNumerica'

describe('parseMoedaEntrada (pt-BR, 2 casas)', () => {
  it.each([
    ['10,50', 10.5],
    ['1.234,56', 1234.56],
    ['R$ 1.234,56', 1234.56],
    ['1234', 1234],
    ['1.234', 1234],
    ['0', 0],
    ['0,5', 0.5],
    ['  9,9  ', 9.9],
  ])('aceita %s', (raw, esperado) => {
    expect(parseMoedaEntrada(raw)).toEqual({ ok: true, value: esperado })
  })

  it('vazio é opcional (value null)', () => {
    expect(parseMoedaEntrada('')).toEqual({ ok: true, value: null })
    expect(parseMoedaEntrada('   ')).toEqual({ ok: true, value: null })
  })

  it('recusa ponto decimal (10.50 nunca vira 1050)', () => {
    expect(parseMoedaEntrada('10.50')).toEqual({ ok: false, motivo: 'separador_decimal' })
  })

  it('recusa letras, notação científica e espaço interno', () => {
    expect(parseMoedaEntrada('abc')).toEqual({ ok: false, motivo: 'formato' })
    expect(parseMoedaEntrada('12abc')).toEqual({ ok: false, motivo: 'formato' })
    expect(parseMoedaEntrada('1e5')).toEqual({ ok: false, motivo: 'formato' })
    expect(parseMoedaEntrada('1 234,56')).toEqual({ ok: false, motivo: 'formato' })
  })

  it('recusa negativos (não vira 10)', () => {
    expect(parseMoedaEntrada('-10')).toEqual({ ok: false, motivo: 'negativo' })
    expect(parseMoedaEntrada('-10,50')).toEqual({ ok: false, motivo: 'negativo' })
  })

  it('recusa mais de 2 casas (sem arredondar)', () => {
    expect(parseMoedaEntrada('10,555')).toEqual({ ok: false, motivo: 'casas_decimais' })
  })

  it('teto técnico numeric(10,2)', () => {
    expect(parseMoedaEntrada('100.000.000,00')).toEqual({ ok: false, motivo: 'faixa' })
    expect(parseMoedaEntrada('99.999.999,99')).toEqual({ ok: true, value: MOEDA_MAX_NUMERIC_10_2 })
    expect(parseMoedaEntrada('9'.repeat(40))).toEqual({ ok: false, motivo: 'faixa' })
  })
})

describe('parseValorEntrada (casas configuráveis, ex. custo)', () => {
  it('aceita até N casas quando configurado', () => {
    const opts = { casas: 6, max: 99_999_999.999999 }
    expect(parseValorEntrada('1,234567', opts)).toEqual({ ok: true, value: 1.234567 })
    expect(parseValorEntrada('1,2345678', opts)).toEqual({ ok: false, motivo: 'casas_decimais' })
  })

  it('com 2 casas recusa o 3º decimal (contrato atual de produtos.preco_custo)', () => {
    const opts = { casas: 2, max: MOEDA_MAX_NUMERIC_10_2 }
    expect(parseValorEntrada('3,333', opts)).toEqual({ ok: false, motivo: 'casas_decimais' })
  })
})

describe('parseQuantidadeEntrada — fracionada (peso/medida)', () => {
  it.each([
    ['0,500', 0.5],
    ['0,5', 0.5],
    ['2,125', 2.125],
    ['1.250,750', 1250.75],
    ['12', 12],
  ])('aceita %s', (raw, esperado) => {
    expect(parseQuantidadeEntrada(raw, { fracionada: true })).toEqual({ ok: true, value: esperado })
  })

  it('recusa ponto decimal (1.5 não vira 15 nem 1)', () => {
    expect(parseQuantidadeEntrada('1.5', { fracionada: true })).toEqual({
      ok: false,
      motivo: 'separador_decimal',
    })
  })

  it('recusa mais de 3 casas', () => {
    expect(parseQuantidadeEntrada('0,5005', { fracionada: true })).toEqual({
      ok: false,
      motivo: 'casas_decimais',
    })
  })

  it('teto técnico numeric(10,3)', () => {
    expect(parseQuantidadeEntrada('9999999,999', { fracionada: true })).toEqual({
      ok: true,
      value: 9_999_999.999,
    })
    expect(parseQuantidadeEntrada('10000000', { fracionada: true })).toEqual({
      ok: false,
      motivo: 'faixa',
    })
  })
})

describe('parseQuantidadeInteiraEntrada — unidade contável', () => {
  it.each([
    ['12', 12],
    ['1.000', 1000],
    ['0', 0],
  ])('aceita %s', (raw, esperado) => {
    expect(parseQuantidadeInteiraEntrada(raw)).toEqual({ ok: true, value: esperado })
  })

  it('vazio é opcional', () => {
    expect(parseQuantidadeInteiraEntrada('')).toEqual({ ok: true, value: null })
  })

  it('recusa decimais (0,500 não vira 500 nem 0)', () => {
    expect(parseQuantidadeInteiraEntrada('0,500')).toEqual({ ok: false, motivo: 'fracionada' })
    expect(parseQuantidadeInteiraEntrada('10.5')).toEqual({ ok: false, motivo: 'fracionada' })
  })

  it('recusa letras e notação científica', () => {
    expect(parseQuantidadeInteiraEntrada('abc')).toEqual({ ok: false, motivo: 'formato' })
    expect(parseQuantidadeInteiraEntrada('12abc')).toEqual({ ok: false, motivo: 'formato' })
    expect(parseQuantidadeInteiraEntrada('1e5')).toEqual({ ok: false, motivo: 'formato' })
  })

  it('recusa negativos e respeita teto informado (integer do banco)', () => {
    expect(parseQuantidadeInteiraEntrada('-1')).toEqual({ ok: false, motivo: 'negativo' })
    expect(parseQuantidadeInteiraEntrada('2147483648', { max: 2_147_483_647 })).toEqual({
      ok: false,
      motivo: 'faixa',
    })
  })
})
