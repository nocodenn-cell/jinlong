/**
 * FastProduct Admin — Relatórios (Fase 6)
 *
 * Server Component. Reusa `carregarDadosRelatoriosGerente`
 * (`@/app/gerente/relatorios/actions`) — nenhuma query nova. Carrega um pacote
 * único: período, vendas por dia, top produtos, estoque baixo, resumo executivo.
 *
 * Estrutura lean: resumo executivo em KPIs, tabelas para vendas/top/baixo.
 * Sem gráficos (Recharts viria se aprovado em outra fase).
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
    resumoExecutivo: dados.resumoExecutivo,
    porDia: dados.porDia,
    top: dados.top,
    baixo: dados.baixo,
    rpcErro: dados.rpcErroAmigavel,
  }

  return (
    <RelatoriosContent
      dados={relDados}
      labels={{
        titulo: ui.relatorios_titulo,
        periodoLabel: ui.relatorios_periodo_label,
        aSeparator: ui.relatorios_a_separator,
        custoNaoConfiavel: ui.relatorios_custo_nao_confiavel,
        chartFaturamento: ui.relatorios_chart_faturamento,
        chartPagamentos: ui.relatorios_chart_pagamentos,
        labelConcluidas: ui.relatorios_label_concluidas,
        labelCanceladas: ui.relatorios_label_canceladas,
        labelAjustes: ui.relatorios_label_ajustes,
        secTopProdutos: ui.relatorios_sec_top_produtos,
        secEstoqueReposicao: ui.relatorios_sec_estoque_reposicao,
        origemChina: ui.relatorios_origem_china,
        origemBrasil: ui.relatorios_origem_brasil,
        vazioProdutos: ui.relatorios_vazio_produtos,
        saldoMinTemplate: ui.relatorios_saldo_min_template,
        reporTemplate: ui.relatorios_repor_template,
        vazioEstoque: ui.relatorios_vazio_estoque,
        tooltipFaturado: ui.relatorios_tooltip_faturado,
        noDataLabel: ui.relatorios_vazio_produtos,
        filtros: {
          de: ui.relatorios_filtro_de,
          ate: ui.relatorios_filtro_ate,
          aplicar: ui.relatorios_filtro_aplicar,
          exportarCsv: ui.relatorios_filtro_exportar_csv,
          xlsx: ui.relatorios_filtro_xlsx,
          csvFilename: ui.relatorios_csv_filename,
        },
        locale,
      }}
    />
  )
}
