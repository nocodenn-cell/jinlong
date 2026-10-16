/**
 * FastProduct Admin — Configurações
 *
 * Server Component. Carrega dados da loja + PDV config.
 * Client: 3 abas (Loja, Impostos e fiscal, Preferências).
 * Reutiliza actions de /gerente/configuracoes — sem contrato novo.
 */

import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'
import { ConfiguracoesContent, type ConfigDados } from './_components/ConfiguracoesContent'

export default async function AdminConfiguracoes() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.configuracoes,
    resource: `route:${ROUTES.admin.configuracoes}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui

  const supabase = await createClient()

  const [{ data: loja }, { data: pdvConfig }] = await Promise.all([
    supabase
      .from('lojas')
      .select(
        `
        id, nome, cnpj, inscricao_estadual, telefone, email, logo_url,
        endereco_logradouro, endereco_numero, endereco_complemento,
        endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
        razao_social, nome_fantasia, cnae,
        numero_serie_nfce, numero_serie_nfe
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

  const dados: ConfigDados = {
    loja: loja ?? null,
    pdvConfig: pdvConfig ?? null,
  }

  return (
    <ConfiguracoesContent
      dados={dados}
      labels={{
        titulo: ui.configuracoes_titulo,
        subtitulo: ui.configuracoes_subtitulo,
        subtituloLoja: ui.configuracoes_subtitulo_loja,
        subtituloImpostos: ui.configuracoes_subtitulo_impostos,
        subtituloPreferencias: ui.configuracoes_subtitulo_preferencias,
        tabsAria: ui.configuracoes_tabs_aria,
        unsavedWarn: ui.configuracoes_unsaved_warn,
        salvando: ui.configuracoes_salvando,
        tabLoja: ui.configuracoes_tab_loja,
        tabImpostos: ui.configuracoes_tab_impostos,
        tabPreferencias: ui.configuracoes_tab_preferencias,
        sim: m.comum.sim,
        nao: m.comum.nao,
        fechar: m.comum.fechar,
        loja: {
          secDados: ui.configuracoes_loja_sec_dados,
          secIdentidade: ui.configuracoes_loja_sec_identidade,
          secContato: ui.configuracoes_loja_sec_contato,
          secEndereco: ui.configuracoes_loja_sec_endereco,
          secSerieFiscal: ui.configuracoes_loja_sec_serie_fiscal,
          hintIdentidade: ui.configuracoes_loja_hint_identidade,
          hintEndereco: ui.configuracoes_loja_hint_endereco,
          hintSerie: ui.configuracoes_loja_hint_serie,
          nome: ui.configuracoes_loja_nome,
          cnpj: ui.configuracoes_loja_cnpj,
          razaoSocial: ui.configuracoes_loja_razao_social,
          nomeFantasia: ui.configuracoes_loja_nome_fantasia,
          inscricaoEstadual: ui.configuracoes_loja_inscricao_estadual,
          cnae: ui.configuracoes_loja_cnae,
          hintCnae: ui.configuracoes_loja_hint_cnae,
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
          logo: ui.configuracoes_loja_logo,
          hintLogo: ui.configuracoes_loja_hint_logo,
          btnUploadLogo: ui.configuracoes_loja_btn_upload_logo,
          removerLogo: ui.configuracoes_loja_remover_logo,
          logoPreviewAlt: ui.configuracoes_loja_logo_preview_alt,
          phCnpj: ui.configuracoes_loja_ph_cnpj,
          phCnae: ui.configuracoes_loja_ph_cnae,
          phCep: ui.configuracoes_loja_ph_cep,
          phTel: ui.configuracoes_loja_ph_tel,
          sucesso: ui.configuracoes_loja_sucesso,
          btnSalvar: ui.configuracoes_loja_btn_salvar,
        },
        fiscal: {
          sec: ui.configuracoes_fiscal_sec,
          hint: ui.configuracoes_fiscal_hint,
          regime: ui.configuracoes_fiscal_regime,
          cfop: ui.configuracoes_fiscal_cfop,
          cst: ui.configuracoes_fiscal_cst,
          hintCfop: ui.configuracoes_fiscal_hint_cfop,
          hintCst: ui.configuracoes_fiscal_hint_cst,
          autoFiscal: ui.configuracoes_fiscal_auto,
          hintAutoFiscal: ui.configuracoes_fiscal_hint_auto,
          phCfop: ui.configuracoes_fiscal_ph_cfop,
          warnSalveLoja: ui.configuracoes_fiscal_warn_salve_loja,
          sucesso: ui.configuracoes_fiscal_sucesso,
          btnSalvar: ui.configuracoes_fiscal_btn_salvar,
        },
        prefs: {
          sec: ui.configuracoes_prefs_sec,
          hint: ui.configuracoes_prefs_hint,
          idioma: ui.configuracoes_prefs_idioma,
          formato: ui.configuracoes_prefs_formato,
          imprimirAuto: ui.configuracoes_prefs_imprimir_auto,
          hintImprimirAuto: ui.configuracoes_prefs_hint_imprimir_auto,
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
