'use client'

/**
 * FastProduct Admin — RelatoriosContent
 * Apresentação da tela de relatórios: sempre uma das 4 views executivas (`?view=`).
 * O relatório clássico por abas foi aposentado (UX-IA-01 PR 7).
 */

import { useMemo, useState } from 'react'
import { ExecutivePageHeader } from '@/components/ui/admin-v2'
import type { ExecutiveRelatoriosViewId } from '@/lib/navigation/executiveViews'
import { ExecutiveDomainView } from './executive/ExecutiveDomainView'
import type { ExecutiveExtras } from './executive/executiveExtras'
import { ErrorState } from '@/components/ui/feedback'
import { ROUTES } from '@/lib/navigation/routes'
import type {
  RelatorioVendaDiaDTO,
  RelatorioTopProdDTO,
  RelatorioEstoqueBaixoDTO,
  RelatorioResumoExecutivoDTO,
  RelatorioMargemVendaDTO,
  RelatorioCurvaAbcDTO,
  RelatorioCoberturaEstoqueDTO,
  RelatorioDivergenciaEstoqueDTO,
} from '@/app/gerente/relatorios/actions'
import type { RelatorioSemGiroDTO } from '@/app/gerente/relatorios/sem-giro/actions'
import type { VendaReportRow } from '@/app/gerente/relatorios/vendas/actions'
import type { PeriodoRelatorioResolvido } from '@/lib/relatorios/periodoRelatorio'
import { RelatoriosPeriodFilters } from './RelatoriosPeriodFilters'
import type { RelatoriosFiltrosLabels } from './RelatoriosPeriodFilters'
import { KardexSheet, type KardexAlvo, type KardexLabels } from '@/app/admin/estoque/_components/KardexSheet'
import { avisoPeriodoVisivel, sortPorDiaAsc } from './relatoriosUi'

export type RelatoriosDados = {
  periodo: PeriodoRelatorioResolvido
  tzRelatorio: string
  resumoExecutivo: RelatorioResumoExecutivoDTO
  /** Devolução pós-venda do período e receita líquida (= faturado − devoluções); ver lib/vendas/metricasVendas.ts. */
  devolucoes?: number
  receitaLiquida?: number
  porDia: RelatorioVendaDiaDTO[]
  top: RelatorioTopProdDTO[]
  baixo: RelatorioEstoqueBaixoDTO[]
  margemPorVenda: RelatorioMargemVendaDTO[]
  curvaAbc: RelatorioCurvaAbcDTO[]
  coberturaEstoque: RelatorioCoberturaEstoqueDTO[]
  divergenciaEstoque: RelatorioDivergenciaEstoqueDTO[]
  semGiro: RelatorioSemGiroDTO[]
  vendasDetalhe: VendaReportRow[]
  vendasDetalheErro: string | null
  rpcErro: string | null
}

export type RelatoriosLabels = {
  titulo: string
  periodoLabel: string
  aSeparator: string
  fusoLabel: string
  avisoDatasInvalidas: string
  avisoPeriodoInvertido: string
  avisoPeriodoLimitado: string
  custoNaoConfiavel: string
  chartFaturamento: string
  chartStatusVendas: string
  labelConcluidas: string
  labelCanceladas: string
  kpiFaturamento: string
  kpiTicket: string
  kpiVendas: string
  kpiCancelamento: string
  kpiDevolucoes: string
  kpiReceitaLiquida: string
  kpiMargem: string
  kpiMargemIndisponivel: string
  tabVisao: string
  tabProdutos: string
  tabEstoque: string
  tabMargem: string
  tabVendas: string
  tabsAria: string
  secTopProdutos: string
  secEstoqueReposicao: string
  linkAbrirEstoque: string
  minZeroHint: string
  secMargemPorVenda: string
  margemVendaColData: string
  margemVendaColLiquido: string
  margemVendaColCusto: string
  margemVendaColMargem: string
  margemVendaCustoIndisponivel: string
  vazioMargemVenda: string
  secCurvaAbc: string
  curvaAbcColNome: string
  curvaAbcColValor: string
  curvaAbcColParticipacao: string
  curvaAbcColAcumulado: string
  curvaAbcColClasse: string
  vazioCurvaAbc: string
  secCoberturaEstoque: string
  coberturaEstoqueHint: string
  coberturaEstoqueColAtual: string
  coberturaEstoqueColMedia: string
  coberturaEstoqueColDias: string
  coberturaEstoqueDiasCap: string
  vazioCoberturaEstoque: string
  secDivergenciaEstoque: string
  divergenciaEstoqueHint: string
  divergenciaEstoqueColSaldo: string
  divergenciaEstoqueColMovimentos: string
  vazioDivergenciaEstoque: string
  secSemGiro: string
  semGiroHint: string
  semGiroColSaldo: string
  semGiroColValor: string
  semGiroColUltimaVenda: string
  semGiroNuncaVendeu: string
  vazioSemGiro: string
  secVendasDetalhe: string
  vendasColData: string
  vendasColCliente: string
  vendasColVendedor: string
  vendasColForma: string
  vendasColValor: string
  vendasColStatus: string
  vendasSemCliente: string
  vazioVendasDetalhe: string
  origemChina: string
  origemBrasil: string
  vazioProdutos: string
  saldoMinTemplate: string
  reporTemplate: string
  vazioEstoque: string
  tooltipFaturado: string
  noDataLabel: string
  erroTitulo: string
  filtros: RelatoriosFiltrosLabels
  locale: string
  kardex: KardexLabels
}

