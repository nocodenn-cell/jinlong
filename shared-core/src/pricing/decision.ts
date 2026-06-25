/**
 * PRICING DECISION ENVELOPE — camada de TRANSPORTE, não de decisão.
 *
 * Princípio inviolável (no re-decision layer):
 *   Este módulo NÃO decide, NÃO deriva, NÃO compara e NÃO infere estado.
 *   A única fonte de decisão de preço é a RPC `calcular_preco_produto`
 *   (migration 234/250), espelhada/normalizada por resolution.ts.
 *
 *   O envelope apenas EMPACOTA, lado a lado e sem interpretar:
 *     1. a decisão do engine, verbatim (preco, tipo, fonte, regraId);
 *     2. dados crus de contexto que o caller JÁ possui (quantidade,
 *        threshold global, preco_atacado de catálogo, quantidade_minima
 *        do tier), repassados como valores brutos.
 *
 *   Toda interpretação ("faltam N", "aplicado/disponível", estados visuais)
 *   pertence à UI downstream — explicitamente FORA deste módulo.
 *
 * Por que existir, então? Para dar um formato único e estável de transporte
 * do engine até a UI, evitando que cada tela vá buscar/casar esses dados
 * crus por conta própria.
 */

import type { PriceResolutionResult } from './resolution'

/**
 * Dados crus já disponíveis no caller (servidor do caixa / catálogo).
 * Anexados ao envelope SEM qualquer comparação ou derivação.
 * `null` quando o dado não se aplica ou não está presente no contexto.
 */
export interface PricingRawContext {
  /** Quantidade considerada na avaliação (valor bruto, como veio do caller). */
  quantidade: number
  /** pdv_config.quantidade_minima_atacado_padrao — valor bruto, sem uso aqui. */
  thresholdGlobal: number | null
  /** produtos.preco_atacado — valor bruto, sem uso aqui. */
  precoAtacadoCatalogo: number | null
  /** precos_atacado.quantidade_minima do tier, quando já conhecido pelo caller. */
  tierQuantidadeMinima: number | null
}

/**
 * Envelope estrutural: decisão do engine (verbatim) + contexto cru.
 * Não há campos derivados — apenas transporte.
 */
export interface PricingDecisionEnvelope {
  /** Decisão do engine repassada sem alteração (preco, tipo, fonte, regraId). */
  engine: PriceResolutionResult
  /** Contexto cru anexado, sem interpretação. */
  contexto: PricingRawContext
}

/**
 * Monta o envelope. Operação puramente estrutural: copia as duas entradas
 * para o formato de transporte. Não compara, não deriva, não decide nada.
 */
export function buildPricingDecisionEnvelope(
  engine: PriceResolutionResult,
  contexto: PricingRawContext,
): PricingDecisionEnvelope {
  return { engine, contexto }
}
