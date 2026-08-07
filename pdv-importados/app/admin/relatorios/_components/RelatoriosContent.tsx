'use client'

/**
 * RelatoriosContent — Sprint 4 / RFC-UX-017
 * TabNav por domínio + EmptyState DS + donut honesto (sem fatia fabricada).
 */

import { ChartCard, SectionCard, TabNav } from '@/components/ui/admin-v2'
import { EmptyState } from '@/components/ui/feedback'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { formatBRL } from '@/lib/format/money'
import { formatDayMonthInLocale, formatDateTimeOrDash } from '@/lib/format/datetime'
import type {
  RelatorioVendaDiaDTO,
  RelatorioTopProdDTO,
  RelatorioEstoqueBaixoDTO,
  RelatorioResumoExecutivoDTO,
  RelatorioMargemVendaDTO,
  RelatorioCurvaAbcDTO,
  RelatorioCoberturaEstoqueDTO,
} from '@/app/gerente/relatorios/actions'
import type { PeriodoRelatorioResolvido } from '@/lib/relatorios/periodoRelatorio'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { BarChart3, Package, TrendingUp } from 'lucide-react'
import { RelatoriosBarChart } from './RelatoriosBarChart'
import { PaymentDonutChart } from '@/app/admin/dashboard/_components/PaymentDonutChart'

export type RelatoriosSecao = 'vendas' | 'estoque' | 'margem'

export type RelatoriosDados = {
  periodo: PeriodoRelatorioResolvido
  resumoExecutivo: RelatorioResumoExecutivoDTO
  porDia: RelatorioVendaDiaDTO[]
  top: RelatorioTopProdDTO[]
  baixo: RelatorioEstoqueBaixoDTO[]
  margemPorVenda: RelatorioMargemVendaDTO[]
  curvaAbc: RelatorioCurvaAbcDTO[]
  coberturaEstoque: RelatorioCoberturaEstoqueDTO[]
  rpcErro: string | null
}