function avisoCopy(aviso: ReturnType<typeof avisoPeriodoVisivel>, labels: RelatoriosLabels): string | null {
  if (!aviso) return null
  if (aviso === 'datas_invalidas') return labels.avisoDatasInvalidas
  if (aviso === 'periodo_invertido') return labels.avisoPeriodoInvertido
  return labels.avisoPeriodoLimitado
}

const EXEC_VIEW_TITLE: Record<ExecutiveRelatoriosViewId, string> = {
  'vendas-caixas': 'Vendas & Caixas',
  'dre-financeiro': 'DRE & Financeiro',
  'produtos-estoque': 'Produtos & Estoque',
  'crm-auditoria': 'CRM & Auditoria',
}

export function RelatoriosContent({
  dados,
  labels,
  view,
  executiveExtras,
}: {
  dados: RelatoriosDados
  labels: RelatoriosLabels
  /** Aba executiva via `?view=` (a página redireciona valores ausentes/legados antes de chegar aqui). */
  view: ExecutiveRelatoriosViewId
  /** Dados extras (caixas / financeiro) para as abas executivas. */
  executiveExtras?: ExecutiveExtras
}) {
  const [kardexAlvo, setKardexAlvo] = useState<KardexAlvo | null>(null)

  const aviso = avisoPeriodoVisivel(dados.periodo.aviso)
  const avisoTexto = avisoCopy(aviso, labels)
  const periodoSubtitle = [
    `${labels.periodoLabel}: ${dados.periodo.de}${labels.aSeparator}${dados.periodo.ate}`,
    labels.fusoLabel.replace('{{tz}}', dados.tzRelatorio),
    avisoTexto,
  ]
    .filter(Boolean)
    .join(' · ')

  const porDiaOrdenado = useMemo(() => sortPorDiaAsc(dados.porDia), [dados.porDia])

  return (
    <div className="admin-v2-page" data-executive-view={view}>
      <ExecutivePageHeader
        title={EXEC_VIEW_TITLE[view]}
        subtitle={periodoSubtitle}
        primaryActions={
          <button
            type="button"
            className="admin-v2-btn-secondary admin-v2-print-hide"
            onClick={() => window.print()}
          >
            {labels.filtros.imprimir}
          </button>
        }
        secondaryActions={[
          { id: 'visao-geral', label: 'Visão Geral', href: ROUTES.admin.dashboard },
          { id: 'export-csv', label: 'Exportar (via filtros)', disabled: true },
        ]}
      />

      {dados.rpcErro ? (
        <ErrorState title={labels.erroTitulo} description={dados.rpcErro} dense className="mb-6" />
      ) : null}

      <div className="admin-v2-stack">
        <RelatoriosPeriodFilters
          de={dados.periodo.de}
          ate={dados.periodo.ate}
          view={view}
          csvRows={porDiaOrdenado.map((row) => ({
            dia: row.dia,
            vendas: row.num_vendas,
            faturado: row.total_liquido,
            ticket_medio: row.ticket_medio,
            desconto: row.total_desconto,
          }))}
          labels={labels.filtros}
        />

        <ExecutiveDomainView
          view={view}
          dados={dados}
          extras={executiveExtras}
          locale={labels.locale}
          labels={labels}
          onAbrirKardex={setKardexAlvo}
        />
      </div>

      <KardexSheet alvo={kardexAlvo} onClose={() => setKardexAlvo(null)} labels={labels.kardex} />
    </div>
  )
}
