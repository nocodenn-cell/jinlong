/**
 * Paridade operacional Web (fixtures RPC reais) ≡ Local (calcularPrecoCanonico).
 * Fixtures capturadas do projeto jinlong em 2026-07-13 via calcular_preco_produto.
 */
import { describe, expect, it } from 'vitest'
import { calcularPrecoCanonico } from '@core/pricing/calcularPrecoCanonico'
import { resolverPrecoCanonicoLocal } from '../lib/resolverPrecoCanonicoLocal'

/** Produto smoke com 2 tiers globais (sem preco_atacado catálogo). */
const SMOKE = {
  id: '758313a4-ac0d-4c30-9dea-9c842d56091c',
  preco_varejo: 100,
  preco_atacado: null as number | null,
  tiers: [
    {
      id: '43eeff6c-1a7f-47f3-ab55-95a0e26762bc',
      produtoId: '758313a4-ac0d-4c30-9dea-9c842d56091c',
      lojaId: null as string | null,
      quantidadeMinima: 10,
      precoUnitario: 90,
    },
    {
      id: '53afe6f0-4900-40db-a4e2-9041c5d7a990',
      produtoId: '758313a4-ac0d-4c30-9dea-9c842d56091c',
      lojaId: null,
      quantidadeMinima: 50,
      precoUnitario: 80,
    },
  ],
}

/** Controle TV: varejo 20, catálogo 15, tier qty>=5 → 15. */
const CONTROLE = {
  id: 'dbfe93c2-51f5-46d5-8b06-5d6f4be775ba',
  preco_varejo: 20,
  preco_atacado: 15,
  tiers: [
    {
      id: '3e4190b4-e74f-437d-8ba9-07f55b1c8432',
      produtoId: 'dbfe93c2-51f5-46d5-8b06-5d6f4be775ba',
      lojaId: null as string | null,
      quantidadeMinima: 5,
      precoUnitario: 15,
    },
  ],
}

const MIN_PADRAO = 6

/** Respostas RPC capturadas (autoridade Web). */
const RPC_SMOKE: Record<number, { preco: number; tipo: 'VAREJO' | 'ATACADO' }> = {
  1: { preco: 100, tipo: 'VAREJO' },
  10: { preco: 90, tipo: 'ATACADO' },
  50: { preco: 80, tipo: 'ATACADO' },
}

const RPC_CTRL: Record<number, { preco: number; tipo: 'VAREJO' | 'ATACADO' }> = {
  1: { preco: 20, tipo: 'VAREJO' },
  5: { preco: 15, tipo: 'ATACADO' },
  6: { preco: 15, tipo: 'ATACADO' },
}

describe('Operacional — Web RPC ≡ Local canônico (fixtures produção)', () => {
  for (const qty of [1, 10, 50] as const) {
    it(`SMOKE qty=${qty}: diff=0`, () => {
      const web = RPC_SMOKE[qty]
      const local = resolverPrecoCanonicoLocal(
        {
          id: SMOKE.id,
          ativo: true,
          preco_varejo: SMOKE.preco_varejo,
          preco_atacado: SMOKE.preco_atacado,
        },
        qty,
        { lojaId: null, quantidadeMinimaAtacadoPadrao: MIN_PADRAO, tiers: SMOKE.tiers },
      )
      expect(local.precoUnitario).toBe(web.preco)
      expect(local.tipoPreco).toBe(web.tipo)

      const canon = calcularPrecoCanonico({
        produtoId: SMOKE.id,
        ativo: true,
        precoVarejo: SMOKE.preco_varejo,
        precoAtacado: SMOKE.preco_atacado,
        quantidadeGatilhoAtacado: null,
        quantidade: qty,
        lojaId: null,
        quantidadeMinimaAtacadoPadrao: MIN_PADRAO,
        tiers: SMOKE.tiers,
      })
      expect(canon.ok && canon.result.preco).toBe(web.preco)
    })
  }

  for (const qty of [1, 5, 6] as const) {
    it(`CONTROLE qty=${qty}: diff=0`, () => {
      const web = RPC_CTRL[qty]
      const local = resolverPrecoCanonicoLocal(
        {
          id: CONTROLE.id,
          ativo: true,
          preco_varejo: CONTROLE.preco_varejo,
          preco_atacado: CONTROLE.preco_atacado,
        },
        qty,
        { lojaId: null, quantidadeMinimaAtacadoPadrao: MIN_PADRAO, tiers: CONTROLE.tiers },
      )
      expect(local.precoUnitario).toBe(web.preco)
      expect(local.tipoPreco).toBe(web.tipo)
    })
  }
})
