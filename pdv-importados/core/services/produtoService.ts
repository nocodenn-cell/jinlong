import type {
  NovoProdutoInput,
  ProdutoRepositoryPort,
  StatusPublicacao,
} from '@/core/ports/produto'
import type { PricingPolicyService } from '@/pricing/pricingPolicyService'

export type CriarProdutoResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string }

/**
 * Persiste produto + estoque inicial.
 * Validação (Zod) fica na camada de apresentação (Server Actions).
 */
export async function criarProdutoComEstoque(
  input: NovoProdutoInput,
  repo: ProdutoRepositoryPort
): Promise<CriarProdutoResult> {
  const result = await repo.createWithDefaultEstoque(input)
  if (!result.ok) {
    return { success: false, error: result.message }
  }
  return { success: true, data: { id: result.id } }
}

/**
 * Persiste produto + estoque + política de precificação.
 *
 * Esta função orquestra:
 * 1. Criação do produto e estoque inicial
 * 2. Materialização da política de preços simples como tier em precos_atacado
 *
 * ARQUITETURA:
 *   - Cadastro fornece intenção (preco_varejo, preco_atacado, quantidade_minima)
 *   - PricingPolicyService transforma em tier (invisível)
 *   - Repository persiste ambos
 *   - RPC consome apenas precos_atacado (fonte canônica única)
 */
export async function criarProdutoComEstoqueEPoliticaComercial(
  input: NovoProdutoInput,
  repo: ProdutoRepositoryPort,
  pricingService: PricingPolicyService,
  lojaId: string | null = null,
  defaultMinimumQuantity: number = 6
): Promise<CriarProdutoResult> {
  const result = await repo.createWithDefaultEstoque(input)
  if (!result.ok) {
    return { success: false, error: result.message }
  }

  const produtoId = result.id

  // Materializa política de preços
  if (input.preco_atacado !== null && input.preco_atacado !== undefined) {
    const policyResult = pricingService.materializeSimplePolicy(
      input,
      produtoId,
      defaultMinimumQuantity,
      lojaId
    )

    if (!policyResult.success) {
      // Política não foi criada, mas produto foi. Log + continua.
      // (O produto sem tier de atacado continuará funcionando, apenas sem desconto.)
      console.warn(
        `Falha ao criar política de preços para produto ${produtoId}: ${policyResult.error}`
      )
    } else if (policyResult.tier.ativo) {
      // Persiste tier via repository
      const tierResult = await repo.createPrecosAtacadoTier(policyResult.tier)
      if (!tierResult.ok) {
        console.warn(
          `Falha ao persistir tier para produto ${produtoId}: ${tierResult.message}`
        )
      }
    }
  }

  return { success: true, data: { id: produtoId } }
}

export type AlternarAtivoResult =
  | { success: true }
  | { success: false; error: string }

export async function alternarAtivoProduto(
  produtoId: string,
  ativo: boolean,
  repo: ProdutoRepositoryPort
): Promise<AlternarAtivoResult> {
  const result = await repo.updateAtivo(produtoId, ativo)
  if (!result.ok) return { success: false, error: result.message }
  return { success: true }
}

export async function publicarProdutoCatalogo(
  produtoId: string,
  repo: ProdutoRepositoryPort
): Promise<AlternarAtivoResult> {
  const result = await repo.updateStatusPublicacao(produtoId, 'PUBLICADO')
  if (!result.ok) return { success: false, error: result.message }
  return { success: true }
}

export async function inativarProdutoCatalogo(
  produtoId: string,
  repo: ProdutoRepositoryPort
): Promise<AlternarAtivoResult> {
  const result = await repo.updateStatusPublicacao(produtoId, 'INATIVO')
  if (!result.ok) return { success: false, error: result.message }
  return { success: true }
}

export type { StatusPublicacao }
