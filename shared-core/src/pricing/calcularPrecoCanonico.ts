/**
 * Porta TypeScript bit-a-bit de `calcular_preco_produto` (migration 250).
 * Única autoridade de preço automático — Web (RPC) e Local (offline).
 */

import {
  assertValidPriceSource,
  type PriceResolutionResult,
  type PriceSourceKind,
} from './resolution'

export type PrecoAtacadoTierInput = {
  id: string
  produtoId: string
  lojaId: string | null
  quantidadeMinima: number
  precoUnitario: number
  ativo?: boolean
}

export type CalcularPrecoCanonicoInput = {
  produtoId: string
  ativo: boolean
  precoVarejo: number
  /** produtos.preco_atacado — fonte única de atacado do cadastro (D-11). */
  precoAtacado: number | null
  /**
   * produtos.quantidade_gatilho_atacado (D-11). Null ou < 1 com preço de atacado
   * não aplica a regra do cadastro (mesmo critério da RPC).
   */
  quantidadeGatilhoAtacado: number | null
  /** Quantidade do carrinho (pode ser fracionada); FLOOR igual à RPC. */
  quantidade: number
  lojaId: string | null
  /** @deprecated Sugestão de cadastro; não participa do runtime D0. */
  quantidadeMinimaAtacadoPadrao: number | null
  tiers: readonly PrecoAtacadoTierInput[]
}

export type CalcularPrecoCanonicoErro =
  | { ok: false; erro: 'quantidade_invalida' | 'produto_nao_encontrado' }
  | { ok: true; result: PriceResolutionResult }

/**
 * Espelha `quantidadeParaRpcPreco`: max(1, floor(q)) para q > 0.
 */
export function quantidadeParaCadeiaPreco(q: number): number {
  const n = Number(q)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.max(1, Math.floor(n))
}

function tierAplicavel(
  tiers: readonly PrecoAtacadoTierInput[],
  produtoId: string,
  lojaId: string | null,
  qRpc: number,
): PrecoAtacadoTierInput | null {
  let best: PrecoAtacadoTierInput | null = null
  for (const t of tiers) {
    if (t.ativo === false) continue
    if (t.produtoId !== produtoId) continue
    if (t.lojaId != null && t.lojaId !== lojaId) continue
    if (Number(t.quantidadeMinima) > qRpc) continue
    if (
      !best ||
      Number(t.quantidadeMinima) > Number(best.quantidadeMinima)
    ) {
      best = t
    }
  }
  return best
}

function ok(
  preco: number,
  tipo: 'ATACADO' | 'VAREJO',
  fonte: PriceSourceKind,
  regraId?: string,
): CalcularPrecoCanonicoErro {
  const result: PriceResolutionResult = {
    preco,
    tipo,
    fonte,
    ...(regraId ? { regraId } : {}),
  }
  assertValidPriceSource(result)
  return { ok: true, result }
}

/**
 * Resolve preço unitário com a mesma regra D0 da RPC:
 * tier ativo (`precos_atacado`) → varejo.
 */
export function calcularPrecoCanonico(
  input: CalcularPrecoCanonicoInput,
): CalcularPrecoCanonicoErro {
  const qRpc = quantidadeParaCadeiaPreco(input.quantidade)
  if (qRpc < 1) {
    return { ok: false, erro: 'quantidade_invalida' }
  }
  if (!input.ativo) {
    return { ok: false, erro: 'produto_nao_encontrado' }
  }

  const tier = tierAplicavel(
    input.tiers,
    input.produtoId,
    input.lojaId,
    qRpc,
  )
  // Transitório (D-11): faixa ativa ainda vence, como na RPC até a execução do plano.
  if (tier) {
    return ok(
      Number(tier.precoUnitario),
      'ATACADO',
      'tier',
      tier.id,
    )
  }

  // Fonte única D-11: cadastro do produto. Mesmas condições da RPC.
  if (
    input.precoAtacado != null &&
    input.quantidadeGatilhoAtacado != null &&
    input.quantidadeGatilhoAtacado >= 1 &&
    input.precoAtacado < input.precoVarejo &&
    qRpc >= input.quantidadeGatilhoAtacado
  ) {
    return ok(Number(input.precoAtacado), 'ATACADO', 'produto')
  }

  return ok(Number(input.precoVarejo), 'VAREJO', 'varejo')
}
