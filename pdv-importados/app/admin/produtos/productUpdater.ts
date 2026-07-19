/**
 * Adapter ProductUpdater — Missão Products 6 / ADR-007.
 * Atualiza só catálogo (`produtos`). Sem estoque, sem movimentos, sem RPC 270.
 * Validação: shared-core codes; mensagem PT via productMessages (borda).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProductReader,
  ProductUpdater,
  UpdateCategoriaLoteCommand,
  UpdateCategoriaLoteResult,
  UpdateProductCommand,
  UpdateProductInput,
  UpdateProductResult,
} from '@shared-core/src/products'
import {
  PRODUCT_ERROR_CODES,
  validateUpdateProductCommand,
} from '@shared-core/src/products'
import { dualWriteFromStatus } from '@/core/catalog/statusPublicacao'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  formatMensagemCodigoBarrasDuplicado,
  isProdutosCodigoBarrasLojaUniqueViolation,
} from '@/lib/gerente/produtoCodigoBarrasDuplicado'
import { createProductReader } from '@/app/admin/produtos/productReader'
import { resolveProductMessage } from '@/app/admin/produtos/productMessages'

/** @deprecated Preferir PRODUCT_ERROR_CODES + productMessages. */
export const MSG_UPDATE_SEM_ID = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.UPDATE_WITHOUT_ID,
)
export const MSG_NOME_MIN = resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NAME_INVALID)
export const MSG_PRECO_VAREJO = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.PRICE_NOT_POSITIVE,
)
export const MSG_CODIGO_BARRAS_MIN = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.BARCODE_TOO_SHORT,
)
export const MSG_PRECO_ATACADO = resolveProductMessage(
  'pt-BR',
  PRODUCT_ERROR_CODES.ATACADO_INVALID,
)
export const MSG_SAVE_FAIL = resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.SAVE_FAILED)

export type ProdutoUpdatePayload = {
  nome: string
  codigo_barras: string | null
  codigo_interno: string | null
  referencia_fornecedor: string | null
  nome_reduzido_pdv: string | null
  localizacao_prateleira: string | null
  preco_varejo: number
  preco_atacado: number | null
  preco_custo: number | null
  permitir_abaixo_custo: boolean
  quantidade_gatilho_atacado: number | null
  origem?: string
  tem_nf?: boolean
  unidade_medida: string
  observacao: string | null
  categoria_id: string | null
  marca_id: string | null
  fornecedor_id: string | null
  ncm: string | null
  cfop_produto: string | null
  csosn: string | null
  cest: string | null
  cst_pis: string | null
  cst_cofins: string | null
  status_publicacao?: string
  ativo?: boolean
}

export type UpdateProdutoRowFn = (args: {
  id: string
  lojaId: string
  payload: ProdutoUpdatePayload
}) => Promise<{ error: { message: string; code?: string; details?: string } | null }>

export type ProductUpdaterDeps = {
  reader: Pick<ProductReader, 'getById'>
  updateRow: UpdateProdutoRowFn
}

/** Mapeia input de domínio → colunas de `produtos` (catálogo apenas). */
export function mapUpdateProductInputToRow(input: UpdateProductInput): ProdutoUpdatePayload {
  const row: ProdutoUpdatePayload = {
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
  }

  if (input.origem) row.origem = input.origem
  if (input.temNf !== undefined) row.tem_nf = input.temNf

  if (input.statusPublicacao) {
    const lifecycle = dualWriteFromStatus(input.statusPublicacao)
    row.status_publicacao = lifecycle.status_publicacao
    row.ativo = lifecycle.ativo
  }

  return row
}

function mapUpdateDbError(error: {
  message: string
  code?: string
  details?: string
}): { error: string; code?: (typeof PRODUCT_ERROR_CODES)[keyof typeof PRODUCT_ERROR_CODES] } {
  if (isProdutosCodigoBarrasLojaUniqueViolation(error)) {
    return {
      error: formatMensagemCodigoBarrasDuplicado(null),
      code: PRODUCT_ERROR_CODES.BARCODE_DUPLICATE,
    }
  }
  return { error: mensagemErroComSecao('Produto', error.message) }
}

