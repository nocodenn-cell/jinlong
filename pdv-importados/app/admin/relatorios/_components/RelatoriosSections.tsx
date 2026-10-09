'use client'

/**
 * Seções de relatório compartilhadas entre as abas clássicas e as views executivas.
 * Extraídas de RelatoriosContent (UX-IA-01, migração D1/D2): mesma renderização,
 * mesmos rótulos, mesmos dados — só deixaram de ser privadas do componente clássico.
 */

import Link from 'next/link'
import { ChartCard, MetricCard } from '@/components/ui/admin-v2'
import { EmptyState } from '@/components/ui/feedback'
import { formatBRL } from '@/lib/format/money'
import { formatDayMonthInLocale, formatDateTimeOrDash } from '@/lib/format/datetime'
import { CHART_COLORS } from '@/lib/tokens/chartColors'
import { adminCatalogoCompletoEditarHref, adminVendaDetalheQuery } from '@/lib/navigation/routes'
import type {
  RelatorioDivergenciaEstoqueDTO,
  RelatorioMargemVendaDTO,
  RelatorioResumoExecutivoDTO,
  RelatorioTopProdDTO,
} from '@/app/gerente/relatorios/actions'
import { PaymentDonutChart } from '@/app/admin/dashboard/_components/PaymentDonutChart'
import type { KardexAlvo } from '@/app/admin/estoque/_components/KardexSheet'
import { RelatoriosBarChart } from './RelatoriosBarChart'
import type { RelatoriosLabels } from './RelatoriosContent'

export function OrigemBadgeRelatorio({
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

export function TopProdutosList({ top, labels }: { top: RelatorioTopProdDTO[]; labels: RelatoriosLabels }) {
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

export function MargemPorVendaList({
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

export function DivergenciaEstoqueList({
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

export function chartLabelFromYmd(ymd: string, locale: string): string {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  return formatDayMonthInLocale(new Date(y, m - 1, d), locale)
}


/** Gráfico "Faturamento por dia" (aba Visão clássica; agora também em Vendas & Caixas). */
export function FaturamentoPorDiaCard({
  porDiaOrdenado,
  labels,
}: {
  porDiaOrdenado: ReadonlyArray<{ dia: string; total_liquido: number }>
  labels: RelatoriosLabels
}) {
  const chartData = porDiaOrdenado.map((r) => ({
    label: chartLabelFromYmd(r.dia, labels.locale),
    total: r.total_liquido,
  }))
  return (
    <ChartCard title={labels.chartFaturamento}>
      {chartData.length === 0 ? (
        <EmptyState title={labels.noDataLabel} className="py-8" />
      ) : (
        <RelatoriosBarChart data={chartData} tooltipLabel={labels.tooltipFaturado} />
      )}
    </ChartCard>
  )
}

/** Gráfico "Status das vendas" (concluídas × canceladas). */
export function StatusVendasCard({
  resumo,
  labels,
}: {
  resumo: Pick<RelatorioResumoExecutivoDTO, 'vendas_concluidas' | 'vendas_canceladas'>
  labels: RelatoriosLabels
}) {
  const total = resumo.vendas_concluidas + resumo.vendas_canceladas
  return (
    <ChartCard title={labels.chartStatusVendas}>
      {total <= 0 ? (
        <EmptyState title={labels.noDataLabel} className="py-8" />
      ) : (
        <PaymentDonutChart
          slices={[
            { label: labels.labelConcluidas, value: resumo.vendas_concluidas, color: CHART_COLORS[0] },
            { label: labels.labelCanceladas, value: resumo.vendas_canceladas, color: CHART_COLORS[3] },
          ]}
        />
      )}
    </ChartCard>
  )
}

/** KPI "Ticket médio" (era só do clássico). `—` quando não há venda concluída. */
export function TicketMedioKpi({ ticket, labels }: { ticket: number | null; labels: RelatoriosLabels }) {
  return (
    <MetricCard
      label={labels.kpiTicket}
      value={ticket == null ? '—' : formatBRL(ticket)}
      icon="wallet-cards"
    />
  )
}
