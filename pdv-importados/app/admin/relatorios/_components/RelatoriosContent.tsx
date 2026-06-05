'use client'

/**
 * FastProduct Admin — RelatoriosContent (Fase 6)
 *
 * Client component que renderiza os dados do relatório: resumo executivo (KPIs),
 * tabelas de vendas por dia, top produtos e estoque baixo. Usa DataTable (Fase 2).
 */

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
      className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none"
      style={{
        background: isChina ? 'var(--fp-info-bg)' : 'rgba(255,255,255,0.05)',
        border: isChina ? '1px solid var(--fp-info-border)' : '1px solid var(--fp-border)',
        color: isChina ? 'var(--fp-info)' : 'var(--fp-text-secondary)',
      }}
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
          return <span className="text-[12px] text-zinc-300">{formatDayMonthInLocale(d, 'pt-BR')}</span>
        } catch {
          return <span className="text-[12px] text-zinc-300">{r.dia}</span>
        }
      },
    },
    {
      key: 'vendas',
      header: 'Vendas',
      align: 'right',
      sortValue: (r) => r.num_vendas,
      cell: (r) => <span className="text-[12px] text-zinc-200">{r.num_vendas}</span>,
    },
    {
      key: 'faturado',
      header: 'Faturado',
      align: 'right',
      sortValue: (r) => r.total_liquido,
      cell: (r) => <span className="text-[12px] font-medium text-zinc-100">{formatBRL(r.total_liquido)}</span>,
    },
    {
      key: 'ticket',
      header: 'Ticket médio',
      align: 'right',
      sortValue: (r) => r.ticket_medio,
      cell: (r) => <span className="text-[12px] text-zinc-300">{formatBRL(r.ticket_medio)}</span>,
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
          <span className="text-[12px] text-zinc-700">—</span>
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
          <p className="max-w-[240px] truncate text-[12px] font-medium text-zinc-200">{r.nome}</p>
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
      cell: (r) => <span className="text-[12px] text-zinc-200">{r.total_quantidade}</span>,
    },
    {
      key: 'valor',
      header: 'Faturado',
      align: 'right',
      sortValue: (r) => r.total_valor,
      cell: (r) => <span className="text-[12px] font-medium text-zinc-100">{formatBRL(r.total_valor)}</span>,
    },
    {
      key: 'vendas',
      header: 'Vendas',
      align: 'right',
      sortValue: (r) => r.num_vendas,
      cell: (r) => <span className="text-[12px] text-zinc-300">{r.num_vendas}</span>,
    },
  ]

  const baixoEstoqueColumns: Column<RelatorioEstoqueBaixoDTO>[] = [
    {
      key: 'produto',
      header: 'Produto',
      sortValue: (r) => r.nome,
      cell: (r) => (
        <div className="min-w-0">
          <p className="max-w-[240px] truncate text-[12px] font-medium text-zinc-200">{r.nome}</p>
          <p className="font-mono text-[10px] text-zinc-600">{r.codigo_barras ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      sortValue: (r) => r.quantidade_atual,
      cell: (r) => (
        <span className={r.quantidade_atual <= 0 ? 'font-medium text-red-400' : 'text-green-400'}>
          {r.quantidade_atual}
        </span>
      ),
    },
    {
      key: 'minimo',
      header: 'Mínimo',
      align: 'right',
      sortValue: (r) => r.estoque_minimo,
      cell: (r) => <span className="text-[12px] text-zinc-400">{r.estoque_minimo}</span>,
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
          <span className="text-zinc-700">—</span>
        ),
    },
  ]

  return (
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Relatórios</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Período: {dados.periodo.de} a {dados.periodo.ate}
            {dados.periodo.aviso ? ` (${dados.periodo.aviso})` : ''}
          </p>
        </div>
      </div>

      {dados.rpcErro ? (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
          {dados.rpcErro}
        </div>
      ) : null}

      {/* Resumo executivo */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Itens vendidos" value={String(dados.resumoExecutivo.itens_vendidos)} />
          <KpiCard label="Vendas concluídas" value={String(dados.resumoExecutivo.vendas_concluidas)} />
          <KpiCard label="Taxa cancelamento" value={`${(dados.resumoExecutivo.taxa_cancelamento * 100).toFixed(1)}%`} />
          <KpiCard
            label="Cobertura de custo"
            value={`${(dados.resumoExecutivo.cobertura_custo * 100).toFixed(0)}%`}
            muted={!dados.resumoExecutivo.custo_confiavel}
          />
        </div>
        {!dados.resumoExecutivo.custo_confiavel ? (
          <p className="mt-2 text-[11px]" style={{ color: 'var(--fp-text-muted)' }}>
            ⚠️ Custo não é confiável (pode haver divergências de preço_custo)
          </p>
        ) : null}
      </div>

      {/* Vendas por dia */}
      <div>
        <div className="border-b border-zinc-800 px-6 py-2.5">
          <span className="text-[13px] font-medium text-zinc-300">Vendas por dia</span>
        </div>
        <DataTable
          data={dados.porDia}
          columns={vendaPorDiaColumns}
          rowKey={(r) => r.dia}
          emptyState={<EmptyState msg="Nenhuma venda neste período" />}
          className="rounded-none border-x-0 border-b border-zinc-800"
        />
      </div>

      {/* Top produtos */}
      <div>
        <div className="border-b border-zinc-800 px-6 py-2.5">
          <span className="text-[13px] font-medium text-zinc-300">Top 50 produtos</span>
        </div>
        <DataTable
          data={dados.top}
          columns={topProdColumns}
          rowKey={(r) => r.id}
          emptyState={<EmptyState msg="Nenhum produto vendido neste período" />}
          className="rounded-none border-x-0 border-b border-zinc-800"
        />
      </div>

      {/* Estoque baixo */}
      <div>
        <div className="border-b border-zinc-800 px-6 py-2.5">
          <span className="text-[13px] font-medium text-zinc-300">Estoque crítico</span>
        </div>
        <DataTable
          data={dados.baixo}
          columns={baixoEstoqueColumns}
          rowKey={(r) => r.id}
          emptyState={<EmptyState msg="Nenhum produto com estoque crítico" />}
          className="rounded-none border-x-0"
        />
      </div>
    </div>
  )
}

function KpiCard({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div
      className="rounded-[10px] p-3"
      style={{
        background: 'var(--fp-bg-secondary)',
        border: '1px solid var(--fp-border)',
        opacity: muted ? 0.6 : 1,
      }}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--fp-text-muted)' }}>
        {label}
      </p>
      <p className="mt-1.5 text-[18px] font-semibold" style={{ color: 'var(--fp-text-primary)' }}>
        {value}
      </p>
    </div>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <span className="text-3xl text-zinc-700" aria-hidden>
        📊
      </span>
      <p className="text-[12px] text-zinc-500">{msg}</p>
    </div>
  )
}
