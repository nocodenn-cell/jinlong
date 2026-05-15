import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'

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
