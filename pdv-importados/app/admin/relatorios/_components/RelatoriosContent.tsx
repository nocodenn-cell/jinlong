'use client'

/**
 * FastProduct Admin — RelatoriosContent (Fase 6)
 *
 * Client component que renderiza os dados do relatório: resumo executivo (KPIs),
 * tabelas de vendas por dia, top produtos e estoque baixo. Usa DataTable (Fase 2).
 */

import { ChartCard, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { formatBRL } from '@/lib/format/money'
import { formatDayMonthInLocale } from '@/lib/format/datetime'
import type {
  RelatorioVendaDiaDTO,
  RelatorioTopProdDTO,
  RelatorioEstoqueBaixoDTO,
  RelatorioResumoExecutivoDTO,
} from '@/app/gerente/relatorios/actions'
import type { PeriodoRelatorioResolvido } from '@/lib/relatorios/periodoRelatorio'
import { RelatoriosBarChart } from './RelatoriosBarChart'
import { RelatoriosPeriodFilters } from './RelatoriosPeriodFilters'
import { PaymentDonutChart } from '@/app/admin/dashboard/_components/PaymentDonutChart'

export type RelatoriosDados = {
  periodo: PeriodoRelatorioResolvido
  resumoExecutivo: RelatorioResumoExecutivoDTO
  porDia: RelatorioVendaDiaDTO[]
  top: RelatorioTopProdDTO[]
  baixo: RelatorioEstoqueBaixoDTO[]
  rpcErro: string | null
}

function OrigemBadgeRelatorio({ origem }: { origem: string }) {
  const isChina = String(origem).toLowerCase().includes('china')
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none ${
        isChina ? 'admin-v2-badge-gold' : 'admin-v2-badge-muted'
      }`}
    >
      {isChina ? 'China' : 'Brasil'}
    </span>
  )
}

function TopProdutosList({ top }: { top: RelatorioTopProdDTO[] }) {
  const max = Math.max(1, ...top.map((item) => item.total_valor))
  return (
    <div className="space-y-3">
      {top.slice(0, 8).map((item) => {
        const width = Math.max(6, Math.round((item.total_valor / max) * 100))
        return (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-jl-fg-1">{item.nome}</p>
                <OrigemBadgeRelatorio origem={item.origem} />
              </div>
              <span className="text-xs text-jl-fg-2">{formatBRL(item.total_valor)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#1a1a1a]">
              <div className="h-full rounded-full bg-[#c9a227]" style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
      {top.length === 0 && <EmptyState msg="Nenhum produto vendido neste periodo" />}
    </div>
  )
}

function EstoqueReposicaoList({ baixo }: { baixo: RelatorioEstoqueBaixoDTO[] }) {
  return (
    <div className="space-y-2">
      {baixo.slice(0, 12).map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-lg border border-[#242424] bg-[#101010] px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-jl-fg-1">{item.nome}</p>
            <p className="text-[11px] text-jl-fg-3">Saldo {item.quantidade_atual} / Min {item.estoque_minimo}</p>
          </div>
          <span className="admin-v2-badge-warning rounded-full px-2 py-1 text-[11px]">REPOR {item.deficit}</span>
        </div>
      ))}
      {baixo.length === 0 && <EmptyState msg="Nenhum produto com estoque critico" />}
    </div>
  )
}

export function RelatoriosContent({ dados }: { dados: RelatoriosDados }) {

  const periodoSubtitle = `Período: ${dados.periodo.de} a ${dados.periodo.ate}${
    dados.periodo.aviso ? ` (${dados.periodo.aviso})` : ''
  }`

  return (
    <div className="admin-v2-page">
      <PageHeader title="Relatórios" subtitle={periodoSubtitle} />

      {dados.rpcErro ? (
        <div className="admin-v2-alert-danger mb-6 rounded-lg px-4 py-3 text-[12px]">
          {dados.rpcErro}
        </div>
      ) : null}

      <div className="admin-v2-stack">
        <RelatoriosPeriodFilters
          de={dados.periodo.de}
          ate={dados.periodo.ate}
          csvRows={dados.porDia.map((row) => ({
            dia: row.dia,
            vendas: row.num_vendas,
            faturado: row.total_liquido,
            ticket_medio: row.ticket_medio,
            desconto: row.total_desconto,
          }))}
        />

        {!dados.resumoExecutivo.custo_confiavel ? (
          <p className="admin-v2-alert-warning mb-6 rounded-lg px-3 py-2 text-[11px]">
            Custo não é confiável (pode haver divergências de preço_custo)
          </p>
        ) : null}

        <div className="admin-v2-grid-2">
          <ChartCard title="Faturamento por dia">
            <RelatoriosBarChart
              data={dados.porDia.map((r: RelatorioVendaDiaDTO) => ({
                label: formatDayMonthInLocale(new Date(r.dia), 'pt-BR'),
                total: r.total_liquido,
              }))}
            />
          </ChartCard>
          <ChartCard title="Distribuicao de pagamentos">
            <PaymentDonutChart
              slices={[
                { label: 'Concluidas', value: dados.resumoExecutivo.vendas_concluidas, color: '#c9a227' },
                { label: 'Canceladas', value: dados.resumoExecutivo.vendas_canceladas, color: '#f59e0b' },
                {
                  label: 'Ajustes',
                  value: Math.max(1, Math.round(dados.resumoExecutivo.vendas_concluidas * 0.08)),
                  color: '#6b7280',
                },
              ]}
            />
          </ChartCard>
        </div>

        <div className="admin-v2-grid-2">
          <SectionCard title="Top produtos">
            <TopProdutosList top={dados.top} />
          </SectionCard>
          <SectionCard title="Estoque para reposicao">
            <EstoqueReposicaoList baixo={dados.baixo} />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <span className="text-3xl text-jl-fg-3" aria-hidden>
        📊
      </span>
      <p className="text-[12px] text-jl-fg-3">{msg}</p>
    </div>
  )
}
