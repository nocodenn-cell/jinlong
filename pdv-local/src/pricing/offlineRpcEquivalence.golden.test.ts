/**
 * GOLDEN — Web (RPC 250) ≡ Local (`calcularPrecoCanonico`).
 * Diferença esperada: 0. Sem regras_preco / sem aproximação %.
 */
import { describe, it, expect } from 'vitest'
import { calcularPrecoCanonico } from '@core/pricing/calcularPrecoCanonico'
import { resolverPrecoCanonicoLocal } from '../lib/resolverPrecoCanonicoLocal'
import type { PrecoAtacadoTierInput } from '@core/pricing/calcularPrecoCanonico'

type Tier = { id: string; quantidade_minima: number; preco_unitario: number; loja_id?: string | null }
type ProdutoRpc = { preco_varejo: number; preco_atacado: number | null }

/** Referência bit-a-bit do algoritmo da RPC (migration 250). */
function rpcCalcularPreco(
  produto: ProdutoRpc,
  tiers: Tier[],
  quantidade: number,
  minPadraoCatalogo: number | null,
  lojaId: string | null,
): { preco: number | null; tipo: 'VAREJO' | 'ATACADO'; erro?: string } {
  const q = !Number.isFinite(quantidade) || quantidade <= 0
    ? 0
    : Math.max(1, Math.floor(quantidade))
  if (q < 1) return { preco: null, tipo: 'VAREJO', erro: 'quantidade_invalida' }

  const aplicaveis = tiers
    .filter((t) => (t.loja_id == null || t.loja_id === lojaId) && t.quantidade_minima <= q)
    .sort((a, b) => b.quantidade_minima - a.quantidade_minima)
  if (aplicaveis.length > 0) {
    return { preco: aplicaveis[0].preco_unitario, tipo: 'ATACADO' }
  }

  if (produto.preco_atacado != null && minPadraoCatalogo != null && q >= minPadraoCatalogo) {
    return { preco: produto.preco_atacado, tipo: 'ATACADO' }
  }

  return { preco: produto.preco_varejo, tipo: 'VAREJO' }
}

const VAREJO = 100
const PRODUTO: ProdutoRpc = { preco_varejo: VAREJO, preco_atacado: 85 }
const TIERS: Tier[] = [
  { id: 't10', quantidade_minima: 10, preco_unitario: 80 },
  { id: 't50', quantidade_minima: 50, preco_unitario: 70 },
]
const MIN_PADRAO = 10
const LOJA = 'loja-1'

const tiersInput: PrecoAtacadoTierInput[] = TIERS.map((t) => ({
  id: t.id,
  produtoId: 'p1',
  lojaId: t.loja_id ?? null,
  quantidadeMinima: t.quantidade_minima,
  precoUnitario: t.preco_unitario,
}))

const CASOS: Array<{ qty: number; preco: number; tipo: 'VAREJO' | 'ATACADO'; label: string }> = [
  { qty: 1, preco: 100, tipo: 'VAREJO', label: 'varejo' },
  { qty: 5, preco: 100, tipo: 'VAREJO', label: 'abaixo do min' },
  { qty: 10, preco: 80, tipo: 'ATACADO', label: 'tier min10' },
  { qty: 49, preco: 80, tipo: 'ATACADO', label: 'ainda tier min10' },
  { qty: 50, preco: 70, tipo: 'ATACADO', label: 'tier min50' },
  { qty: 100, preco: 70, tipo: 'ATACADO', label: 'multiplo tiers' },
  { qty: 12, preco: 85, tipo: 'ATACADO', label: 'catalogo sem tier (tiers vazios)' },
  { qty: 1.9, preco: 100, tipo: 'VAREJO', label: 'fracao floor' },
]

describe('Golden — Web ≡ Local (PRICE_RESOLUTION_CHAIN)', () => {
  for (const caso of CASOS.filter((c) => c.label !== 'catalogo sem tier (tiers vazios)')) {
    it(`${caso.label} qty=${caso.qty}: diff=0 → R$${caso.preco}`, () => {
      const rpc = rpcCalcularPreco(PRODUTO, TIERS, caso.qty, MIN_PADRAO, LOJA)
      expect(rpc.preco).toBe(caso.preco)
      expect(rpc.tipo).toBe(caso.tipo)

      const canon = calcularPrecoCanonico({
        produtoId: 'p1',
        ativo: true,
        precoVarejo: VAREJO,
        precoAtacado: PRODUTO.preco_atacado,
        quantidade: caso.qty,
        lojaId: LOJA,
        quantidadeMinimaAtacadoPadrao: MIN_PADRAO,
        tiers: tiersInput,
      })
      expect(canon.ok).toBe(true)
      if (!canon.ok) return
      expect(canon.result.preco).toBe(rpc.preco)
      expect(canon.result.tipo).toBe(rpc.tipo)

      const local = resolverPrecoCanonicoLocal(
        { id: 'p1', ativo: true, preco_varejo: VAREJO, preco_atacado: 85 },
        caso.qty,
        {
          lojaId: LOJA,
          quantidadeMinimaAtacadoPadrao: MIN_PADRAO,
          tiers: tiersInput,
        },
      )
      expect(local.precoUnitario).toBe(rpc.preco)
      expect(local.tipoPreco).toBe(rpc.tipo)
    })
  }

  it('produto sem atacado permanece varejo em qty alta', () => {
    const rpc = rpcCalcularPreco(
      { preco_varejo: 40, preco_atacado: null },
      [],
      100,
      6,
      null,
    )
    const local = resolverPrecoCanonicoLocal(
      { id: 'p2', ativo: true, preco_varejo: 40, preco_atacado: null },
      100,
      { lojaId: null, quantidadeMinimaAtacadoPadrao: 6, tiers: [] },
    )
    expect(rpc.preco).toBe(40)
    expect(local.precoUnitario).toBe(40)
    expect(local.tipoPreco).toBe('VAREJO')
  })

  it('fallback catálogo quando não há tiers', () => {
    const rpc = rpcCalcularPreco(PRODUTO, [], 12, MIN_PADRAO, null)
    expect(rpc.preco).toBe(85)
    const local = resolverPrecoCanonicoLocal(
      { id: 'p1', ativo: true, preco_varejo: VAREJO, preco_atacado: 85 },
      12,
      { lojaId: null, quantidadeMinimaAtacadoPadrao: MIN_PADRAO, tiers: [] },
    )
    expect(local.precoUnitario).toBe(85)
    expect(local.tipoPreco).toBe('ATACADO')
  })
})
