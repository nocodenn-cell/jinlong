'use client'

/**
 * FastProduct Admin — RelatoriosContent
 * Apresentação da tela de relatórios (KPIs, gráficos, abas). Sem alteração de contratos.
 */

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChartCard,
  ExecutiveAnalyticsHubNav,
  ExecutivePageHeader,
  MetricCard,
  SectionCard,
} from '@/components/ui/admin-v2'
import {
  isExecutiveRelatoriosView,
  parseExecutiveView,
  type ExecutiveRelatoriosViewId,
  type ExecutiveViewId,
} from '@/lib/navigation/executiveViews'
import { ExecutiveDomainView } from './executive/ExecutiveDomainView'
import type { ExecutiveExtras } from './executive/executiveExtras'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { formatBRL, formatPercent } from '@/lib/format/money'
import { formatDayMonthInLocale, formatDateTimeOrDash } from '@/lib/format/datetime'
import { CHART_COLORS } from '@/lib/tokens/chartColors'
import { ROUTES, adminCatalogoCompletoEditarHref, adminVendaDetalheQuery } from '@/lib/navigation/routes'
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
import { RelatoriosBarChart } from './RelatoriosBarChart'
import { RelatoriosPeriodFilters } from './RelatoriosPeriodFilters'
import type { RelatoriosFiltrosLabels } from './RelatoriosPeriodFilters'
import { PaymentDonutChart } from '@/app/admin/dashboard/_components/PaymentDonutChart'
import { KardexSheet, type KardexAlvo, type KardexLabels } from '@/app/admin/estoque/_components/KardexSheet'
import {
  avisoPeriodoVisivel,
  formatDiasCobertura,
  parseRelatoriosTab,
  RELATORIOS_TAB_IDS,
  sortCoberturaUrgente,
  sortPorDiaAsc,
  sortReposicaoPorDeficit,
  sumFaturamento,
  ticketMedio,
  type RelatoriosTabId,
} from './relatoriosUi'
import { formatarPercentual } from '@/lib/vendas/metricasVendas'

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

