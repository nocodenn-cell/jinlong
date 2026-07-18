import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { createProdutoRepository } from '@/lib/adapters/supabase/produtoRepository'
import { createClient } from '@/lib/supabase/server'
import { criarProdutoComEstoque } from '@/core/services/produtoService'
import { statusInicialProduto } from '@/core/systemRules'
import { NovoProdutoSchema } from '@/app/gerente/produtos/produtoFormSchema'
import { mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { revalidatePath } from 'next/cache'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const PERFIS_OK = new Set(['OPERADOR', 'GERENTE', 'DONO', 'ADMIN'])

/**
 * Cadastro mínimo no PDV (produto não encontrado no bip).
 * Autoriza OPERADOR+ — distinto do CRUD completo do catálogo (GERENTE+).
 */
export async function criarProdutoRelampagoPdvImpl(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const u = await getUsuarioAtual()
  if (!u.userId) return { success: false, error: 'Faça login para continuar.' }
  if (!PERFIS_OK.has(u.perfil)) {
    return {
      success: false,
      error: 'Seu perfil não pode cadastrar produto neste caixa.',
    }
  }

  const parsed = NovoProdutoSchema.safeParse(input)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Erro de validação.'
    const { idioma } = await getUsuarioIdioma()
    return { success: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const lifecycle = statusInicialProduto('human')
  const supabase = await createClient()
  const repo = createProdutoRepository(supabase)
  const result = await criarProdutoComEstoque(
    { ...parsed.data, ...lifecycle },
    repo,
  )

  if (result.success) {
    revalidatePath('/admin/catalogo')
    revalidatePath('/caixa')
  }
  return result
}
