/**
 * Testes de fronteira arquitetural do Pricing Engine.
 *
 * Verificam que decisões de preço passam pelo engine (pricingEngine.ts / PricingService),
 * e que nenhum módulo de UI ou de store contém lógica de preço inline.
 *
 * Estes testes são a proteção estrutural automática contra regressões arquiteturais.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '../../..')

function collectTsFiles(dir: string, skip: string[] = []): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = relative(ROOT, full)
    if (skip.some((s) => rel.startsWith(s) || rel.includes(s))) continue
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full, skip))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(full)
    }
  }
  return files
}

const SKIP_DIRS = ['node_modules', '.next', 'dist', 'build', '.turbo']

describe('Pricing Engine — fronteira arquitetural', () => {
  it('nenhum arquivo de app/caixa ou stores importa PricingService diretamente', () => {
    const dirs = [
      join(ROOT, 'pdv-importados/app/caixa'),
      join(ROOT, 'pdv-importados/stores'),
      join(ROOT, 'pdv-importados/components'),
    ]

    const violations: string[] = []

    for (const dir of dirs) {
      let files: string[]
      try {
        files = collectTsFiles(dir, SKIP_DIRS)
      } catch {
        continue
      }
      for (const file of files) {
        if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) continue
        const content = readFileSync(file, 'utf-8')
        if (
          content.includes("from '@shared/pricing/PricingService'") ||
          content.includes('from "../shared/pricing/PricingService"') ||
          content.includes("import { PricingService }") ||
          content.includes("new PricingService()")
        ) {
          violations.push(relative(ROOT, file))
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('nenhum arquivo de UI (app/) contém aritmética de desconto inline fora do engine', () => {
    const appDir = join(ROOT, 'pdv-importados/app')
    let files: string[]
    try {
      files = collectTsFiles(appDir, SKIP_DIRS)
    } catch {
      return
    }

    const PRICING_PATTERNS = [
      /precoOriginal\s*-\s*\(precoOriginal\s*\*.*\)\s*\/\s*100/,
      /preco_varejo\s*\*\s*\(1\s*-\s*desconto/,
      /descontoPercentual\s*\/\s*100\s*\*\s*preco/,
    ]

    const violations: string[] = []
    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) continue
      const content = readFileSync(file, 'utf-8')
      if (PRICING_PATTERNS.some((re) => re.test(content))) {
        violations.push(relative(ROOT, file))
      }
    }

    expect(violations).toEqual([])
  })

  it('pricingEngine.ts existe e exporta calcularPrecoItem e calcularCarrinho', async () => {
    const engine = await import('@shared/pricing/pricingEngine')
    expect(typeof engine.calcularPrecoItem).toBe('function')
    expect(typeof engine.calcularCarrinho).toBe('function')
  })

  it('tipo ATACADO (antes ATAcado) é normalizado para uppercase em RegraPreco', async () => {
    const { mapRegraPrecoRow } = await import('@/core/caixa/mapRegrasPreco')
    const row = {
      id: 'r1',
      tipo_regra: 'CATEGORIA',
      produto_id: null,
      categoria_id: null,
      quantidade_minima: 5,
      quantidade_maxima: null,
      tipo_desconto: 'PERCENTUAL',
      valor_desconto: 10,
      data_validade: null,
      ativo: true,
    }
    const regra = mapRegraPrecoRow(row)
    expect(regra.tipo).toBe('ATACADO')
    expect(regra.tipo).not.toBe('ATAcado')
  })

  it('mapper produz PROMOCAO para tipo_regra PROMOCAO', async () => {
    const { mapRegraPrecoRow } = await import('@/core/caixa/mapRegrasPreco')
    const row = {
      id: 'r2',
      tipo_regra: 'PROMOCAO',
      produto_id: null,
      categoria_id: null,
      quantidade_minima: 1,
      quantidade_maxima: null,
      tipo_desconto: 'PERCENTUAL',
      valor_desconto: 20,
      data_validade: null,
      ativo: true,
    }
    const regra = mapRegraPrecoRow(row)
    expect(regra.tipo).toBe('PROMOCAO')
  })
})