export type RelatoriosLabels = {
  titulo: string
  periodoLabel: string
  aSeparator: string
  custoNaoConfiavel: string
  chartFaturamento: string
  chartStatusVendas: string
  labelConcluidas: string
  labelCanceladas: string
  secTopProdutos: string
  secEstoqueReposicao: string
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
  curvaAbcColAcumulado: string
  curvaAbcColClasse: string
  vazioCurvaAbc: string
  secCoberturaEstoque: string
  coberturaEstoqueHint: string
  coberturaEstoqueColAtual: string
  coberturaEstoqueColMedia: string
  coberturaEstoqueColDias: string
  vazioCoberturaEstoque: string
  origemChina: string
  origemBrasil: string
  vazioProdutos: string
  saldoMinTemplate: string
  reporTemplate: string
  vazioEstoque: string
  tooltipFaturado: string
  vazioStatus: string
  tabVendas: string
  tabEstoque: string
  tabMargem: string
  locale: string
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
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none ${
        isChina ? 'admin-v2-badge-gold' : 'admin-v2-badge-muted'
      }`}
    >
      {isChina ? labelChina : labelBrasil}
    </span>
  )
}

function TopProdutosList({ top, labels }: { top: RelatorioTopProdDTO[]; labels: RelatoriosLabels }) {
  const max = Math.max(1, ...top.map((item) => item.total_valor))
  if (top.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-6 w-6" aria-hidden />}
        title={labels.vazioProdutos}
      />
    )
  }
  return (
    <div className="space-y-3">
      {top.slice(0, 8).map((item) => {
        const width = Math.max(6, Math.round((item.total_valor / max) * 100))
        return (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-jl-fg-1">{item.nome}</p>
                <OrigemBadgeRelatorio
                  origem={item.origem}
                  labelChina={labels.origemChina}
                  labelBrasil={labels.origemBrasil}
                />
              </div>
              <span className="text-xs text-jl-fg-2">{formatBRL(item.total_valor)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--color-background-tertiary)]">
              <div className="h-full rounded-full bg-[var(--color-chart-gold)]" style={{ width: `${width}%` }} />
            </div>
          </div>
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
  if (baixo.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6" aria-hidden />}
        title={labels.vazioEstoque}
      />
    )
  }
  return (
    <div className="space-y-2">
      {baixo.slice(0, 12).map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-background-secondary)] px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-jl-fg-1">{item.nome}</p>
            <p className="text-[11px] text-jl-fg-3">
              {labels.saldoMinTemplate
                .replace('{{atual}}', String(item.quantidade_atual))
                .replace('{{min}}', String(item.estoque_minimo))}
            </p>
          </div>
          <span className="admin-v2-badge-warning rounded-full px-2 py-1 text-[11px]">
            {labels.reporTemplate.replace('{{n}}', String(item.deficit))}
          </span>
        </div>
      ))}
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
  if (vendas.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-6 w-6" aria-hidden />}
        title={labels.vazioMargemVenda}
      />
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--color-border-secondary)] text-left text-[11px] text-jl-fg-3">
            <th className="py-1.5 pr-3 font-medium">{labels.margemVendaColData}</th>
            <th className="py-1.5 pr-3 font-medium text-right">{labels.margemVendaColLiquido}</th>
            <th className="py-1.5 pr-3 font-medium text-right">{labels.margemVendaColCusto}</th>
            <th className="py-1.5 pr-3 font-medium text-right">{labels.margemVendaColMargem}</th>
          </tr>
        </thead>
        <tbody>
          {vendas.slice(0, 20).map((v) => (
            <tr key={v.venda_id} className="border-b border-[var(--color-background-tertiary)]">
              <td className="py-1.5 pr-3 text-jl-fg-2">
                {formatDateTimeOrDash(v.data, labels.locale, 'short')}
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
  if (produtos.length === 0) {
    return <EmptyState title={labels.vazioCurvaAbc} />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--color-border-secondary)] text-left text-[11px] text-jl-fg-3">
            <th className="py-1.5 pr-3 font-medium">{labels.curvaAbcColNome}</th>
            <th className="py-1.5 pr-3 font-medium text-right">{labels.curvaAbcColValor}</th>
            <th className="py-1.5 pr-3 font-medium text-right">{labels.curvaAbcColAcumulado}</th>
            <th className="py-1.5 pr-3 font-medium text-right">{labels.curvaAbcColClasse}</th>
          </tr>
        </thead>
        <tbody>
          {produtos.slice(0, 30).map((p) => (
            <tr key={p.produtoId} className="border-b border-[var(--color-background-tertiary)]">
              <td className="max-w-[220px] truncate py-1.5 pr-3 text-jl-fg-1">{p.nome}</td>
              <td className="py-1.5 pr-3 text-right text-jl-fg-2">{formatBRL(p.totalValor)}</td>
              <td className="py-1.5 pr-3 text-right text-jl-fg-3">{p.percentualAcumulado.toFixed(1)}%</td>
              <td className="py-1.5 pr-3 text-right">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none ${CLASSE_ABC_BADGE[p.classeAbc]}`}
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
  const comCobertura = itens.filter((i) => i.diasCobertura != null).slice(0, 15)
  if (comCobertura.length === 0) {
    return <EmptyState title={labels.vazioCoberturaEstoque} />
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] italic text-jl-fg-3">{labels.coberturaEstoqueHint}</p>
      {comCobertura.map((i) => (
        <div
          key={`${i.produtoId}-${i.lojaId}`}
          className="flex items-center justify-between rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-background-secondary)] px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-jl-fg-1">{i.nome}</p>
            <p className="text-[11px] text-jl-fg-3">
              {labels.coberturaEstoqueColAtual}: {i.quantidadeAtual} ·{' '}
              {labels.coberturaEstoqueColMedia}: {i.mediaDiariaVendida.toFixed(2)}/dia
            </p>
          </div>
          <span className="admin-v2-badge-muted shrink-0 rounded-full px-2 py-1 text-[11px]">
            ~{Math.round(i.diasCobertura ?? 0)} {labels.coberturaEstoqueColDias}
          </span>
        </div>
      ))}
    </div>
  )
}

