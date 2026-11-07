// D-11 paridade TS ↔ SQL: consome o mesmo fixture de backend/scripts/d11-atacado-fonte-unica.test.mjs.
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/d11-paridade.json'
import {
  calcularPrecoCanonico,
  type CalcularPrecoCanonicoInput,
  type PrecoAtacadoTierInput,
} from './calcularPrecoCanonico'
import { PRICE_RESOLUTION_CHAIN, assertValidPriceSource } from './resolution'

type Caso = {
  id: string
  produto: {
    preco_varejo: number
    preco_atacado: number | null
    quantidade_gatilho_atacado: number
    ativo: boolean
  }
  tiers: { quantidade_minima: number; preco_unitario: number; ativo: boolean; loja: string | null }[]
  loja: string | null
  quantidade: number
  esperado: { ok: boolean; preco?: number; tipo?: string; fonte?: string; erro?: string }
}

describe('D-11 fixture: calcularPrecoCanonico ≡ calcular_preco_produto (SQL)', () => {
  it('cadeia de precedência inclui produto entre tier e varejo', () => {
    expect(PRICE_RESOLUTION_CHAIN).toEqual(['tier', 'produto', 'catalogo', 'varejo'])
    expect(() => assertValidPriceSource({ preco: 1, tipo: 'ATACADO', fonte: 'produto' })).not.toThrow()
  })

  for (const caso of fixture.casos as Caso[]) {
    it(caso.id, () => {
      const tiers: PrecoAtacadoTierInput[] = caso.tiers.map((t, i) => ({
        id: `t${i}`,
        produtoId: 'p1',
        lojaId: t.loja,
        quantidadeMinima: t.quantidade_minima,
        precoUnitario: t.preco_unitario,
        ativo: t.ativo,
      }))
      const input: CalcularPrecoCanonicoInput = {
        produtoId: 'p1',
        ativo: caso.produto.ativo,
        precoVarejo: caso.produto.preco_varejo,
        precoAtacado: caso.produto.preco_atacado,
        quantidadeGatilhoAtacado: caso.produto.quantidade_gatilho_atacado,
        quantidade: caso.quantidade,
        lojaId: caso.loja,
        quantidadeMinimaAtacadoPadrao: null,
        tiers,
      }
      const r = calcularPrecoCanonico(input)
      if (caso.esperado.ok) {
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.result.preco).toBe(caso.esperado.preco)
        expect(r.result.tipo).toBe(caso.esperado.tipo)
        expect(r.result.fonte).toBe(caso.esperado.fonte)
      } else {
        expect(r).toEqual({ ok: false, erro: caso.esperado.erro })
      }
    })
  }
})
