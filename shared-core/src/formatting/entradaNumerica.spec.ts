import { describe, expect, it } from 'vitest'
import {
  MOEDA_ENTRADA_MAX,
  parseMoedaEntrada,
  parseQuantidadeInteiraEntrada,
} from './entradaNumerica'

describe('parseMoedaEntrada (pt-BR)', () => {
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

  it('recusa ponto decimal em vez de virar milhar (10.50 não vira 1050)', () => {
    expect(parseMoedaEntrada('10.50')).toEqual({ ok: false, motivo: 'separador_decimal' })
  })

  it('recusa letras, notação científica e lixo', () => {
    expect(parseMoedaEntrada('abc')).toEqual({ ok: false, motivo: 'formato' })
    expect(parseMoedaEntrada('12abc')).toEqual({ ok: false, motivo: 'formato' })
    expect(parseMoedaEntrada('1e5')).toEqual({ ok: false, motivo: 'formato' })
    expect(parseMoedaEntrada('1 234,56')).toEqual({ ok: false, motivo: 'formato' })
  })

  it('recusa negativos (não vira 10)', () => {
    expect(parseMoedaEntrada('-10')).toEqual({ ok: false, motivo: 'negativo' })
    expect(parseMoedaEntrada('-10,50')).toEqual({ ok: false, motivo: 'negativo' })
  })

  it('recusa mais de 2 casas decimais (sem arredondar)', () => {
    expect(parseMoedaEntrada('10,555')).toEqual({ ok: false, motivo: 'casas_decimais' })
  })

  it('recusa acima do teto numeric(10,2)', () => {
    expect(parseMoedaEntrada('100.000.000,00')).toEqual({ ok: false, motivo: 'faixa' })
    expect(parseMoedaEntrada('99.999.999,99')).toEqual({ ok: true, value: MOEDA_ENTRADA_MAX })
    expect(parseMoedaEntrada('9'.repeat(40))).toEqual({ ok: false, motivo: 'faixa' })
  })
})

describe('parseQuantidadeInteiraEntrada', () => {
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

  it('recusa negativos e valores acima do teto', () => {
    expect(parseQuantidadeInteiraEntrada('-1')).toEqual({ ok: false, motivo: 'negativo' })
    expect(parseQuantidadeInteiraEntrada('10000000')).toEqual({ ok: false, motivo: 'faixa' })
  })
})
