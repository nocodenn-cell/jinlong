/**
 * REGRA DE PRECEDÊNCIA DE PREÇO — fonte canônica.
 *
 * Qualquer código que calcule, exiba ou valide preço DEVE seguir esta ordem.
 * A implementação autoritativa vive na RPC `calcular_preco_produto` (migration 234).
 * Este arquivo documenta a mesma lógica em TypeScript para que a regra seja
 * encontrável, testável e resistente a refatorações.
 *
 * ORDEM DE PRECEDÊNCIA D0 (maior índice = menor prioridade):
 *
 *   1. precos_atacado (tabela de tiers, por produto + loja)
 *      Condição: ativo=true AND quantidade_minima <= quantidade_carrinho
 *      Critério de desempate: maior quantidade_minima vence (tier mais específico)
 *      Resultado: ATACADO com fonte='tier'
 *
 *   2. produtos.preco_varejo (fallback incondicional)
 *      Resultado: VAREJO com fonte='varejo'
 *
 * `produtos.preco_atacado` e `pdv_config.quantidade_minima_atacado_padrao` são
 * legados/sugestão de cadastro e não participam do cálculo de venda D0.
 *
 * ADICIONANDO UMA NOVA FONTE DE PREÇO:
 *   1. Adicione um novo item a PriceSourceKind abaixo com índice maior que os existentes
 *   2. Atualize calcular_preco_produto (crie nova migration ≥ 245)
 *   3. Adicione um caso em PRICE_RESOLUTION_CHAIN
 *   4. A fonte nova deve ter prioridade explicitamente definida — nunca implícita
 */

/** Identifica de onde veio o preço retornado pelo PDV. */
export type PriceSourceKind =
  | 'tier'      // precos_atacado (priority 1 — highest)
  | 'catalogo'  // compatibilidade de leitura com respostas anteriores ao D0
  | 'varejo'    // produtos.preco_varejo (fallback)

/** Resultado de resolução de preço com rastreabilidade de fonte. */
export interface PriceResolutionResult {
  preco: number
  tipo: 'ATACADO' | 'VAREJO'
  fonte: PriceSourceKind
  /** ID da regra em precos_atacado, quando fonte='tier'. */
  regraId?: string
  /** Quantidade mínima do tier aplicado. Ausente no varejo (a RPC devolve null). */
  quantidadeMinima?: number
}

/**
 * Ordem de precedência declarada como constante verificável.
 * Índice 0 = maior prioridade.
 */
export const PRICE_RESOLUTION_CHAIN: readonly PriceSourceKind[] = [
  'tier',
  // Somente para normalizar respostas históricas; resolvers D0 não a produzem.
  'catalogo',
  'varejo',
] as const

/**
 * Garante que um resultado de preço tem fonte válida e conhecida.
 * Usar em testes de integração e assertions de runtime.
 */
export function assertValidPriceSource(result: PriceResolutionResult): void {
  if (!PRICE_RESOLUTION_CHAIN.includes(result.fonte)) {
    throw new Error(
      `Fonte de preço desconhecida: "${result.fonte}". ` +
      `Fontes válidas: ${PRICE_RESOLUTION_CHAIN.join(', ')}. ` +
      `Se está adicionando uma nova fonte, atualize PRICE_RESOLUTION_CHAIN em pricing/resolution.ts ` +
      `e crie a migration correspondente em calcular_preco_produto.`
    )
  }
}

/**
 * Normaliza a resposta JSON da RPC calcular_preco_produto para PriceResolutionResult.
 * Retorna null se o produto não foi encontrado ou a quantidade é inválida.
 */
export function normalizePriceRpcResponse(
  raw: { preco?: number | null; tipo?: string; fonte?: string; regra_id?: string; erro?: string } | null,
): PriceResolutionResult | null {
  if (!raw || raw.erro || raw.preco == null) return null

  const fonte = (raw.fonte ?? (raw.regra_id ? 'tier' : 'varejo')) as PriceSourceKind

  return {
    preco: raw.preco,
    tipo: raw.tipo === 'ATACADO' ? 'ATACADO' : 'VAREJO',
    fonte,
    regraId: raw.regra_id,
  }
}
