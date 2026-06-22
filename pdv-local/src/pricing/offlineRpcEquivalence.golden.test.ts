/**
 * GOLDEN TEST — Equivalência Offline (PricingService) × RPC (calcular_preco_produto)
 *
 * Trava de estabilização: o pdv-local é offline-first e calcula preços localmente
 * com PricingService (exceção declarada ao RPC-only). Este teste garante que o
 * motor offline produz o MESMO preço unitário que a autoridade online — o RPC
 * PostgreSQL `calcular_preco_produto` (migration 234) — para um conjunto canônico
 * de cenários (golden matrix).
 *
 * Se PricingService, o mapper de regras, ou o contrato do RPC divergirem,
 * este teste falha — expondo o drift antes de chegar ao runtime offline.
 *
 * ─── Contrato do RPC (migration 234_calcular_preco_produto_security_definer) ───
 *   1. quantidade < 1            → erro 'quantidade_invalida' (tipo VAREJO)
 *   2. tier em precos_atacado com quantidade_minima <= qty, escolhe o de MAIOR
 *      quantidade_minima (ORDER BY ... DESC LIMIT 1) → ATACADO, preço absoluto do tier
 *   3. senão, se preco_atacado (catálogo) != null E qty >= min_padrão → ATACADO catálogo
 *   4. senão                     → VAREJO (preco_varejo)
 *
 * ─── Invariante operacional para equivalência ─────────────────────────────────
 *   O RPC seleciona o tier de MAIOR quantidade_minima aplicável; PricingService
 *   usa `.find` (primeiro match na ordem do array). Para os dois concordarem, as
 *   regras offline devem chegar ordenadas por quantidade_minima DESC. Este teste
 *   constrói as regras nessa ordem e documenta a dependência explicitamente.
 */
import { describe, it, expect } from 'vitest'
import { pricingService } from '@shared/pricing/PricingService'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@core/caixa/mapRegrasPreco'
import type { PricingContext } from '@core/pricing/types'

// ─── Referência: porta fiel do algoritmo do RPC (migration 234) ────────────────
type Tier = { quantidade_minima: number; preco_unitario: number }
type ProdutoRpc = { preco_varejo: number; preco_atacado: number | null }

function rpcCalcularPreco(
  produto: ProdutoRpc,
  tiers: Tier[],
  quantidade: number,
  minPadraoCatalogo: number,
): { preco: number | null; tipo: 'VAREJO' | 'ATACADO'; erro?: string } {
  if (quantidade < 1) return { preco: null, tipo: 'VAREJO', erro: 'quantidade_invalida' }

  // tier de MAIOR quantidade_minima aplicável (ORDER BY quantidade_minima DESC LIMIT 1)
  const aplicaveis = tiers
    .filter((t) => t.quantidade_minima <= quantidade)
    .sort((a, b) => b.quantidade_minima - a.quantidade_minima)
  if (aplicaveis.length > 0) {
    return { preco: aplicaveis[0].preco_unitario, tipo: 'ATACADO' }
  }

  // fallback catálogo atacado
  if (produto.preco_atacado != null && quantidade >= minPadraoCatalogo) {
    return { preco: produto.preco_atacado, tipo: 'ATACADO' }
  }

  return { preco: produto.preco_varejo, tipo: 'VAREJO' }
}

// ─── Offline: constrói regras_preco espelhando os tiers, mapeia e calcula ──────
// Tier absoluto (preco_unitario) → desconto PERCENTUAL sobre o varejo, que é o
// modelo do PricingService. Ordenado DESC por quantidade_minima (ver invariante).
function regrasOffline(produtoId: string, varejo: number, tiers: Tier[]): RegraPrecoRow[] {
  return [...tiers]
    .sort((a, b) => b.quantidade_minima - a.quantidade_minima)
    .map((t, i) => ({
      id: `r${i}`,
      tipo_regra: 'ATACADO',
      produto_id: produtoId,
      categoria_id: null,
      quantidade_minima: t.quantidade_minima,
      quantidade_maxima: null,
      tipo_desconto: 'PERCENTUAL',
      valor_desconto: Math.round((1 - t.preco_unitario / varejo) * 1000) / 10, // % com 1 casa
      data_validade: null,
      ativo: true,
    }))
}

