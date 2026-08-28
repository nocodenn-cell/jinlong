import { createClient } from '@/lib/supabase/server'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroDeExcecao } from '@/lib/errors/mensagemErroUsuario'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'

export type NomeLojaAtualResult =
  | { ok: true; nome: string }
  | { ok: false; error: string }

/** Nome da loja do operador logado — usado em comprovantes (fechamento de caixa). */
export async function obterNomeLojaAtualImpl(): Promise<NomeLojaAtualResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID
    const { data, error } = await supabase
      .from('lojas')
      .select('nome')
      .eq('id', lojaId)
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    return { ok: true, nome: data?.nome ?? 'Loja' }
  } catch (e) {
    return { ok: false, error: mensagemErroDeExcecao(e, 'Não foi possível carregar a loja.', await idiomaOperadorParaErro()) }
  }
}
