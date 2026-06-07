'use client'

/**
 * FastProduct Admin — RelatoriosContent (Fase 6)
 *
 * Client component que renderiza os dados do relatório: resumo executivo (KPIs),
 * tabelas de vendas por dia, top produtos e estoque baixo. Usa DataTable (Fase 2).
 */

import { MetricCard, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import { formatDayMonthInLocale } from '@/lib/format/datetime'
import type { RelatorioVendaDiaDTO, RelatorioTopProdDTO, RelatorioEstoqueBaixoDTO, RelatorioResumoExecutivoDTO } from '@/app/gerente/relatorios/actions'
import type { PeriodoRelatorioResolvido } from '@/lib/relatorios/periodoRelatorio'

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

export function RelatoriosContent({ dados }: { dados: RelatoriosDados }) {
  const vendaPorDiaColumns: Column<RelatorioVendaDiaDTO>[] = [
    {
      key: 'dia',
      header: 'Dia',
      sortValue: (r) => r.dia,
      cell: (r) => {
        try {
          const d = new Date(r.dia)
          return <span className="text-[12px] text-jl-fg-2">{formatDayMonthInLocale(d, 'pt-BR')}</span>
        } catch {
          return <span className="text-[12px] text-jl-fg-2">{r.dia}</span>
        }
      },
    },
    {
      key: 'vendas',
      header: 'Vendas',
      align: 'right',
      sortValue: (r) => r.num_vendas,
      cell: (r) => <span className="text-[12px] text-jl-fg-1">{r.num_vendas}</span>,
    },
    {
      key: 'faturado',
      header: 'Faturado',
      align: 'right',
      sortValue: (r) => r.total_liquido,
      cell: (r) => <span className="text-[12px] font-medium text-jl-fg-1">{formatBRL(r.total_liquido)}</span>,
    },
    {
      key: 'ticket',
      header: 'Ticket médio',
      align: 'right',
      sortValue: (r) => r.ticket_medio,
      cell: (r) => <span className="text-[12px] text-jl-fg-2">{formatBRL(r.ticket_medio)}</span>,
    },
    {
      key: 'desconto',
      header: 'Desconto',
      align: 'right',
      sortValue: (r) => r.total_desconto,
      cell: (r) =>
        r.total_desconto > 0 ? (
          <span className="text-[12px] text-amber-400">{formatBRL(r.total_desconto)}</span>
        ) : (
          <span className="text-[12px] text-jl-fg-3">—</span>
        ),
    },
  ]

  const topProdColumns: Column<RelatorioTopProdDTO>[] = [
    {
      key: 'produto',
      header: 'Produto',
      sortValue: (r) => r.nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-[12px] font-medium text-jl-fg-1">{r.nome}</p>
        </div>
      ),
    },
    {
      key: 'origem',
      header: 'Origem',
      cell: (r) => <OrigemBadgeRelatorio origem={r.origem} />,
    },
    {
      key: 'qtd',
      header: 'Qtd',
      align: 'right',
      sortValue: (r) => r.total_quantidade,
      cell: (r) => <span className="text-[12px] text-jl-fg-1">{r.total_quantidade}</span>,
    },
    {
      key: 'valor',
      header: 'Faturado',
      align: 'right',
      sortValue: (r) => r.total_valor,
      cell: (r) => <span className="text-[12px] font-medium text-jl-fg-1">{formatBRL(r.total_valor)}</span>,
    },
    {
      key: 'vendas',
      header: 'Vendas',
      align: 'right',
      sortValue: (r) => r.num_vendas,
      cell: (r) => <span className="text-[12px] text-jl-fg-2">{r.num_vendas}</span>,
    },
  ]

  const baixoEstoqueColumns: Column<RelatorioEstoqueBaixoDTO>[] = [
    {
      key: 'produto',
      header: 'Produto',
      sortValue: (r) => r.nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-[12px] font-medium text-jl-fg-1">{r.nome}</p>
          <p className="font-mono text-[10px] text-jl-fg-3">{r.codigo_barras ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      sortValue: (r) => r.quantidade_atual,
      cell: (r) => (
        <span className={r.quantidade_atual <= 0 ? 'font-medium text-red-400' : 'text-emerald-400'}>
          {r.quantidade_atual}
        </span>
      ),
    },
    {
      key: 'minimo',
      header: 'Mínimo',
      align: 'right',
      sortValue: (r) => r.estoque_minimo,
      cell: (r) => <span className="text-[12px] text-jl-fg-2">{r.estoque_minimo}</span>,
    },
    {
      key: 'deficit',
      header: 'Déficit',
      align: 'right',
      sortValue: (r) => r.deficit,
      cell: (r) =>
        r.deficit > 0 ? (
          <span className="font-medium text-amber-400">-{r.deficit}</span>
        ) : (
          <span className="text-jl-fg-3">—</span>
        ),
    },
  ]

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

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Itens vendidos"
          value={String(dados.resumoExecutivo.itens_vendidos)}
          tone="gold"
        />
        <MetricCard
          label="Vendas concluídas"
          value={String(dados.resumoExecutivo.vendas_concluidas)}
          tone="success"
        />
        <MetricCard
          label="Taxa cancelamento"
          value={`${(dados.resumoExecutivo.taxa_cancelamento * 100).toFixed(1)}%`}
          tone="gold"
          deltaPositiveIsGood={false}
        />
        <MetricCard
          label="Cobertura de custo"
          value={`${(dados.resumoExecutivo.cobertura_custo * 100).toFixed(0)}%`}
          tone="success"
          hint={!dados.resumoExecutivo.custo_confiavel ? 'Custo pode ter divergências' : undefined}
          className={!dados.resumoExecutivo.custo_confiavel ? 'opacity-60' : undefined}
        />
      </div>

      {!dados.resumoExecutivo.custo_confiavel ? (
        <p className="admin-v2-alert-warning mb-6 rounded-lg px-3 py-2 text-[11px]">
          Custo não é confiável (pode haver divergências de preço_custo)
        </p>
      ) : null}

      <SectionCard title="Vendas por dia" className="mb-6">
        <DataTable
          data={dados.porDia}
          columns={vendaPorDiaColumns}
          rowKey={(r) => r.dia}
          emptyState={<EmptyState msg="Nenhuma venda neste período" />}
          className="rounded-none border-x-0 border-[#242424]"
        />
      </SectionCard>

      <SectionCard title="Top 50 produtos" className="mb-6">
        <DataTable
          data={dados.top}
          columns={topProdColumns}
          rowKey={(r) => r.id}
          emptyState={<EmptyState msg="Nenhum produto vendido neste período" />}
          className="rounded-none border-x-0 border-[#242424]"
        />
      </SectionCard>

      <SectionCard title="Estoque crítico">
        <DataTable
          data={dados.baixo}
          columns={baixoEstoqueColumns}
          rowKey={(r) => r.id}
          emptyState={<EmptyState msg="Nenhum produto com estoque crítico" />}
          className="rounded-none border-x-0 border-[#242424]"
        />
      </SectionCard>
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
