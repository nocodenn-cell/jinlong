/**
 * ProdutoApplicationService: Orquestração de Domínio + Contexto
 *
 * RESPONSABILIDADES:
 * 1. Recebe: PolicyInput (pricing) + CadastroData (cadastro) + ContextoApp (contexto)
 * 2. Chama: PricingPolicyService.createPricingDecision()
 * 3. Constrói: CreateProductRpcRequest (requisição pronta para RPC)
 * 4. Chama: Repository.execute()
 *
 * NENHUMA REINTERPRETAÇÃO: Cada camada consome output anterior tal qual.
 */

import { PricingPolicyService } from '@shared-core/src/pricing/pricingPolicyService'
import type { PolicyInput } from '@shared-core/src/pricing/policyInput'
import type { PricingDecision } from '@shared-core/src/pricing/decisions/PricingDecision'
import type {
  CreateProductRpcRequest,
  RpcExecutionResult,
} from '@shared-core/src/pricing/requests/CreateProductRpcRequest'

import type { CadastroData } from './types/CadastroData'
import type { ContextoApp } from './types/ContextoApp'
import type { ProdutoRepository } from '../infraestrutura/repositories/ProdutoRepository'

export class ProdutoApplicationService {
  constructor(
    private pricingService: PricingPolicyService,
    private repository: ProdutoRepository,
  ) {}

  /**
   * Cria produto com tier de forma atômica.
   *
   * Fluxo:
   * 1. DOMÍNIO: Decide política de preço (PricingDecision)
   * 2. APLICAÇÃO: Monta requisição RPC pronta (CreateProductRpcRequest)
   * 3. PERSISTÊNCIA: Executa requisição (Repository.execute)
   * 4. SQL: Transação atômica (3 INSERTs com rollback automático)
   *
   * @param input - PolicyInput (apenas: preco_varejo, preco_atacado, quantidade, permitir)
   * @param cadastro - CadastroData (nome, categoria, fornecedor, etc.)
   * @param context - ContextoApp (lojaId, source, userId)
   * @returns Resultado: { success: true, id } ou { success: false, error }
   */
  async criarProdutoComTier(
    input: PolicyInput,
    cadastro: CadastroData,
    context: ContextoApp,
  ): Promise<RpcExecutionResult> {
    // STEP 1: Domínio cria decisão (sem reinterpretação)
    const decision = this.pricingService.createPricingDecision(input, 6)

    if ('error' in decision) {
      return { success: false, error: decision.error }
    }

    // STEP 2: Validação de tier
    // Se não há preco_atacado, tier é null (apenas varejo)
    // Isso é válido, mas o produto vai sem política de atacado
    if (!decision.tier) {
      return {
        success: false,
        error: 'Política de preço obrigatória (preco_atacado deve ser fornecido)',
      }
    }

    // STEP 3: Aplicação constrói requisição pronta
    const rpcRequest: CreateProductRpcRequest = {
      functionName: 'criar_produto_com_tier_atomico',
      params: {
        p_product_data: {
          nome: cadastro.nome,
          codigo_barras: cadastro.codigo_barras,
          preco_varejo: input.preco_varejo,
          preco_custo: cadastro.preco_custo,
          categoria_id: cadastro.categoria_id,
          fornecedor_id: cadastro.fornecedor_id,
          marca_id: cadastro.marca_id,
          unidade_medida: cadastro.unidade_medida,
          observacao: cadastro.observacao,
          ncm: cadastro.ncm,
          permitir_abaixo_custo: input.permitir_abaixo_custo ?? false,
          origem: context.source,
          tem_nf: cadastro.tem_nf ?? false,
          ativo: cadastro.ativo ?? true,
          status_publicacao: cadastro.status_publicacao ?? 'DRAFT',
        },
        p_tier_data: {
          quantidade_minima: decision.tier.quantidade_minima,
          preco_unitario: decision.tier.preco_unitario,
          ativo: decision.tier.ativo,
          permitir_abaixo_custo: decision.tier.permitir_abaixo_custo,
        },
        p_loja_id: context.lojaId,
      },
    }

    // STEP 4: Persistência executa requisição pronta
    return this.repository.execute(rpcRequest)
  }
}
