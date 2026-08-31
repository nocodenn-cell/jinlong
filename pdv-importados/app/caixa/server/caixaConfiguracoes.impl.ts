import { createClient } from '@/lib/supabase/server'
import {
  mensagemErroDeExcecao,
} from '@/lib/errors/mensagemErroUsuario'
import { obterMapaConfiguracoesParaCaixaWeb } from '@/lib/caixa/configuracoesGeraisCaixa'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import { caixaMsgOperador, caixaMsgServidor } from '@/app/caixa/server/caixaMensagensServidor'

export type ObterConfiguracoesCaixaWebResult =
  | { ok: true; mapa: Record<string, string> }
  | { ok: false; error: string }

export async function obterConfiguracoesParaCaixaWebImpl(): Promise<ObterConfiguracoesCaixaWebResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: await caixaMsgOperador( 'err_srv_sessao_expirada') }

    const mapa = await obterMapaConfiguracoesParaCaixaWeb(supabase)
    return { ok: true, mapa }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_carregar_config'), await idiomaOperadorParaErro()),
    }
  }
}
