import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { createClient } from '@/lib/supabase/server'
import { createProductWriter } from '@/app/admin/produtos/productWriter'
import { mapFormToCreateProductInput } from '@/app/admin/produtos/productFormMappers'
import { localizeProductFailure } from '@/app/admin/produtos/productMessages'
import { statusInicialProduto } from '@/core/systemRules'
import { NovoProdutoSchema } from '@/app/gerente/produtos/produtoFormSchema'
import { mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { revalidatePath } from 'next/cache'
import { PRODUCT_ERROR_CODES } from '@shared-core/src/products'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const PERFIS_OK = new Set(['OPERADOR', 'GERENTE', 'DONO', 'ADMIN'])

/**
 * Cadastro mínimo no PDV (produto não encontrado no bip).
 * Autoriza OPERADOR+ — distinto do CRUD completo do catálogo (GERENTE+).
 * Create via ProductWriter → RPC 270 (única porta de criação).
 */
export async function criarProdutoRelampagoPdvImpl(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const u = await getUsuarioAtual()
  if (!u.userId) {
    return {
      success: false,
      error: localizeProductFailure(u.idioma, {
        error: PRODUCT_ERROR_CODES.AUTH_REQUIRED,
        code: PRODUCT_ERROR_CODES.AUTH_REQUIRED,
      }).error,
    }
  }
  if (!PERFIS_OK.has(u.perfil)) {
    return {
      success: false,
      error: localizeProductFailure(u.idioma, {
        error: PRODUCT_ERROR_CODES.AUTH_REQUIRED,
        code: PRODUCT_ERROR_CODES.AUTH_REQUIRED,
      }).error,
    }
  }

  const parsed = NovoProdutoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const lojaId = u.lojaId
  if (!lojaId) {
    const { idioma } = await getUsuarioIdioma()
    return {
      success: false,
      error: localizeProductFailure(idioma, {
        error: PRODUCT_ERROR_CODES.LOJA_REQUIRED,
        code: PRODUCT_ERROR_CODES.LOJA_REQUIRED,
      }).error,
    }
  }

  const lifecycle = statusInicialProduto('human')
  const supabase = await createClient()
  const writer = createProductWriter(supabase)
  const { idioma } = await getUsuarioIdioma()
  const result = await writer.create({
    input: mapFormToCreateProductInput(parsed.data, lifecycle),
    lojaId,
    atorId: u.userId,
  })

  if (!result.ok) {
    return {
      success: false,
      error: localizeProductFailure(idioma, result).error,
    }
  }

  revalidatePath('/admin/catalogo')
  revalidatePath('/caixa')
  return { success: true, data: { id: result.product.id } }
}
