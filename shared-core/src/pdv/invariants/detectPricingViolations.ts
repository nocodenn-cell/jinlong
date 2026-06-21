/**
 * Detector de violações do Pricing Engine nos itens do carrinho.
 *
 * Integra-se ao sistema de invariants existente para detectar preços calculados
 * fora do engine (aritmética inline, decisões de tipo, preços negativos, etc.).
 *
 * Chame antes da finalização de venda e em validações de integridade do PDV.
 */

import type { PdvViolation } from './types'
import type { ItemCarrinho } from '../../stores/unifiedCartStore'

const VALID_TIPO_PRECO = new Set(['VAREJO', 'ATACADO', 'MANUAL', 'PROMOCAO'])

const EPS = 0.02

function roundMoney(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Valida que todos os itens do carrinho têm resultado de preço coerente
 * com as invariants do Pricing Engine:
 * - `resultado` presente (o engine deve ter sido chamado)
 * - `tipoPreco` é um dos quatro tipos autorizados
 * - `precoUnitario` não-negativo e finito
 * - `descontoUnitario` derivável de `precoOriginal - precoUnitario` (dentro de EPS)
 * - `precoUnitario` não supera `precoOriginal` (violação de piso/ceiling)
 */
export function detectPricingViolations(itens: ItemCarrinho[]): PdvViolation[] {
  const violations: PdvViolation[] = []

  for (const item of itens) {
    const res = item.resultado

    if (!res) {
      violations.push({
        code: 'PRICING_RESULTADO_AUSENTE',
        message: `Item "${item.nome}" (${item.produtoId}): resultado de preço ausente. O Pricing Engine deve ser chamado antes de adicionar itens ao carrinho.`,
        severity: 'error',
        layer: 'invariant',
      })
      continue
    }

    if (!VALID_TIPO_PRECO.has(res.tipoPreco)) {
      violations.push({
        code: 'PRICING_TIPO_INVALIDO',
        message: `Item "${item.nome}": tipoPreco inválido "${res.tipoPreco}". Tipos autorizados: VAREJO, ATACADO, MANUAL, PROMOCAO.`,
        severity: 'error',
        layer: 'invariant',
      })
    }

    if (!Number.isFinite(res.precoUnitario) || res.precoUnitario < 0) {
      violations.push({
        code: 'PRICING_PRECO_INVALIDO',
        message: `Item "${item.nome}": precoUnitario inválido (${res.precoUnitario}). Preços devem ser finitos e não-negativos.`,
        severity: 'error',
        layer: 'invariant',
      })
    }

    if (!Number.isFinite(res.precoOriginal) || res.precoOriginal < 0) {
      violations.push({
        code: 'PRICING_PRECO_INVALIDO',
        message: `Item "${item.nome}": precoOriginal inválido (${res.precoOriginal}).`,
        severity: 'error',
        layer: 'invariant',
      })
    }

    const derivedDesconto = roundMoney(res.precoOriginal - res.precoUnitario)
    if (Math.abs(derivedDesconto - res.descontoUnitario) > EPS) {
      violations.push({
        code: 'PRICING_DESCONTO_INCONSISTENTE',
        message: `Item "${item.nome}": descontoUnitario declarado (${res.descontoUnitario}) diverge do valor derivado (${derivedDesconto}). Desconto deve ser precoOriginal − precoUnitario.`,
        severity: 'warning',
        layer: 'invariant',
      })
    }

    if (res.precoUnitario > res.precoOriginal + EPS) {
      violations.push({
        code: 'PRICING_PRECO_ACIMA_ORIGINAL',
        message: `Item "${item.nome}": precoUnitario (${res.precoUnitario}) supera precoOriginal (${res.precoOriginal}). Violação do guard de teto do engine.`,
        severity: 'error',
        layer: 'invariant',
      })
    }
  }

  return violations
}

/**
 * Versão booleana — true quando o carrinho está limpo de violações de pricing.
 * Atalho para checks rápidos no hot-path do PDV.
 */
export function itensPricingValidos(itens: ItemCarrinho[]): boolean {
  return detectPricingViolations(itens).every((v) => v.severity !== 'error')
}
