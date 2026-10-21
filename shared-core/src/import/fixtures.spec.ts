/**
 * Executa os fixtures de referência (docs/import-intelligence/fixtures/casos).
 *
 * Comparação: campos de cálculo do `expected.json`. Não comparados de propósito:
 * - `input_hash` (responsabilidade do adapter);
 * - `engine_version` (a referência usa outro rótulo de versão);
 * - `itens[].memoria` e `creditos` (o motor produz, a referência não);
 * - `divergencias[].mensagem` (texto livre; comparam-se código e severidade).
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { calcularLandedCost } from './landedCost'
import type { LandedCostInput } from './types'

const CASOS = fileURLToPath(new URL('../../../docs/import-intelligence/fixtures/casos', import.meta.url))

const pastas = readdirSync(CASOS)
  .filter((n) => existsSync(join(CASOS, n, 'input.json')))
  .sort()

const lerJson = <T>(arquivo: string): T => JSON.parse(readFileSync(arquivo, 'utf8')) as T

describe('fixtures de referência do motor', () => {
  it('há exatamente 21 casos', () => {
    expect(pastas).toHaveLength(21)
  })

  for (const nome of pastas) {
    it(nome, () => {
      const input = lerJson<LandedCostInput>(join(CASOS, nome, 'input.json'))
      const esperado = lerJson<Record<string, unknown>>(join(CASOS, nome, 'expected.json'))
      const r = calcularLandedCost(input)

      if (esperado.erro) {
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error.codigo).toBe(esperado.erro)
        return
      }

      expect(r.ok).toBe(true)
      if (!r.ok) return
      const saida = r.value

      expect(saida.status).toBe(esperado.status)
      expect(saida.divergencias.map((d) => `${d.codigo}:${d.severidade}`).sort())
        .toEqual(((esperado.divergencias ?? []) as { codigo: string; severidade: string }[])
          .map((d) => `${d.codigo}:${d.severidade}`).sort())

      const itensEsperados = (esperado.itens ?? []) as Record<string, unknown>[]
      expect(saida.itens.map((i) => i.item_id)).toEqual(itensEsperados.map((i) => i.item_id))
      saida.itens.forEach((item, idx) => {
        const e = itensEsperados[idx]
        expect({
          item_id: item.item_id,
          produto_id: item.produto_id,
          quantidade_estoque: item.quantidade_estoque,
          componentes_brl: item.componentes_brl,
          custo_total_brl: item.custo_total_brl,
          custo_unitario_brl: item.custo_unitario_brl,
          residuo_unitario_brl: item.residuo_unitario_brl,
          residuo_total_brl: item.residuo_total_brl,
        }).toEqual(e)
      })

      expect(saida.rateios).toEqual(esperado.rateios ?? [])
      expect(saida.despesas_nao_incorporadas).toEqual(esperado.despesas_nao_incorporadas ?? [])
      expect(saida.conservacao).toEqual(esperado.conservacao)
    })
  }
})
