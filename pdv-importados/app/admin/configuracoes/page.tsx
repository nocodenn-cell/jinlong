/**
 * FastProduct Admin — Configurações (Fase 7)
 *
 * Server Component. Carrega dados da loja + PDV config das tabelas (inline, no gerente
 * faz assim). Passa para client component que renderiza 3 abas:
 *   - Loja (dados gerais, endereço, logo) — reusa `atualizarDadosLojaAction`
 *   - PDV (fiscal, preferências) — reusa `atualizarConfiguracoesPdvAction`
 *   - Cadastros (modal rápido p/ cliente, links p/ categoria/marca/fornecedor)
 *
 * Zero query nova — reutiliza ações existentes de /gerente/configuracoes.
 */

import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { ROUTES } from '@shared-core/navigation/routes'
import { ConfiguracoesContent, type ConfigDados } from './_components/ConfiguracoesContent'

export default async function AdminConfiguracoes() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.configuracoes,
    resource: `route:${ROUTES.admin.configuracoes}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui

  const supabase = await createClient()

  const [{ data: loja, error: lojaLoadError }, { data: pdvConfig, error: pdvLoadError }] = await Promise.all([
    supabase
      .from('lojas')
      .select(
        `
        id, nome, cnpj, inscricao_estadual, telefone, email, logo_url,
        endereco_logradouro, endereco_numero, endereco_complemento,
        endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
        razao_social, nome_fantasia, cnae,
        numero_serie_nfce, numero_serie_nfe
      `
      )
      .maybeSingle(),
    supabase
      .from('pdv_config')
      .select(
        `
        loja_id, cfop_padrao, cst_padrao, regime_tributario,
        auto_enqueue_fiscal, idioma_padrao, tema_padrao,
        imprimir_cupom_auto, formato_impressao
      `
      )
      .maybeSingle(),
  ])

  const dados: ConfigDados = {
    loja: loja ?? null,
    pdvConfig: pdvConfig ?? null,
  }
  // lojaLoadError/pdvLoadError: falha real de carga — nunca deve renderizar
  // o formulário como se estivesse vazio/default silenciosamente.
  const loadError = lojaLoadError
    ? mensagemErroComSecao('Configurações', lojaLoadError.message, session.idioma)
    : pdvLoadError
      ? mensagemErroComSecao('Configurações', pdvLoadError.message, session.idioma)
      : null

  return (
    <ConfiguracoesContent
      dados={dados}
      loadError={loadError}
      labels={{
        titulo: ui.configuracoes_titulo,
        subtitulo: ui.configuracoes_subtitulo,
        tabLoja: ui.configuracoes_tab_loja,
        tabImpostos: ui.configuracoes_tab_impostos,
        tabPreferencias: ui.configuracoes_tab_preferencias,
        loja: {
          secDados: ui.configuracoes_loja_sec_dados,
          secContato: ui.configuracoes_loja_sec_contato,
          secEndereco: ui.configuracoes_loja_sec_endereco,
          secSerieFiscal: ui.configuracoes_loja_sec_serie_fiscal,
          nome: ui.configuracoes_loja_nome,
          cnpj: ui.configuracoes_loja_cnpj,
          razaoSocial: ui.configuracoes_loja_razao_social,
          nomeFantasia: ui.configuracoes_loja_nome_fantasia,
          inscricaoEstadual: ui.configuracoes_loja_inscricao_estadual,
          cnae: ui.configuracoes_loja_cnae,
          telefone: ui.configuracoes_loja_telefone,
          email: ui.configuracoes_loja_email,
          logradouro: ui.configuracoes_loja_logradouro,
          numero: ui.configuracoes_loja_numero,
          complemento: ui.configuracoes_loja_complemento,
          bairro: ui.configuracoes_loja_bairro,
          cidade: ui.configuracoes_loja_cidade,
          uf: ui.configuracoes_loja_uf,
          cep: ui.configuracoes_loja_cep,
          nfce: ui.configuracoes_loja_nfce,
          nfe: ui.configuracoes_loja_nfe,
          phCnpj: ui.configuracoes_loja_ph_cnpj,
          phCnae: ui.configuracoes_loja_ph_cnae,
          phCep: ui.configuracoes_loja_ph_cep,
          sucesso: ui.configuracoes_loja_sucesso,
          btnSalvar: ui.configuracoes_loja_btn_salvar,
        },
        fiscal: {
          sec: ui.configuracoes_fiscal_sec,
          regime: ui.configuracoes_fiscal_regime,
          cfop: ui.configuracoes_fiscal_cfop,
          cst: ui.configuracoes_fiscal_cst,
          phCfop: ui.configuracoes_fiscal_ph_cfop,
          phCst: ui.configuracoes_fiscal_ph_cst,
          warnSalveLoja: ui.configuracoes_fiscal_warn_salve_loja,
          sucesso: ui.configuracoes_fiscal_sucesso,
          btnSalvar: ui.configuracoes_fiscal_btn_salvar,
        },
        prefs: {
          sec: ui.configuracoes_prefs_sec,
          idioma: ui.configuracoes_prefs_idioma,
          formato: ui.configuracoes_prefs_formato,
          checkLembrete: ui.configuracoes_prefs_check_lembrete,
          checkResumo: ui.configuracoes_prefs_check_resumo,
          sucesso: ui.configuracoes_prefs_sucesso,
          btnSalvar: ui.configuracoes_prefs_btn_salvar,
        },
        enums: {
          regimes: {
            SIMPLES_NACIONAL: ui.configuracoes_enum_regime_simples,
            LUCRO_PRESUMIDO: ui.configuracoes_enum_regime_lucro_presumido,
            LUCRO_REAL: ui.configuracoes_enum_regime_lucro_real,
            MEI: ui.configuracoes_enum_regime_mei,
          },
          idiomas: {
            pt: ui.configuracoes_enum_idioma_pt,
            zh: ui.configuracoes_enum_idioma_zh,
          },
          formatos: {
            TERMICA: ui.configuracoes_enum_formato_termica,
            A4: ui.configuracoes_enum_formato_a4,
          },
        },
      }}
    />
  )
}