function OrigemBadgeRelatorio({
  origem,
  labelChina,
  labelBrasil,
}: {
  origem: string
  labelChina: string
  labelBrasil: string
}) {
  const isChina = String(origem).toLowerCase().includes('china')
  const label = isChina ? labelChina : labelBrasil
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium leading-none ${
        isChina ? 'admin-v2-badge-gold' : 'admin-v2-badge-muted'
      }`}
      title={label}
      aria-label={label}
    >
      {label}
    </span>
  )
}

function TopProdutosList({ top, labels }: { top: RelatorioTopProdDTO[]; labels: RelatoriosLabels }) {
  const max = Math.max(1, ...top.map((item) => item.total_valor))
  if (top.length === 0) return <EmptyState title={labels.vazioProdutos} className="py-8" />
  return (
    <div className="space-y-3">
      {top.slice(0, 8).map((item) => {
        const width = Math.max(6, Math.round((item.total_valor / max) * 100))
        return (
          <Link
            key={item.id}
            href={adminCatalogoCompletoEditarHref(item.id)}
            className="-m-1 block space-y-1 rounded-lg p-1 transition-colors hover:bg-[var(--color-background-secondary)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-small font-medium text-jl-fg-1">{item.nome}</p>
                <OrigemBadgeRelatorio
                  origem={item.origem}
                  labelChina={labels.origemChina}
                  labelBrasil={labels.origemBrasil}
                />
              </div>
              <span className="text-small text-jl-fg-2">{formatBRL(item.total_valor)}</span>
            </div>
            <div
              className="h-2 w-full rounded-full bg-[var(--color-background-tertiary)]"
              role="img"
              aria-label={`${item.nome}: ${formatBRL(item.total_valor)}`}
            >
              <div
                className="h-full rounded-full bg-[var(--color-chart-gold)]"
                style={{ width: `${width}%` }}
              />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function EstoqueReposicaoList({
  baixo,
  labels,
}: {
  baixo: RelatorioEstoqueBaixoDTO[]
  labels: RelatoriosLabels
}) {
  const ordenado = sortReposicaoPorDeficit(baixo).slice(0, 12)
  if (ordenado.length === 0) return <EmptyState title={labels.vazioEstoque} className="py-8" />
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Link href={ROUTES.admin.estoque} className="text-caption font-medium text-[var(--color-info)] underline-offset-2 hover:underline">
          {labels.linkAbrirEstoque}
        </Link>
      </div>
      {ordenado.map((item) => {
        const minZero = Number(item.estoque_minimo) <= 0
        return (
          <Link
            key={item.id}
            href={adminCatalogoCompletoEditarHref(item.id)}
            className="flex items-center justify-between rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-background-secondary)] px-3 py-2 transition-colors hover:border-[var(--color-border)]"
          >
            <div className="min-w-0">
              <p className="truncate text-small font-medium text-jl-fg-1">{item.nome}</p>
              <p className="text-caption text-jl-fg-3">
                {labels.saldoMinTemplate
                  .replace('{{atual}}', String(item.quantidade_atual))
                  .replace('{{min}}', String(item.estoque_minimo))}
                {minZero ? ` · ${labels.minZeroHint}` : ''}
              </p>
            </div>
            <span className="admin-v2-badge-warning shrink-0 rounded-full px-2 py-1 text-caption">
              {labels.reporTemplate.replace('{{n}}', String(item.deficit))}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

function MargemPorVendaList({
  vendas,
  labels,
}: {
  vendas: RelatorioMargemVendaDTO[]
  labels: RelatoriosLabels
}) {
  if (vendas.length === 0) return <EmptyState title={labels.vazioMargemVenda} className="py-8" />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-small">
        <thead>
          <tr className="border-b border-[var(--color-border-secondary)] text-left text-caption text-jl-fg-3">
            <th className="py-1.5 pr-3 font-medium">{labels.margemVendaColData}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{labels.margemVendaColLiquido}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{labels.margemVendaColCusto}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{labels.margemVendaColMargem}</th>
          </tr>
        </thead>
        <tbody>
          {vendas.slice(0, 20).map((v) => (
            <tr key={v.venda_id} className="border-b border-[var(--color-background-tertiary)]">
              <td className="py-1.5 pr-3 text-jl-fg-2">
                <Link href={adminVendaDetalheQuery(v.venda_id)} className="hover:underline">
                  {formatDateTimeOrDash(v.data, labels.locale, 'short')}
                </Link>
              </td>
              <td className="py-1.5 pr-3 text-right text-jl-fg-1">{formatBRL(v.total_liquido)}</td>
              <td className="py-1.5 pr-3 text-right text-jl-fg-2">
                {v.custo_confiavel && v.custo_total_estimado != null
                  ? formatBRL(v.custo_total_estimado)
                  : labels.margemVendaCustoIndisponivel}
              </td>
              <td className="py-1.5 pr-3 text-right font-medium text-jl-fg-1">
                {v.custo_confiavel && v.margem_estimada != null
                  ? formatBRL(v.margem_estimada)
                  : labels.margemVendaCustoIndisponivel}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const CLASSE_ABC_BADGE: Record<'A' | 'B' | 'C', string> = {
  A: 'admin-v2-badge-gold',
  B: 'admin-v2-badge-muted',
  C: 'admin-v2-badge-muted',
}

function CurvaAbcList({
  produtos,
  labels,
}: {
  produtos: RelatorioCurvaAbcDTO[]
  labels: RelatoriosLabels
}) {
  if (produtos.length === 0) return <EmptyState title={labels.vazioCurvaAbc} className="py-8" />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-small">
        <thead>
          <tr className="border-b border-[var(--color-border-secondary)] text-left text-caption text-jl-fg-3">
            <th className="py-1.5 pr-3 font-medium">{labels.curvaAbcColNome}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{labels.curvaAbcColValor}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{labels.curvaAbcColParticipacao}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{labels.curvaAbcColAcumulado}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{labels.curvaAbcColClasse}</th>
          </tr>
        </thead>
        <tbody>
          {produtos.slice(0, 30).map((p) => (
            <tr key={p.produtoId} className="border-b border-[var(--color-background-tertiary)]">
              <td className="max-w-[220px] truncate py-1.5 pr-3 text-jl-fg-1">
                <Link href={adminCatalogoCompletoEditarHref(p.produtoId)} className="hover:underline">
                  {p.nome}
                </Link>
              </td>
              <td className="py-1.5 pr-3 text-right text-jl-fg-2">{formatBRL(p.totalValor)}</td>
              <td className="py-1.5 pr-3 text-right text-jl-fg-2">{formatPercent(p.percentualValor / 100, labels.locale)}</td>
              <td className="py-1.5 pr-3 text-right text-jl-fg-3">{formatPercent(p.percentualAcumulado / 100, labels.locale)}</td>
              <td className="py-1.5 pr-3 text-right">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium leading-none ${CLASSE_ABC_BADGE[p.classeAbc]}`}
                >
                  {p.classeAbc}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CoberturaEstoqueList({
  itens,
  labels,
}: {
  itens: RelatorioCoberturaEstoqueDTO[]
  labels: RelatoriosLabels
}) {
  const comCobertura = sortCoberturaUrgente(itens).slice(0, 15)
  if (comCobertura.length === 0) {
    return <EmptyState title={labels.vazioCoberturaEstoque} className="py-8" />
  }
  return (
    <div className="space-y-2">
      <p className="text-caption italic text-jl-fg-3">{labels.coberturaEstoqueHint}</p>
      {comCobertura.map((i) => (
        <Link
          key={`${i.produtoId}-${i.lojaId}`}
          href={adminCatalogoCompletoEditarHref(i.produtoId)}
          className="flex items-center justify-between rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-background-secondary)] px-3 py-2 transition-colors hover:border-[var(--color-border)]"
        >
          <div className="min-w-0">
            <p className="truncate text-small font-medium text-jl-fg-1">{i.nome}</p>
            <p className="text-caption text-jl-fg-3">
              {labels.coberturaEstoqueColAtual}: {i.quantidadeAtual} ·{' '}
              {labels.coberturaEstoqueColMedia}: {i.mediaDiariaVendida.toFixed(2)}/dia
            </p>
          </div>
          <span className="admin-v2-badge-muted shrink-0 rounded-full px-2 py-1 text-caption">
            {formatDiasCobertura(i.diasCobertura ?? 0, {
              dias: labels.coberturaEstoqueColDias,
              diasCap: labels.coberturaEstoqueDiasCap,
            })}
          </span>
        </Link>
      ))}
    </div>
  )
}

