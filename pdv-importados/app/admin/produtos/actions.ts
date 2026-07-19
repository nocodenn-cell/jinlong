'use server'

/**
 * Borda Server Actions — Products (Missão Products 9–10 / ADR-007).
 * Auth + adapters + productMessages + revalidate.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createProductReader } from '@/app/admin/produtos/productReader'
import { createProductWriter } from '@/app/admin/produtos/productWriter'
import { createProductUpdater } from '@/app/admin/produtos/productUpdater'
import { createProductExclusion } from '@/app/admin/produtos/productExclusion'
import { createProductLifecycleService } from '@/app/admin/produtos/productLifecycle'
import { localizeProductFailure } from '@/app/admin/produtos/productMessages'
import {
  PRODUCT_ERROR_CODES,
  type CreateProductInput,
  type CreateProductResult,
  type ExcludeProductResult,
  type ListProductsFilteredQuery,
  type ListProductsFilteredResult,
  type ListProductsResult,
  type ProductByIdResult,
  type ProductCatalogBasics,
  type SetProductStatusLoteResult,
  type SetProductStatusResult,
  type StatusPublicacao,
  type UpdateCategoriaLoteResult,
  type UpdateProductInput,
  type UpdateProductResult,
} from '@shared-core/src/products'

export type { CreateProductInput, UpdateProductInput, ProductCatalogBasics }

function revalidateProdutosPaths(): void {
  revalidatePath('/gerente/produtos')
  revalidatePath('/gerente/estoque')
  revalidatePath('/admin/catalogo')
}

async function requireLoja(
  authCheck: Awaited<ReturnType<typeof assertGerenteSession>>,
): Promise<{ ok: true; lojaId: string } | { ok: false; error: string }> {
  if (!authCheck.ok) return { ok: false, error: authCheck.error }
  const lojaId = authCheck.session.lojaId
  if (!lojaId) {
    return localizeProductFailure(authCheck.session.idioma, {
      error: PRODUCT_ERROR_CODES.LOJA_REQUIRED,
      code: PRODUCT_ERROR_CODES.LOJA_REQUIRED,
    })
  }
  return { ok: true, lojaId }
}

/** Listagem simples via ProductReader. */
export async function buscarProdutosPaginadosAction(
  page: number,
  termo?: string,
): Promise<ListProductsResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const loja = await requireLoja(authCheck)
  if (!loja.ok) return loja

  const supabase = await createClient()
  const result = await createProductReader(supabase).listPaginados({
    lojaId: loja.lojaId,
    page,
    termo,
  })
  if (!result.ok) return localizeProductFailure(authCheck.session.idioma, result)
  return result
}

/**
 * Listagem filtrada do catálogo (RPC existente + snapshot estoque read-through).
 */
export async function buscarProdutosComFiltrosAction(
  query: Omit<ListProductsFilteredQuery, 'lojaId'>,
): Promise<ListProductsFilteredResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const loja = await requireLoja(authCheck)
  if (!loja.ok) return loja

  const supabase = await createClient()
  const result = await createProductReader(supabase).listComFiltros({
    ...query,
    lojaId: loja.lojaId,
  })
  if (!result.ok) return localizeProductFailure(authCheck.session.idioma, result)
  return result
}

/** Detalhe por id via ProductReader. */
export async function buscarProdutoPorIdAction(id: string): Promise<ProductByIdResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const supabase = await createClient()
  const result = await createProductReader(supabase).getById(id)
  if (!result.ok) return localizeProductFailure(authCheck.session.idioma, result)
  return result
}

/** Criação via ProductWriter → RPC 270. */
export async function criarProdutoAction(
  input: CreateProductInput,
): Promise<CreateProductResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const loja = await requireLoja(authCheck)
  if (!loja.ok) return loja

  const supabase = await createClient()
  const result = await createProductWriter(supabase).create({
    input,
    lojaId: loja.lojaId,
    atorId: authCheck.session.userId,
  })

  if (!result.ok) return localizeProductFailure(authCheck.session.idioma, result)
  revalidateProdutosPaths()
  return result
}

/** Atualização de catálogo via ProductUpdater. */
export async function atualizarProdutoAction(
  id: string,
  input: UpdateProductInput,
): Promise<UpdateProductResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  if (!id?.trim()) {
    return localizeProductFailure(authCheck.session.idioma, {
      error: PRODUCT_ERROR_CODES.UPDATE_WITHOUT_ID,
      code: PRODUCT_ERROR_CODES.UPDATE_WITHOUT_ID,
    })
  }

  const loja = await requireLoja(authCheck)
  if (!loja.ok) return loja

  const supabase = await createClient()
  const result = await createProductUpdater(supabase).update({
    id,
    input,
    lojaId: loja.lojaId,
  })

  if (!result.ok) return localizeProductFailure(authCheck.session.idioma, result)
  revalidateProdutosPaths()
  return result
}

/** Exclusão / inativação via ProductExclusionService. */
export async function excluirProdutoAction(id: string): Promise<ExcludeProductResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const supabase = await createClient()
  const result = await createProductExclusion(supabase).exclude(id)

  if (!result.ok) return localizeProductFailure(authCheck.session.idioma, result)
  revalidateProdutosPaths()
  return result
}

/** Lifecycle — publicar / inativar / draft. */
export async function setProductStatusAction(
  id: string,
  status: StatusPublicacao,
): Promise<SetProductStatusResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const loja = await requireLoja(authCheck)
  if (!loja.ok) return loja

  const supabase = await createClient()
  const result = await createProductLifecycleService(supabase).setStatus({
    id,
    lojaId: loja.lojaId,
    status,
  })
  if (!result.ok) return localizeProductFailure(authCheck.session.idioma, result)
  revalidateProdutosPaths()
  return result
}

export async function setProductStatusLoteAction(
  ids: string[],
  status: StatusPublicacao,
): Promise<SetProductStatusLoteResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const loja = await requireLoja(authCheck)
  if (!loja.ok) return loja

  const supabase = await createClient()
  const result = await createProductLifecycleService(supabase).setStatusLote({
    ids,
    lojaId: loja.lojaId,
    status,
  })
  if (!result.ok) return localizeProductFailure(authCheck.session.idioma, result)
  revalidateProdutosPaths()
  return result
}

export async function updateCategoriaLoteAction(
  ids: string[],
  categoriaId: string | null,
): Promise<UpdateCategoriaLoteResult> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const loja = await requireLoja(authCheck)
  if (!loja.ok) return loja

  const supabase = await createClient()
  const result = await createProductUpdater(supabase).updateCategoriaLote({
    ids,
    lojaId: loja.lojaId,
    categoriaId,
  })
  if (!result.ok) return localizeProductFailure(authCheck.session.idioma, result)
  revalidateProdutosPaths()
  return result
}
