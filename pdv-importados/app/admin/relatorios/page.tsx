/**
 * FastProduct Admin — Relatórios (Fase 6)
 *
 * Server Component. Reusa `carregarDadosRelatoriosGerente`
 * (`@/app/gerente/relatorios/actions`) — nenhuma query nova. Carrega um pacote
 * único: período, vendas por dia, top produtos, estoque baixo, resumo executivo.
 */

import { carregarDadosRelatoriosGerente } from '@/app/gerente/relatorios/actions'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES } from '@shared-core/navigation/routes'
import { RelatoriosContent, type RelatoriosDados } from './_components/RelatoriosContent'

type SearchParams = {
  de?: string
  ate?: string
  tab?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminRelatoriosPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.relatorios,
    resource: `route:${ROUTES.admin.relatorios}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const locale = localeFromIdioma(session.idioma)

  const sp = (searchParams ? await searchParams : {}) ?? {}
  const dados = await carregarDadosRelatoriosGerente({
    de: sp.de,
    ate: sp.ate,
  })

  const relDados: RelatoriosDados = {
    periodo: dados.periodo,
    tzRelatorio: dados.tzRelatorio,
    resumoExecutivo: dados.resumoExecutivo,
    porDia: dados.porDia,
    top: dados.top,
    baixo: dados.baixo,
    margemPorVenda: dados.margemPorVenda,
    curvaAbc: dados.curvaAbc,
    coberturaEstoque: dados.coberturaEstoque,
    divergenciaEstoque: dados.divergenciaEstoque,
    rpcErro: dados.rpcErroAmigavel,
  }

  return (
    <RelatoriosContent
      dados={relDados}
      initialTab={sp.tab}
      labels={{
        titulo: ui.relatorios_titulo,
        periodoLabel: ui.relatorios_periodo_label,
        aSeparator: ui.relatorios_a_separator,
        fusoLabel: ui.relatorios_fuso_label,
        avisoDatasInvalidas: ui.relatorios_aviso_datas_invalidas,
        avisoPeriodoInvertido: ui.relatorios_aviso_periodo_invertido,
        avisoPeriodoLimitado: ui.relatorios_aviso_periodo_limitado,
        custoNaoConfiavel: ui.relatorios_custo_nao_confiavel,
        chartFaturamento: ui.relatorios_chart_faturamento,
        chartStatusVendas: ui.relatorios_chart_status_vendas,
        labelConcluidas: ui.relatorios_label_concluidas,
        labelCanceladas: ui.relatorios_label_canceladas,
        kpiFaturamento: ui.relatorios_kpi_faturamento,
        kpiTicket: ui.relatorios_kpi_ticket,
        kpiVendas: ui.relatorios_kpi_vendas,
        kpiCancelamento: ui.relatorios_kpi_cancelamento,
        kpiMargem: ui.relatorios_kpi_margem,
        kpiMargemIndisponivel: ui.relatorios_kpi_margem_indisponivel,
        tabVisao: ui.relatorios_tab_visao,
        tabProdutos: ui.relatorios_tab_produtos,
        tabEstoque: ui.relatorios_tab_estoque,
        tabMargem: ui.relatorios_tab_margem,
        tabsAria: ui.relatorios_tabs_aria,
        secTopProdutos: ui.relatorios_sec_top_produtos,
        secEstoqueReposicao: ui.relatorios_sec_estoque_reposicao,
        linkAbrirEstoque: ui.relatorios_link_abrir_estoque,
        minZeroHint: ui.relatorios_min_zero_hint,
        secMargemPorVenda: ui.relatorios_sec_margem_por_venda,
        margemVendaColData: ui.relatorios_margem_venda_col_data,
        margemVendaColLiquido: ui.relatorios_margem_venda_col_liquido,
        margemVendaColCusto: ui.relatorios_margem_venda_col_custo,
        margemVendaColMargem: ui.relatorios_margem_venda_col_margem,
        margemVendaCustoIndisponivel: ui.relatorios_margem_venda_custo_indisponivel,
        vazioMargemVenda: ui.relatorios_vazio_margem_venda,
        secCurvaAbc: ui.relatorios_sec_curva_abc,
        curvaAbcColNome: ui.relatorios_curva_abc_col_nome,
        curvaAbcColValor: ui.relatorios_curva_abc_col_valor,
        curvaAbcColAcumulado: ui.relatorios_curva_abc_col_acumulado,
        curvaAbcColClasse: ui.relatorios_curva_abc_col_classe,
        vazioCurvaAbc: ui.relatorios_vazio_curva_abc,
        secCoberturaEstoque: ui.relatorios_sec_cobertura_estoque,
        coberturaEstoqueHint: ui.relatorios_cobertura_estoque_hint,
        coberturaEstoqueColAtual: ui.relatorios_cobertura_estoque_col_atual,
        coberturaEstoqueColMedia: ui.relatorios_cobertura_estoque_col_media,
        coberturaEstoqueColDias: ui.relatorios_cobertura_estoque_col_dias,
        coberturaEstoqueDiasCap: ui.relatorios_cobertura_estoque_dias_cap,
        vazioCoberturaEstoque: ui.relatorios_vazio_cobertura_estoque,
        secDivergenciaEstoque: ui.relatorios_sec_divergencia_estoque,
        divergenciaEstoqueHint: ui.relatorios_divergencia_estoque_hint,
        divergenciaEstoqueColSaldo: ui.relatorios_divergencia_estoque_col_saldo,
        divergenciaEstoqueColMovimentos: ui.relatorios_divergencia_estoque_col_movimentos,
        vazioDivergenciaEstoque: ui.relatorios_vazio_divergencia_estoque,
        origemChina: ui.relatorios_origem_china,
        origemBrasil: ui.relatorios_origem_brasil,
        vazioProdutos: ui.relatorios_vazio_produtos,
        saldoMinTemplate: ui.relatorios_saldo_min_template,
        reporTemplate: ui.relatorios_repor_template,
        vazioEstoque: ui.relatorios_vazio_estoque,
        tooltipFaturado: ui.relatorios_tooltip_faturado,
        noDataLabel: ui.relatorios_vazio_produtos,
        erroTitulo: ui.relatorios_erro_titulo,
        filtros: {
          de: ui.relatorios_filtro_de,
          ate: ui.relatorios_filtro_ate,
          aplicar: ui.relatorios_filtro_aplicar,
          exportarCsv: ui.relatorios_filtro_exportar_csv_vendas_dia,
          csvFilename: ui.relatorios_csv_filename,
          preset7: ui.relatorios_filtro_preset_7,
          preset15: ui.relatorios_filtro_preset_15,
          preset30: ui.relatorios_filtro_preset_30,
          presetsAria: ui.relatorios_filtro_presets_aria,
        },
        locale,
      }}
    />
  )
}