function defaultUpdateRow(supabase: SupabaseClient): UpdateProdutoRowFn {
  return async ({ id, lojaId, payload }) => {
    const { error } = await supabase
      .from('produtos')
      .update(payload)
      .eq('id', id)
      .eq('loja_id', lojaId)
    return { error }
  }
}

function defaultDeps(supabase: SupabaseClient): ProductUpdaterDeps {
  return {
    reader: createProductReader(supabase),
    updateRow: defaultUpdateRow(supabase),
  }
}

async function updateCatalog(
  command: UpdateProductCommand,
  deps: ProductUpdaterDeps,
): Promise<UpdateProductResult> {
  const existing = await deps.reader.getById(command.id)
  if (!existing.ok) {
    return {
      ok: false,
      error: existing.notFound
        ? resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NOT_FOUND)
        : existing.error,
      code: existing.notFound ? PRODUCT_ERROR_CODES.NOT_FOUND : undefined,
      notFound: existing.notFound,
    }
  }
  if (existing.product.lojaId !== command.lojaId) {
    return {
      ok: false,
      error: resolveProductMessage('pt-BR', PRODUCT_ERROR_CODES.NOT_FOUND),
      code: PRODUCT_ERROR_CODES.NOT_FOUND,
      notFound: true,
    }
  }

  const { error } = await deps.updateRow({
    id: command.id,
    lojaId: command.lojaId,
    payload: mapUpdateProductInputToRow(command.input),
  })
  if (error) {
    const mapped = mapUpdateDbError(error)
    return { ok: false, error: mapped.error, code: mapped.code }
  }

  const reload = await deps.reader.getById(command.id)
  if (!reload.ok) return { ok: false, error: reload.error }
  return { ok: true, product: reload.product }
}

async function updateCategoriaLoteRows(
  supabase: SupabaseClient,
  command: UpdateCategoriaLoteCommand,
): Promise<UpdateCategoriaLoteResult> {
  const { data, error } = await supabase
    .from('produtos')
    .update({ categoria_id: command.categoriaId })
    .in('id', command.ids)
    .eq('loja_id', command.lojaId)
    .select('id')
  if (error) {
    return {
      ok: false,
      error: PRODUCT_ERROR_CODES.SAVE_FAILED,
      code: PRODUCT_ERROR_CODES.SAVE_FAILED,
    }
  }
  const rows = data as { id: string }[] | null
  return { ok: true, atualizados: rows?.length ?? 0 }
}

/**
 * Factory ProductUpdater — UPDATE catálogo + reload ProductReader.
 */
export function createProductUpdater(
  supabase: SupabaseClient,
  deps?: Partial<ProductUpdaterDeps>,
): ProductUpdater {
  const resolved = { ...defaultDeps(supabase), ...deps }

  return {
    async update(command: UpdateProductCommand): Promise<UpdateProductResult> {
      const validation = validateUpdateProductCommand(command)
      if (!validation.ok) {
        return {
          ok: false,
          code: validation.code,
          error: resolveProductMessage('pt-BR', validation.code),
        }
      }
      try {
        return await updateCatalog(command, resolved)
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : MSG_SAVE_FAIL,
          code: PRODUCT_ERROR_CODES.SAVE_FAILED,
        }
      }
    },

    async updateCategoriaLote(
      command: UpdateCategoriaLoteCommand,
    ): Promise<UpdateCategoriaLoteResult> {
      try {
        return await updateCategoriaLoteRows(supabase, command)
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : PRODUCT_ERROR_CODES.SAVE_FAILED,
          code: PRODUCT_ERROR_CODES.SAVE_FAILED,
        }
      }
    },
  }
}

/** Reexport para testes que ainda importam validate do adapter. */
export { validateUpdateProductCommand }
