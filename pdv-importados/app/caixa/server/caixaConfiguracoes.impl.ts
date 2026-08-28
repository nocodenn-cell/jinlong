import { createClient } from '@/lib/supabase/server'
import {
  mensagemErroDeExcecao,
} from '@/lib/errors/mensagemErroUsuario'
import { obterMapaConfiguracoesParaCaixaWeb } from '@/lib/caixa/configuracoesGeraisCaixa'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'

export type ObterConfiguracoesCaixaWebResult =
  | { ok: true; mapa: Record<string, string> }
  | { ok: false; error: string }

export async function obterConfiguracoesParaCaixaWebImpl(): Promise<ObterConfiguracoesCaixaWebResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const mapa = await obterMapaConfiguracoesParaCaixaWeb(supabase)
    return { ok: true, mapa }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar configurações do caixa.', await idiomaOperadorParaErro()),
    }
  }
}