function precoOffline(varejo: number, regras: RegraPrecoRow[], quantidade: number): {
  preco: number
  tipo: string
} {
  const item = {
    id: 'i1',
    produtoId: 'p1',
    nome: 'Produto',
    quantidade,
    precoVariejo: varejo,
    precoUnitario: varejo,
    precoOriginal: varejo,
  } as never
  const ctx: PricingContext = { quantidadeMinimaAtacadoPadrao: 10 }
  const r = pricingService.calcularPrecoItem(item, regras.map(mapRegraPrecoRow), ctx)
  return { preco: r.precoUnitario, tipo: r.tipoPreco }
}

// ─── Golden matrix ─────────────────────────────────────────────────────────────
// Produto: varejo R$100, catálogo atacado R$85; tiers precos_atacado:
//   qty>=10 → R$80   |   qty>=50 → R$70
const VAREJO = 100
const PRODUTO: ProdutoRpc = { preco_varejo: VAREJO, preco_atacado: 85 }
const TIERS: Tier[] = [
  { quantidade_minima: 10, preco_unitario: 80 },
  { quantidade_minima: 50, preco_unitario: 70 },
]
const MIN_PADRAO = 10

const CASOS: Array<{ qty: number; preco: number; tipo: 'VAREJO' | 'ATACADO' }> = [
  { qty: 1, preco: 100, tipo: 'VAREJO' }, // sem tier, qty < min catálogo
  { qty: 5, preco: 100, tipo: 'VAREJO' }, // sem tier, qty < min catálogo (10)
  { qty: 10, preco: 80, tipo: 'ATACADO' }, // tier min10
  { qty: 49, preco: 80, tipo: 'ATACADO' }, // ainda tier min10 (min50 não aplica)
  { qty: 50, preco: 70, tipo: 'ATACADO' }, // tier min50 (maior aplicável)
  { qty: 100, preco: 70, tipo: 'ATACADO' }, // tier min50
]

describe('Golden — equivalência Offline (PricingService) × RPC (calcular_preco_produto)', () => {
  const regras = regrasOffline('p1', VAREJO, TIERS)

  for (const caso of CASOS) {
    it(`qty=${caso.qty}: RPC e Offline concordam → R$${caso.preco} (${caso.tipo})`, () => {
      // 1) Autoridade online (referência do RPC)
      const rpc = rpcCalcularPreco(PRODUTO, TIERS, caso.qty, MIN_PADRAO)
      expect(rpc.preco).toBe(caso.preco)
      expect(rpc.tipo).toBe(caso.tipo)

      // 2) Motor offline (PricingService) deve produzir o MESMO preço
      const off = precoOffline(VAREJO, regras, caso.qty)
      expect(off.preco).toBe(rpc.preco)
      // tipo: o RPC distingue só VAREJO/ATACADO; PricingService idem para regras ATACADO
      expect(off.tipo).toBe(rpc.tipo)
    })
  }

  it('documenta a sensibilidade de ordenação: tiers em ordem ASC divergem em qty=50', () => {
    // Mesmas regras, mas em ordem ASC (min10 antes de min50). PricingService.find
    // pega o PRIMEIRO match (min10 → R$80), enquanto o RPC pega o maior (min50 → R$70).
    const regrasAsc = [...regras].sort(
      (a, b) => Number(a.quantidade_minima) - Number(b.quantidade_minima),
    )
    const offAsc = precoOffline(VAREJO, regrasAsc, 50)
    const rpc = rpcCalcularPreco(PRODUTO, TIERS, 50, MIN_PADRAO)
    // Prova a divergência: por isso o invariante exige DESC.
    expect(offAsc.preco).toBe(80)
    expect(rpc.preco).toBe(70)
    expect(offAsc.preco).not.toBe(rpc.preco)
  })
})
