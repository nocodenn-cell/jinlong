import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'

/** Resultado padronizado para server actions de cadastro (formato legado). */
export type CadastroActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Extrai erros de validação Zod e formata na língua do usuário. */
export async function zodValidationError(
  issues: Array<{ message: string }>,
): Promise<{ success: false; error: string }> {
  const { idioma } = await getUsuarioIdioma()
  return {
    success: false,
    error: mensagemErroValidacaoZod(
      issues.map((i) => i.message).join('; '),
      idioma,
    ),
  }
}

/** Alterna o campo `ativo` de uma linha em uma tabela de cadastro. */
export async function alternarAtivoCadastro(
  tabela: string,
  id: string,
  ativo: boolean,
  revalidatePaths: string[],
): Promise<CadastroActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) return { success: false, error: 'ID inválido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from(tabela)
    .update({ ativo })
    .eq('id', idParsed.data)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Alterar situação', error.message) }
  }

  for (const p of revalidatePaths) revalidatePath(p)
  return { success: true, data: null }
}

/** Exclui uma linha de uma tabela de cadastro por ID. */
export async function excluirCadastro(
  tabela: string,
  id: string,
  secaoErro: string,
  revalidatePaths: string[],
): Promise<CadastroActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) return { success: false, error: 'ID inválido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from(tabela)
    .delete()
    .eq('id', idParsed.data)

  if (error) {
    return { success: false, error: mensagemErroComSecao(secaoErro, error.message) }
  }

  for (const p of revalidatePaths) revalidatePath(p)
  return { success: true, data: null }
}