function StatusVendasDonut({
  resumo,
  labels,
}: {
  resumo: RelatorioResumoExecutivoDTO
  labels: RelatoriosLabels
}) {
  const slices = [
    { label: labels.labelConcluidas, value: resumo.vendas_concluidas, color: '#c9a227' },
    { label: labels.labelCanceladas, value: resumo.vendas_canceladas, color: '#f59e0b' },
  ].filter((s) => s.value > 0)

  if (slices.length === 0) {
    return <EmptyState title={labels.vazioStatus} />
  }
  return <PaymentDonutChart slices={slices} />
}

function secHref(sec: RelatoriosSecao, de: string, ate: string): string {
  const p = new URLSearchParams()
  p.set('sec', sec)
  if (de) p.set('de', de)
  if (ate) p.set('ate', ate)
  return pathWithQuery(ROUTES.admin.relatorios, p)
}

export function RelatoriosContent({
  dados,
  labels,
  secao,
}: {
  dados: RelatoriosDados
  labels: RelatoriosLabels
  secao: RelatoriosSecao
}) {
  const { de, ate } = dados.periodo

  return (
    <div className="admin-v2-stack">
      {dados.rpcErro ? (
        <InlineAlert tone="danger">{dados.rpcErro}</InlineAlert>
      ) : null}

      {!dados.resumoExecutivo.custo_confiavel ? (
        <InlineAlert tone="warning">{labels.custoNaoConfiavel}</InlineAlert>
      ) : null}

      <TabNav
        aria-label={labels.titulo}
        value={secao}
        items={[
          { id: 'vendas', label: labels.tabVendas, href: secHref('vendas', de, ate) },
          { id: 'estoque', label: labels.tabEstoque, href: secHref('estoque', de, ate) },
          { id: 'margem', label: labels.tabMargem, href: secHref('margem', de, ate) },
        ]}
      />

      {secao === 'vendas' ? (
        <>
          <div className="admin-v2-grid-2">
            <ChartCard title={labels.chartFaturamento}>
              <RelatoriosBarChart
                data={dados.porDia.map((r: RelatorioVendaDiaDTO) => ({
                  label: formatDayMonthInLocale(new Date(r.dia), labels.locale),
                  total: r.total_liquido,
                }))}
                tooltipLabel={labels.tooltipFaturado}
              />
            </ChartCard>
            <ChartCard title={labels.chartStatusVendas}>
              <StatusVendasDonut resumo={dados.resumoExecutivo} labels={labels} />
            </ChartCard>
          </div>
          <SectionCard title={labels.secTopProdutos}>
            <TopProdutosList top={dados.top} labels={labels} />
          </SectionCard>
        </>
      ) : null}

      {secao === 'estoque' ? (
        <div className="admin-v2-grid-2">
          <SectionCard title={labels.secEstoqueReposicao}>
            <EstoqueReposicaoList baixo={dados.baixo} labels={labels} />
          </SectionCard>
          <SectionCard title={labels.secCoberturaEstoque}>
            <CoberturaEstoqueList itens={dados.coberturaEstoque} labels={labels} />
          </SectionCard>
        </div>
      ) : null}

      {secao === 'margem' ? (
        <div className="admin-v2-grid-2">
          <SectionCard title={labels.secMargemPorVenda}>
            <MargemPorVendaList vendas={dados.margemPorVenda} labels={labels} />
          </SectionCard>
          <SectionCard title={labels.secCurvaAbc}>
            <CurvaAbcList produtos={dados.curvaAbc} labels={labels} />
          </SectionCard>
        </div>
      ) : null}
    </div>
  )
}
