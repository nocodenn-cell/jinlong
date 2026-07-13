import { describe, expect, it } from 'vitest'
import {
  parseQuantidadeCaixaFromString,
  parseQuantidadeCaixaInput,
  quantidadeCaixaTemAte3Casas,
  quantidadeParaRpcPreco,
  roundQuantidadeCaixa3,
} from './quantidadeCaixa'

describe('quantidadeCaixa', () => {
  it('roundQuantidadeCaixa3 arredonda em 3 casas', () => {
    expect(roundQuantidadeCaixa3(0.1254)).toBe(0.125)
    expect(roundQuantidadeCaixa3(1.5)).toBe(1.5)
  })

  it('parseQuantidadeCaixaInput aceita fracionado e rejeita abaixo do mínimo', () => {
    expect(parseQuantidadeCaixaInput(0.125)).toBe(0.125)
    expect(parseQuantidadeCaixaInput(0.0004)).toBe(0)
    expect(parseQuantidadeCaixaInput(0)).toBe(0)
  })

  it('parseQuantidadeCaixaFromString aceita vírgula', () => {
    expect(parseQuantidadeCaixaFromString('0,125')).toBe(0.125)
    expect(parseQuantidadeCaixaFromString('2')).toBe(2)
  })

  it('quantidadeCaixaTemAte3Casas valida escala', () => {
    expect(quantidadeCaixaTemAte3Casas(0.125)).toBe(true)
    expect(quantidadeCaixaTemAte3Casas(1.0001)).toBe(false)
  })

  it('quantidadeParaRpcPreco não rejeita (0,1) — alinha finalização e reprecificação', () => {
    expect(quantidadeParaRpcPreco(0.125)).toBe(1)
    expect(quantidadeParaRpcPreco(1.9)).toBe(1)
    expect(quantidadeParaRpcPreco(5)).toBe(5)
    expect(quantidadeParaRpcPreco(0)).toBe(0)
  })
})
