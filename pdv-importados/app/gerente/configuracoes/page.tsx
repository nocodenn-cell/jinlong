import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { createClient } from '@/lib/supabase/server'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { ConfiguracoesClient } from './ConfiguracoesClient'

/**
 * Server component — `/gerente/configuracoes`.
 *
 * Carrega a configuração corrente da loja a partir das tabelas:
 *   - `lojas` (dados gerais + endereço)
 *   - `pdv_config` (fiscal + preferências)
 */
export default async function ConfiguracoesPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)

  const supabase = await createClient()
  const [{ data: loja }, { data: pdvConfig }] = await Promise.all([
    supabase
      .from('lojas')
      .select(
        `
        id, nome, cnpj, inscricao_estadual, telefone, email, logo_url,
        endereco_logradouro, endereco_numero, endereco_complemento,
        endereco_bairro, endereco_cidade, endereco_uf, endereco_cep
      `,
      )
      .maybeSingle(),
    supabase
      .from('pdv_config')
      .select(
        `
        loja_id, cfop_padrao, cst_padrao, regime_tributario,
        auto_enqueue_fiscal, idioma_padrao, tema_padrao,
        imprimir_cupom_auto, formato_impressao
      `,
      )
      .maybeSingle(),
  ])

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.configuracoes.titulo} />
      <p className="gerente-fin-muted mb-6 text-sm">{m.configuracoes.subtitulo}</p>

      <ConfiguracoesClient
        idioma={idioma}
        lojaInicial={loja ?? null}
        pdvConfigInicial={pdvConfig ?? null}
      />
    </div>
  )
}
