'use client'

import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import { cn } from '@/lib/utils'

export type FechamentoCaixa = {
  id: string
  operador_nome: string | null
  data_abertura: string
  data_fechamento: string
  valor_inicial: number
  valor_fechamento: number | null
  saldo_atual: number
  fechamento_diferenca: number | null
  fechamento_observacao: string | null
}

function DiferencaCell({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-jl-fg-3">—</span>
  const abs = Math.abs(valor)
  if (abs < 0.01) {
    return <span className="text-[12px] font-medium text-emerald-400">Zerado</span>
  }
  return (
    <span
      className={cn(
        'text-[12px] font-medium font-mono',
        valor < 0 ? 'text-red-400' : 'text-emerald-400',
      )}
    >
      {valor > 0 ? '+' : ''}{formatBRL(valor)}
    </span>
  )
}

function DataCell({ iso }: { iso: string }) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return <span className="text-jl-fg-3">—</span>
  return (
    <span className="whitespace-nowrap text-[12px] text-jl-fg-2">
      {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
      {' '}
      <span className="text-jl-fg-3">
        {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </span>
  )
}

export function CaixaHistoricoTable({ fechamentos }: { fechamentos: FechamentoCaixa[] }) {
  const columns: Column<FechamentoCaixa>[] = [
    {
      key: 'abertura',
      header: 'Abertura',
      sortValue: (r) => r.data_abertura,
      cell: (r) => <DataCell iso={r.data_abertura} />,
    },
    {
      key: 'fechamento',
      header: 'Fechamento',
      sortValue: (r) => r.data_fechamento,
      cell: (r) => <DataCell iso={r.data_fechamento} />,
    },
    {
      key: 'operador',
      header: 'Operador',
      sortValue: (r) => r.operador_nome ?? '',
      cell: (r) => (
        <span className="text-[12px] text-jl-fg-2">{r.operador_nome ?? '—'}</span>
      ),
    },
    {
      key: 'inicial',
      header: 'Fundo de caixa',
      align: 'right',
      sortValue: (r) => r.valor_inicial,
      cell: (r) => (
        <span className="text-[12px] font-mono text-jl-fg-2">{formatBRL(r.valor_inicial)}</span>
      ),
    },
    {
      key: 'saldo',
      header: 'Saldo final',
      align: 'right',
      sortValue: (r) => r.saldo_atual,
      cell: (r) => (
        <span className="text-[12px] font-medium font-mono text-jl-fg-1">{formatBRL(r.saldo_atual)}</span>
      ),
    },
    {
      key: 'fechamento_valor',
      header: 'Valor conferido',
      align: 'right',
      sortValue: (r) => r.valor_fechamento ?? 0,
      cell: (r) =>
        r.valor_fechamento != null ? (
          <span className="text-[12px] font-mono text-jl-fg-2">{formatBRL(r.valor_fechamento)}</span>
        ) : (
          <span className="text-jl-fg-3">—</span>
        ),
    },
    {
      key: 'diferenca',
      header: 'Diferença',
      align: 'right',
      sortValue: (r) => r.fechamento_diferenca ?? 0,
      cell: (r) => <DiferencaCell valor={r.fechamento_diferenca} />,
    },
    {
      key: 'obs',
      header: 'Observação',
      cell: (r) =>
        r.fechamento_observacao ? (
          <span className="max-w-[200px] truncate text-[11px] text-jl-fg-3" title={r.fechamento_observacao}>
            {r.fechamento_observacao}
          </span>
        ) : null,
    },
  ]

  return (
    <DataTable
      data={fechamentos}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState={
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="text-4xl text-jl-fg-3" aria-hidden>🏦</span>
          <p className="text-[14px] font-medium text-jl-fg-2">Nenhum fechamento registrado</p>
          <p className="text-[12px] text-jl-fg-3">
            Os fechamentos de caixa aparecerão aqui após serem realizados no PDV.
          </p>
        </div>
      }
      className="rounded-none border-x-0 border-b-0"
    />
  )
}
