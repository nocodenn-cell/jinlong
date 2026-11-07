import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ler = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf8')
const valor = (css: string, nome: string) => css.match(new RegExp(`${nome}:\\s*([^;]+);`))?.[1].trim()

describe('PDV usa o vermelho do Admin', () => {
  const admin = ler('styles/admin-theme.css')
  const caixa = ler('styles/caixa-operacional.css')
  it('brand do caixa == --brand-500/600 do admin', () => {
    expect(valor(caixa, '--color-brand')).toBe(valor(admin, '--brand-500'))
    expect(valor(caixa, '--color-brand-strong')).toBe(valor(admin, '--brand-600'))
    expect(valor(caixa, '--primary')).toBe(valor(admin, '--primary'))
  })
  it('sem azul fixo nos descontos do caixa', () => {
    for (const f of ['app/caixa/CaixaDescontoManual.tsx', 'app/caixa/CaixaDescontoComercialDinheiro.tsx']) {
      expect(ler(f)).not.toMatch(/(text|bg)-blue-\d/)
    }
  })
})
