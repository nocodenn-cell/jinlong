/**
 * Adapter ProductWriter — Missão Products 5 / ADR-007.
 * Create via RPC `criar_produto_com_estoque_inicial` (mig. 270).
 * Estoque inicial = efeito inventory na mesma TX; não controla saldo contínuo.
 * Validação: shared-core codes; mensagem PT via productMessages (borda).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateProductCommand,
  CreateProductInput,
  CreateProductResult,
  ProductReader,
  ProductWriter,
} from '@shared-core/src/products'
import {
  PRODUCT_ERROR_CODES,
  validateCreateProductCommand,
} from '@shared-core/src/products'
import type { CriarProdutoEstoqueInput } from '@/lib/adapters/supabase/criarProdutoComEstoqueInicialRpc'
import {
  executarCriarProdutoComEstoqueInicial,
  mensagemErroCriarProdutoRpc,
} from '@/lib/adapters/supabase/criarProdutoComEstoqueInicialRpc'
import { createProductReader } from '@/app/admin/produtos/productReader'
import { resolveProductMessage } from '@/app/admin/produtos/productMessages'

export type CreateProductRpcFn = typeof executarCriarProdutoComEstoqueInicial

export type ProductWriterDeps = {
  createRpc: CreateProductRpcFn
  reader: Pick<ProductReader, 'getById'>
}

/** @deprecated Preferir PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED + productMessages. */
export const MSG_RELOAD_POS_CREATE = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED,
)

/**
 * Mapeia contrato shared-core → payload legado da RPC 270.
 * Defaults de origem/tem_nf alinhados ao cadastro manual humano.
 */
export function mapCreateProductInputToRpc(input: CreateProductInput): CriarProdutoEstoqueInput {
  return {
    nome: (input.nome ?? '').trim(),
    codigo_barras: input.codigoBarras?.trim() || null,
    codigo_interno: input.codigoInterno?.trim() || null,
    referencia_fornecedor: input.referenciaFornecedor?.trim() || null,
    nome_reduzido_pdv: input.nomeReduzidoPdv?.trim() || null,
    localizacao_prateleira: input.localizacaoPrateleira?.trim() || null,
    preco_varejo: Number(input.precoVarejo),
    preco_atacado:
      input.precoAtacado !== undefined && input.precoAtacado !== null
        ? Number(input.precoAtacado)
        : null,
    preco_custo:
      input.precoCusto !== undefined && input.precoCusto !== null
        ? Number(input.precoCusto)
        : null,
    permitir_abaixo_custo: input.permitirAbaixoCusto ?? false,
    quantidade_gatilho_atacado: input.quantidadeGatilhoAtacado ?? null,
    origem: input.origem ?? 'china_manual',
    tem_nf: input.temNf ?? false,
    unidade_medida: input.unidadeMedida ?? 'UN',
    observacao: input.observacao?.trim() || null,
    categoria_id: input.categoriaId ?? null,
    marca_id: input.marcaId ?? null,
    fornecedor_id: input.fornecedorId ?? null,
    ncm: input.ncm ?? null,
    cfop_produto: input.cfopProduto ?? null,
    csosn: input.csosn ?? null,
    cest: input.cest ?? null,
    cst_pis: input.cstPis ?? null,
    cst_cofins: input.cstCofins ?? null,
    ...(input.statusPublicacao ? { status_publicacao: input.statusPublicacao } : {}),
    ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
    estoque_inicial_quantidade:
      input.estoqueInicial !== undefined && input.estoqueInicial !== null
        ? Number(input.estoqueInicial)
        : 0,
    estoque_inicial_minimo:
      input.estoqueInicialMinimo !== undefined && input.estoqueInicialMinimo !== null
        ? Number(input.estoqueInicialMinimo)
        : 0,
    client_request_id: input.clientRequestId?.trim() || null,
  }
}

function defaultDeps(supabase: SupabaseClient): ProductWriterDeps {
  return {
    createRpc: executarCriarProdutoComEstoqueInicial,
    reader: createProductReader(supabase),
  }
}

function mapCreateCatchError(e: unknown): string {
  if (e instanceof Error) return mensagemErroCriarProdutoRpc(e.message)
  return resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.SAVE_FAILED)
}

async function createViaRpc(
  command: CreateProductCommand,
  deps: ProductWriterDeps,
): Promise<CreateProductResult> {
  const created = await deps.createRpc({
    input: mapCreateProductInputToRpc(command.input),
    atorId: command.atorId,
  })
  if (!created.ok) return { ok: false, error: created.message }

  const reload = await deps.reader.getById(created.id)
  if (!reload.ok) {
    return {
      ok: false,
      error: resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED),
      code: PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED,
    }
  }
  return { ok: true, product: reload.product }
}

/**
 * Factory ProductWriter — orquestra RPC 270 + reload ProductReader.
 */
export function createProductWriter(
  supabase: SupabaseClient,
  deps?: Partial<ProductWriterDeps>,
): ProductWriter {
  const resolved = { ...defaultDeps(supabase), ...deps }

  return {
    async create(command: CreateProductCommand): Promise<CreateProductResult> {
      const validation = validateCreateProductCommand(command)
      if (!validation.ok) {
        return {
          ok: false,
          code: validation.code,
          error: resolveProductMessage('pt-BR', validation.code),
        }
      }
      try {
        return await createViaRpc(command, resolved)
      } catch (e) {
        return { ok: false, error: mapCreateCatchError(e) }
      }
    },
  }
}
