/**
 * REGRA DE PRECEDÊNCIA DE PREÇO — Representação Canônica.
 *
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║ PRINCÍPIO ARQUITETURAL:                                                    ║
 * ║                                                                            ║
 * ║ A tabela precos_atacado é a ÚNICA representação canônica de qualquer      ║
 * ║ política comercial de precificação (simples ou avançada).                 ║
 * ║                                                                            ║
 * ║ O Price Engine (RPC calcular_preco_produto) consome EXCLUSIVAMENTE de     ║
 * ║ precos_atacado. Nenhuma outra tabela representa regras de preço.          ║
 * ║                                                                            ║
 * ║ HISTÓRICO (NÃO CONSULTADO):                                               ║
 * ║   • produtos.quantidade_gatilho_atacado: campo legado (materializado em   ║
 * ║     precos_atacado via PricingPolicyService)                              ║
 * ║   • pdv_config.quantidade_minima_atacado_padrao: apenas configuração de   ║
 * ║     default para UI, nunca consultado pelo RPC                            ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * ORDEM DE PRECEDÊNCIA (maior índice = menor prioridade):
 *
 *   1. precos_atacado (tabela de tiers, por produto + loja)
 *      Representação: Canônica e única
 *      Materialização: PricingPolicyService (de NovoProdutoInput)
 *      Condição: ativo=true AND quantidade_minima <= quantidade_carrinho
 *      Critério de desempate: maior quantidade_minima vence (tier mais específico)
 *      Resultado: ATACADO com fonte='tier'
 *
 *   2. produtos.preco_varejo (fallback incondicional)
 *      Resultado: VAREJO com fonte='varejo'
 *
 * OBSERVAÇÃO IMPORTANTE:
 *   A precedência original incluía "produtos.preco_atacado + pdv_config" como
 *   fallback. Esse padrão é DEPRECADO. A representação canônica é sempre
 *   precos_atacado (tier). Qualquer política, mesmo simples, é um tier.
 *
 * ADICIONANDO UMA NOVA FONTE DE PREÇO:
 *   1. Adicione uma nova coluna em precos_atacado (nullable para compat)
 *   2. Atualize calcular_preco_produto RPC: adicione WHERE novo_campo IS NULL OR ...
 *   3. Atualize PricingPolicyService para validar nova regra
 *   4. Nenhuma mudança em PriceSourceKind ou PRICE_RESOLUTION_CHAIN necessária
 *      (tudo é um tier em precos_atacado)
 */

/** Identifica de onde veio o preço retornado pelo PDV. */
export type PriceSourceKind =
  | 'tier'      // precos_atacado (priority 1 — highest)
  | 'catalogo'  // produtos.preco_atacado (priority 2)
  | 'varejo'    // produtos.preco_varejo  (priority 3 — lowest / default)

/** Resultado de resolução de preço com rastreabilidade de fonte. */
export interface PriceResolutionResult {
  preco: number
  tipo: 'ATACADO' | 'VAREJO'
  fonte: PriceSourceKind
  /** ID da regra em precos_atacado, quando fonte='tier'. */
  regraId?: string
}

/**
 * Ordem de precedência declarada como constante verificável.
 * Índice 0 = maior prioridade.
 */
export const PRICE_RESOLUTION_CHAIN: readonly PriceSourceKind[] = [
  'tier',
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
