/**
 * Guardrails estáticos do motor (invariante I-11 de 07-MOTOR-CONTRATO-MINIMO.md §4).
 *
 * O motor é puro: nada de I/O, relógio, aleatoriedade, rede, hash ou conversão
 * de dinheiro para `number`. Os testes (`*.spec.ts`) ficam fora da verificação.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIR = fileURLToPath(new URL('.', import.meta.url))

const fontes = readdirSync(DIR)
  .filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))
  .map((n) => ({ nome: n, texto: readFileSync(join(DIR, n), 'utf8') }))

/** Remove comentários para não acusar texto de documentação. */
const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('guardrails do motor de landed cost (puro)', () => {
  it('há arquivos de motor para verificar', () => {
    expect(fontes.map((f) => f.nome)).toEqual(expect.arrayContaining([
      'decimal.ts', 'rateio.ts', 'landedCost.ts', 'canonico.ts', 'types.ts', 'errorCodes.ts', 'index.ts',
    ]))
  })

  it('imports apenas relativos (sem node:, sem pacotes, sem app, sem banco)', () => {
    for (const { nome, texto } of fontes) {
      const imports = [...semComentarios(texto).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
      for (const alvo of imports) {
        expect(alvo.startsWith('./'), `${nome} importa ${alvo}`).toBe(true)
      }
    }
  })

  it('sem I/O, relógio, aleatoriedade, rede, hash ou conversão para number', () => {
    const proibidos: [RegExp, string][] = [
      [/\bDate\b/, 'Date (relógio)'],
      [/Math\.random/, 'Math.random'],
      [/\bfetch\s*\(/, 'fetch (rede)'],
      [/\bprocess\./, 'process (ambiente)'],
      [/\bcrypto\b/, 'crypto (hash fica no adapter)'],
      [/\bNumber\s*\(/, 'Number(...) (conversão monetária)'],
      [/\bparseFloat\b|\bparseInt\b/, 'parseFloat/parseInt'],
      [/\btoFixed\b|\btoPrecision\b/, 'toFixed/toPrecision (arredondamento de ponto flutuante)'],
      [/\bMath\.(round|floor|ceil|trunc)\b/, 'Math.* sobre dinheiro'],
      [/\bconsole\./, 'console'],
    ]
    for (const { nome, texto } of fontes) {
      const limpo = semComentarios(texto)
      for (const [re, motivo] of proibidos) {
        expect(re.test(limpo), `${nome}: ${motivo}`).toBe(false)
      }
    }
  })

  it('o motor não usa ponto flutuante em nenhum literal monetário', () => {
    // Literais decimais no código (ex.: 1.5) não podem aparecer; escalas são inteiros.
    const decimalLiteral = /(?<![\w.])\d+\.\d+(?![\w.])/
    for (const { nome, texto } of fontes) {
      const limpo = semComentarios(texto)
        .split('\n')
        .filter((l) => !/^\s*\*/.test(l))
        .join('\n')
      expect(decimalLiteral.test(limpo), `${nome} tem literal decimal`).toBe(false)
    }
  })
})