function DivergenciaEstoqueList({
  itens,
  labels,
  onAbrirKardex,
}: {
  itens: RelatorioDivergenciaEstoqueDTO[]
  labels: RelatoriosLabels
  onAbrirKardex: (alvo: KardexAlvo) => void
}) {
  // A view já ordena por |divergência|; aqui só filtramos ruído de arredondamento.
  const comDivergencia = itens.filter((i) => Math.abs(i.divergencia) > 0.001).slice(0, 15)
  if (comDivergencia.length === 0) {
    return <EmptyState title={labels.vazioDivergenciaEstoque} className="py-8" />
  }
  return (
    <div className="space-y-2">
      <p className="text-caption italic text-jl-fg-3">{labels.divergenciaEstoqueHint}</p>
      {comDivergencia.map((i) => (
        <button
          key={`${i.produtoId}-${i.lojaId}`}
          type="button"
          onClick={() => onAbrirKardex({ produtoId: i.produtoId, produtoNome: i.nome })}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-background-secondary)] px-3 py-2 text-left transition-colors hover:border-[var(--color-border)]"
        >
          <div className="min-w-0">
            <p className="truncate text-small font-medium text-jl-fg-1">{i.nome}</p>
            <p className="text-caption text-jl-fg-3">
              {labels.divergenciaEstoqueColSaldo}: {i.saldoEstoque} ·{' '}
              {labels.divergenciaEstoqueColMovimentos}: {i.somaMovimentos}
            </p>
          </div>
          <span className="admin-v2-badge-muted shrink-0 rounded-full px-2 py-1 text-caption font-semibold tabular-nums">
            {i.divergencia > 0 ? '+' : ''}
            {i.divergencia}
          </span>
        </button>
      ))}
    </div>
  )
}

