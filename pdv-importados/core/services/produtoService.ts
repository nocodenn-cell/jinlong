import type {
  NovoProdutoInput,
  ProdutoRepositoryPort,
  StatusPublicacao,
} from '@/core/ports/produto'
import type { PricingPolicyService } from '@shared-core/src/pricing/pricingPolicyService'
import type { PolicyInput } from '@shared-core/src/pricing/policyInput'
import { ProdutoApplicationService } from '@/app/aplicacao/ProdutoApplicationService'
import { ProdutoRepository } from '@/app/infraestrutura/repositories/ProdutoRepository'
import type { CadastroData } from '@shared-core/src/domain/product/requests/CadastroData'
import type { ContextoApp } from '@shared-core/src/domain/product/requests/ContextoApp'
import { SupabaseClient } from '@supabase/supabase-js'

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

/**
 * Cria produto com tier de forma atômica (NOVO).
 *
 * Usa ProdutoApplicationService para orquestração correta:
 * 1. Separa concerns: PolicyInput + CadastroData + ContextoApp
 * 2. Chama domínio: PricingPolicyService.createPricingDecision()
 * 3. Constrói requisição: CreateProductRpcRequest
 * 4. Executa: Repository.execute(rpcRequest)
 * 5. Resultado: Atomicidade garantida via RPC transacional
 *
 * @param policyInput - Apenas dados de pricing (varejo, atacado, quantidade)
 * @param cadastro - Dados de cadastro (nome, categoria, fornecedor)
 * @param context - Contexto (lojaId, source, userId)
 * @param supabase - Cliente Supabase
 * @param pricingService - Serviço de precificação (domínio)
 * @returns Resultado com ID do produto ou erro
 */
export async function criarProdutoComTierAtomico(
  policyInput: PolicyInput,
  cadastro: CadastroData,
  context: ContextoApp,
  supabase: SupabaseClient,
  pricingService: PricingPolicyService,
): Promise<CriarProdutoResult> {
  const repository = new ProdutoRepository(supabase)
  const appService = new ProdutoApplicationService(pricingService, repository)

  const result = await appService.criarProdutoComTier(policyInput, cadastro, context)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true, data: { id: result.id } }
}

export type { StatusPublicacao }
