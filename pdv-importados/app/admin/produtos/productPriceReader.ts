/**
 * Adapter ProductPriceReader — Missão Products 4 / ADR-007.
 * Consulta preço efetivo via RPC `calcular_preco_produto` (Postgres).
 * Não calcula cadeia em TypeScript.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertValidPriceSource,
  normalizePriceRpcResponse,
  type PriceResolutionResult,
} from '@shared-core/src/pricing/resolution'
import {
  PRODUCT_ERROR_CODES,
  type ProductPriceReader,
  type ResolveProductPriceQuery,
  type ResolveProductPriceResult,
} from '@shared-core/src/products'
import { quantidadeParaRpcPreco } from '@/lib/format/quantidadeCaixa'
import { resolveProductMessage } from '@/app/admin/produtos/productMessages'

/** @deprecated Preferir PRODUCT_ERROR_CODES + productMessages. */
export const MSG_QTD_INVALIDA = resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.QTY_INVALID)
export const MSG_PRODUTO_PRECO_NAO_ENCONTRADO = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.PRICE_PRODUCT_NOT_FOUND,
)
export const MSG_PRECO_RESPOSTA_INVALIDA = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.PRICE_RESPONSE_INVALID,
)

type RpcPriceRow = {
  preco?: number | string | null
  tipo?: string | null
  fonte?: string | null
  regra_id?: string | null
  erro?: string | null
}

/** Coerce JSON string / objeto da RPC para row tipada. */
export function coerceCalcularPrecoRpcRow(data: unknown): RpcPriceRow | null {
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as RpcPriceRow
    } catch {
      return null
    }
  }
  if (typeof data === 'object') return data as RpcPriceRow
  return null
}

/**
 * Mapeia payload da RPC → PriceResolutionResult (preserva fonte / regra_id).
 * Retorna null se erro de domínio ou payload inválido.
 */
export function mapRpcToPriceResolution(data: unknown): {
  price: PriceResolutionResult | null
  domainError?: 'produto_nao_encontrado' | 'quantidade_invalida'
} {
  const row = coerceCalcularPrecoRpcRow(data)
  if (!row) return { price: null }
  if (row.erro === 'produto_nao_encontrado') {
    return { price: null, domainError: 'produto_nao_encontrado' }
  }
  if (row.erro === 'quantidade_invalida') {
    return { price: null, domainError: 'quantidade_invalida' }
  }

  const precoNum =
    typeof row.preco === 'string' ? Number(row.preco) : row.preco == null ? null : Number(row.preco)
  const regraId = typeof row.regra_id === 'string' ? row.regra_id : undefined
  const normalized = normalizePriceRpcResponse({
    preco: precoNum,
    tipo: row.tipo ?? undefined,
    fonte: row.fonte ?? undefined,
    regra_id: regraId,
    erro: row.erro ?? undefined,
  })
  if (!normalized) return { price: null }

  const price: PriceResolutionResult = {
    preco: Math.round(normalized.preco * 100) / 100,
    tipo: normalized.tipo,
    fonte: normalized.fonte,
    ...(regraId ? { regraId } : {}),
  }
  assertValidPriceSource(price)
  return { price }
}

function domainErrorCode(
  code: 'produto_nao_encontrado' | 'quantidade_invalida' | undefined,
): (typeof PRODUCT_ERROR_CODES)[keyof typeof PRODUCT_ERROR_CODES] {
  if (code === 'quantidade_invalida') return PRODUCT_ERROR_CODES.QTY_INVALID
  if (code === 'produto_nao_encontrado') return PRODUCT_ERROR_CODES.PRICE_PRODUCT_NOT_FOUND
  return PRODUCT_ERROR_CODES.PRICE_RESPONSE_INVALID
}

/**
 * Factory — ProductPriceReader contra autoridade Postgres.
 */
export function createProductPriceReader(supabase: SupabaseClient): ProductPriceReader {
  return {
    async resolveEffectivePrice(
      query: ResolveProductPriceQuery,
    ): Promise<ResolveProductPriceResult> {
      try {
        const qRpc = quantidadeParaRpcPreco(query.quantidade)
        if (qRpc < 1) {
          const code = PRODUCT_ERROR_CODES.QTY_INVALID
          return { ok: false, error: code, code }
        }

        const { data, error } = await supabase.rpc('calcular_preco_produto', {
          p_produto_id: query.produtoId,
          p_quantidade: qRpc,
          p_loja_id: query.lojaId,
        })

        if (error) return { ok: false, error: error.message }

        const mapped = mapRpcToPriceResolution(data)
        if (!mapped.price) {
          const code = domainErrorCode(mapped.domainError)
          return { ok: false, error: code, code }
        }
        return { ok: true, price: mapped.price }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : MSG_PRECO_RESPOSTA_INVALIDA,
        }
      }
    },
  }
}
