/**
 * FastProduct Admin — Relatórios (Sprint 4 / RFC-UX-017)
 * PageShell + FilterBar daterange + ExportAction + TabNav por seção.
 */

import { Suspense } from 'react'
import { carregarDadosRelatoriosGerente } from '@/app/gerente/relatorios/actions'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES } from '@shared-core/navigation/routes'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { PageShell, PageActions } from '@/components/ui/admin-v2'
import { ErrorState } from '@/components/ui/feedback'
import {
  RelatoriosContent,
  type RelatoriosDados,
  type RelatoriosSecao,
} from './_components/RelatoriosContent'
import { RelatoriosExportButton } from './_components/RelatoriosExportButton'

type SearchParams = {
  de?: string
  ate?: string
  sec?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

function parseSecao(raw: string | undefined): RelatoriosSecao {
  if (raw === 'estoque' || raw === 'margem') return raw
  return 'vendas'
}

export default async function AdminRelatoriosPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.relatorios,
    resource: `route:${ROUTES.admin.relatorios}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const locale = localeFromIdioma(session.idioma)

  const sp = (searchParams ? await searchParams : {}) ?? {}
  const secao = parseSecao(sp.sec)
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
    margemPorVenda: dados.margemPorVenda,
    curvaAbc: dados.curvaAbc,
    coberturaEstoque: dados.coberturaEstoque,
    rpcErro: dados.rpcErroAmigavel,
  }

  const periodoSubtitle = `${ui.relatorios_periodo_label}: ${dados.periodo.de}${ui.relatorios_a_separator}${dados.periodo.ate}${
    dados.periodo.aviso ? ` (${dados.periodo.aviso})` : ''
  }`

  const filters: FilterDef[] = [
    {
      type: 'daterange',
      keyFrom: 'de',
      keyTo: 'ate',
      label: ui.relatorios_periodo_label,
      fromLabel: ui.relatorios_filtro_de,
      toLabel: ui.relatorios_filtro_ate,
    },
  ]

  const csvRows = dados.porDia.map((row) => ({
    dia: row.dia,
    vendas: row.num_vendas,
    faturado: row.total_liquido,
    ticket_medio: row.ticket_medio,
    desconto: row.total_desconto,
  }))

  return (
    <PageShell
      title={ui.relatorios_titulo}
      subtitle={periodoSubtitle}
      filters={
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} clearLabel={m.comum.limpar_filtros} />
        </Suspense>
      }
      actions={
        <PageActions>
          <RelatoriosExportButton
            csvRows={csvRows}
            label={ui.relatorios_filtro_exportar_csv}
            filename={ui.relatorios_csv_filename}
          />
        </PageActions>
      }
    >
      {dados.rpcErroAmigavel && !dados.porDia.length ? (
        <ErrorState dense description={dados.rpcErroAmigavel} className="mb-4 items-start text-left" />
      ) : null}
      <RelatoriosContent
        dados={relDados}
        secao={secao}
        labels={{
          titulo: ui.relatorios_titulo,
          periodoLabel: ui.relatorios_periodo_label,
          aSeparator: ui.relatorios_a_separator,
          custoNaoConfiavel: ui.relatorios_custo_nao_confiavel,
          chartFaturamento: ui.relatorios_chart_faturamento,
          chartStatusVendas: ui.relatorios_chart_status_vendas,
          labelConcluidas: ui.relatorios_label_concluidas,
          labelCanceladas: ui.relatorios_label_canceladas,
          secTopProdutos: ui.relatorios_sec_top_produtos,
          secEstoqueReposicao: ui.relatorios_sec_estoque_reposicao,
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
          vazioCoberturaEstoque: ui.relatorios_vazio_cobertura_estoque,
          origemChina: ui.relatorios_origem_china,
          origemBrasil: ui.relatorios_origem_brasil,
          vazioProdutos: ui.relatorios_vazio_produtos,
          saldoMinTemplate: ui.relatorios_saldo_min_template,
          reporTemplate: ui.relatorios_repor_template,
          vazioEstoque: ui.relatorios_vazio_estoque,
          tooltipFaturado: ui.relatorios_tooltip_faturado,
          vazioStatus: ui.relatorios_vazio_status,
          tabVendas: ui.relatorios_tab_vendas,
          tabEstoque: ui.relatorios_tab_estoque,
          tabMargem: ui.relatorios_tab_margem,
          locale,
        }}
      />
    </PageShell>
  )
}