function SemGiroList({
  itens,
  labels,
}: {
  itens: RelatorioSemGiroDTO[]
  labels: RelatoriosLabels
}) {
  if (itens.length === 0) return <EmptyState title={labels.vazioSemGiro} className="py-8" />
  return (
    <div className="space-y-2">
      <p className="text-caption italic text-jl-fg-3">{labels.semGiroHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="border-b border-[var(--color-border-secondary)] text-left text-caption text-jl-fg-3">
              <th className="py-1.5 pr-3 font-medium">{labels.curvaAbcColNome}</th>
              <th className="py-1.5 pr-3 text-right font-medium">{labels.semGiroColSaldo}</th>
              <th className="py-1.5 pr-3 text-right font-medium">{labels.semGiroColValor}</th>
              <th className="py-1.5 pr-3 font-medium">{labels.semGiroColUltimaVenda}</th>
            </tr>
          </thead>
          <tbody>
            {itens.slice(0, 30).map((p) => (
              <tr key={p.produto_id} className="border-b border-[var(--color-background-tertiary)]">
                <td className="max-w-[220px] truncate py-1.5 pr-3 text-jl-fg-1">
                  <Link href={adminCatalogoCompletoEditarHref(p.produto_id)} className="hover:underline">
                    {p.nome}
                  </Link>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-jl-fg-2">{p.quantidade_atual}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-jl-fg-1">
                  {formatBRL(p.valor_imobilizado)}
                </td>
                <td className="py-1.5 pr-3 text-jl-fg-3">
                  {p.ultima_venda ? formatDateTimeOrDash(p.ultima_venda, labels.locale, 'short') : labels.semGiroNuncaVendeu}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VendasDetalheList({
  vendas,
  labels,
}: {
  vendas: VendaReportRow[]
  labels: RelatoriosLabels
}) {
  if (vendas.length === 0) return <EmptyState title={labels.vazioVendasDetalhe} className="py-8" />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-small">
        <thead>
          <tr className="border-b border-[var(--color-border-secondary)] text-left text-caption text-jl-fg-3">
            <th className="py-1.5 pr-3 font-medium">{labels.vendasColData}</th>
            <th className="py-1.5 pr-3 font-medium">{labels.vendasColCliente}</th>
            <th className="py-1.5 pr-3 font-medium">{labels.vendasColVendedor}</th>
            <th className="py-1.5 pr-3 font-medium">{labels.vendasColForma}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{labels.vendasColValor}</th>
            <th className="py-1.5 pr-3 font-medium">{labels.vendasColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {vendas.slice(0, 100).map((v) => (
            <tr key={v.id} className="border-b border-[var(--color-background-tertiary)]">
              <td className="py-1.5 pr-3 text-jl-fg-2">
                <Link href={adminVendaDetalheQuery(v.id)} className="hover:underline">
                  {v.data ? formatDateTimeOrDash(v.data, labels.locale, 'short') : '—'}
                </Link>
              </td>
              <td className="max-w-[180px] truncate py-1.5 pr-3 text-jl-fg-1">
                {v.cliente_nome ?? labels.vendasSemCliente}
              </td>
              <td className="max-w-[160px] truncate py-1.5 pr-3 text-jl-fg-2">{v.vendedor_nome ?? '—'}</td>
              <td className="py-1.5 pr-3 text-jl-fg-2">{v.forma_pagamento ?? '—'}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-jl-fg-1">{formatBRL(v.total_liquido)}</td>
              <td className="py-1.5 pr-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium leading-none ${
                    v.status === 'CANCELADA' ? 'admin-v2-badge-muted' : 'admin-v2-badge-gold'
                  }`}
                >
                  {v.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RelatoriosTabs({
  active,
  labels,
  onChange,
}: {
  active: RelatoriosTabId
  labels: RelatoriosLabels
  onChange: (tab: RelatoriosTabId) => void
}) {
  const tabLabels: Record<RelatoriosTabId, string> = {
    visao: labels.tabVisao,
    produtos: labels.tabProdutos,
    estoque: labels.tabEstoque,
    margem: labels.tabMargem,
    vendas: labels.tabVendas,
  }
  return (
    <div
      className="admin-v2-segmented admin-v2-print-hide flex flex-wrap gap-1"
      role="tablist"
      aria-label={labels.tabsAria}
    >
      {RELATORIOS_TAB_IDS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`relatorios-tab-${tab}`}
          aria-selected={active === tab}
          aria-controls={`relatorios-panel-${tab}`}
          data-active={active === tab}
          className="admin-v2-filter-pill rounded-full px-3 py-1.5 text-caption font-medium transition-colors"
          onClick={() => onChange(tab)}
        >
          {tabLabels[tab]}
        </button>
      ))}
    </div>
  )
}

function chartLabelFromYmd(ymd: string, locale: string): string {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  return formatDayMonthInLocale(new Date(y, m - 1, d), locale)
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
  initialTab,
  initialView,
  executiveExtras,
}: {
  dados: RelatoriosDados
  labels: RelatoriosLabels
  initialTab?: string
  /** Aba executiva via `?view=` (hub analytics). */
  initialView?: string
  /** Dados extras (caixas / financeiro) para abas Fase 2. */
  executiveExtras?: ExecutiveExtras
}) {
  const router = useRouter()
  const [tab, setTab] = useState<RelatoriosTabId>(() => parseRelatoriosTab(initialTab))
  const [kardexAlvo, setKardexAlvo] = useState<KardexAlvo | null>(null)
  const executiveView: ExecutiveViewId = parseExecutiveView(initialView)
  const activeExecView = isExecutiveRelatoriosView(executiveView) ? executiveView : null

  useEffect(() => {
    setTab(parseRelatoriosTab(initialTab))
  }, [initialTab])

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
  const faturamento = useMemo(() => sumFaturamento(porDiaOrdenado), [porDiaOrdenado])
  const ticket = ticketMedio(faturamento, dados.resumoExecutivo.vendas_concluidas)
  const margemValor =
    dados.resumoExecutivo.custo_confiavel && dados.resumoExecutivo.margem_bruta_estimada != null
      ? formatBRL(dados.resumoExecutivo.margem_bruta_estimada)
      : labels.kpiMargemIndisponivel

  const chartData = porDiaOrdenado.map((r) => ({
    label: chartLabelFromYmd(r.dia, labels.locale),
    total: r.total_liquido,
  }))

  const statusTotal =
    dados.resumoExecutivo.vendas_concluidas + dados.resumoExecutivo.vendas_canceladas

  function selectTab(next: RelatoriosTabId) {
    setTab(next)
    const q = new URLSearchParams({
      de: dados.periodo.de,
      ate: dados.periodo.ate,
    })
    if (next !== 'visao') q.set('tab', next)
    if (activeExecView) q.set('view', activeExecView)
    router.replace(`${ROUTES.admin.relatorios}?${q.toString()}`, { scroll: false })
  }

  const pageTitle = activeExecView ? EXEC_VIEW_TITLE[activeExecView] : labels.titulo

  return (
    <div className="admin-v2-page" data-executive-view={activeExecView ?? 'legado'}>
      <ExecutivePageHeader
        title={pageTitle}
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

      <Suspense fallback={null}>
        <ExecutiveAnalyticsHubNav activeView={activeExecView ?? undefined} />
      </Suspense>

      {dados.rpcErro ? (
        <ErrorState title={labels.erroTitulo} description={dados.rpcErro} dense className="mb-6" />
      ) : null}

      <div className="admin-v2-stack">
        <RelatoriosPeriodFilters
          de={dados.periodo.de}
          ate={dados.periodo.ate}
          tab={tab}
          view={activeExecView ?? undefined}
          csvRows={porDiaOrdenado.map((row) => ({
            dia: row.dia,
            vendas: row.num_vendas,
            faturado: row.total_liquido,
            ticket_medio: row.ticket_medio,
            desconto: row.total_desconto,
          }))}
          labels={labels.filtros}
        />

        {activeExecView ? (
          <ExecutiveDomainView
            view={activeExecView}
            dados={dados}
            extras={executiveExtras}
            locale={labels.locale}
          />
        ) : null}

        {!activeExecView && !dados.resumoExecutivo.custo_confiavel ? (
          <p role="status" className="admin-v2-alert-warning rounded-lg px-3 py-2 text-caption">
            {labels.custoNaoConfiavel}
          </p>
        ) : null}

        {!activeExecView ? (
        <div className="admin-v2-grid-kpi">
          <MetricCard
            label={labels.kpiFaturamento}
            value={formatBRL(faturamento)}
            icon="dollar-sign"
            sparkData={porDiaOrdenado.map((r) => r.total_liquido)}
            hint={
              (dados.devolucoes ?? 0) > 0
                ? `${labels.kpiDevolucoes} ${formatBRL(dados.devolucoes ?? 0)} · ${labels.kpiReceitaLiquida} ${formatBRL(dados.receitaLiquida ?? 0)}`
                : undefined
            }
          />
          <MetricCard
            label={labels.kpiTicket}
            value={ticket == null ? '—' : formatBRL(ticket)}
            icon="wallet-cards"
          />
          <MetricCard
            label={labels.kpiVendas}
            value={String(dados.resumoExecutivo.vendas_concluidas)}
            icon="shopping-bag"
            hint={`${labels.kpiCancelamento}: ${formatarPercentual(dados.resumoExecutivo.taxa_cancelamento, labels.locale)}`}
          />
          <MetricCard
            label={labels.kpiMargem}
            value={margemValor}
            icon="file-check-2"
            tone={dados.resumoExecutivo.custo_confiavel ? 'gold' : 'danger'}
            hint={dados.resumoExecutivo.custo_confiavel ? undefined : labels.custoNaoConfiavel}
          />
        </div>
        ) : null}

        {!activeExecView ? (
        <RelatoriosTabs active={tab} labels={labels} onChange={selectTab} />
        ) : null}

        {!activeExecView && tab === 'visao' ? (
          <div
            id="relatorios-panel-visao"
            role="tabpanel"
            aria-labelledby="relatorios-tab-visao"
            className="admin-v2-grid-2"
          >
            <ChartCard title={labels.chartFaturamento}>
              {chartData.length === 0 ? (
                <EmptyState title={labels.noDataLabel} className="py-8" />
              ) : (
                <RelatoriosBarChart data={chartData} tooltipLabel={labels.tooltipFaturado} />
              )}
            </ChartCard>
            <ChartCard title={labels.chartStatusVendas}>
              {statusTotal <= 0 ? (
                <EmptyState title={labels.noDataLabel} className="py-8" />
              ) : (
                <PaymentDonutChart
                  slices={[
                    {
                      label: labels.labelConcluidas,
                      value: dados.resumoExecutivo.vendas_concluidas,
                      color: CHART_COLORS[0],
                    },
                    {
                      label: labels.labelCanceladas,
                      value: dados.resumoExecutivo.vendas_canceladas,
                      color: CHART_COLORS[3],
                    },
                  ]}
                />
              )}
            </ChartCard>
          </div>
        ) : null}

        {!activeExecView && tab === 'produtos' ? (
          <div id="relatorios-panel-produtos" role="tabpanel" aria-labelledby="relatorios-tab-produtos">
            <SectionCard title={labels.secTopProdutos}>
              <TopProdutosList top={dados.top} labels={labels} />
            </SectionCard>
          </div>
        ) : null}

        {!activeExecView && tab === 'estoque' ? (
          <div
            id="relatorios-panel-estoque"
            role="tabpanel"
            aria-labelledby="relatorios-tab-estoque"
            className="admin-v2-stack"
          >
            <SectionCard title={labels.secEstoqueReposicao}>
              <EstoqueReposicaoList baixo={dados.baixo} labels={labels} />
            </SectionCard>
            <SectionCard title={labels.secCoberturaEstoque}>
              <CoberturaEstoqueList itens={dados.coberturaEstoque} labels={labels} />
            </SectionCard>
            <SectionCard title={labels.secDivergenciaEstoque}>
              <DivergenciaEstoqueList
                itens={dados.divergenciaEstoque}
                labels={labels}
                onAbrirKardex={setKardexAlvo}
              />
            </SectionCard>
            <SectionCard title={labels.secSemGiro}>
              <SemGiroList itens={dados.semGiro} labels={labels} />
            </SectionCard>
          </div>
        ) : null}

        {!activeExecView && tab === 'vendas' ? (
          <div id="relatorios-panel-vendas" role="tabpanel" aria-labelledby="relatorios-tab-vendas">
            <SectionCard title={labels.secVendasDetalhe}>
              {dados.vendasDetalheErro ? (
                <ErrorState
                  title={labels.erroTitulo}
                  description={dados.vendasDetalheErro}
                  dense
                />
              ) : (
                <VendasDetalheList vendas={dados.vendasDetalhe} labels={labels} />
              )}
            </SectionCard>
          </div>
        ) : null}

        {!activeExecView && tab === 'margem' ? (
          <div
            id="relatorios-panel-margem"
            role="tabpanel"
            aria-labelledby="relatorios-tab-margem"
            className="admin-v2-grid-2"
          >
            <SectionCard title={labels.secMargemPorVenda}>
              <MargemPorVendaList vendas={dados.margemPorVenda} labels={labels} />
            </SectionCard>
            <SectionCard title={labels.secCurvaAbc}>
              <CurvaAbcList produtos={dados.curvaAbc} labels={labels} />
            </SectionCard>
          </div>
        ) : null}
      </div>

      <KardexSheet alvo={kardexAlvo} onClose={() => setKardexAlvo(null)} labels={labels.kardex} />
    </div>
  )
}
