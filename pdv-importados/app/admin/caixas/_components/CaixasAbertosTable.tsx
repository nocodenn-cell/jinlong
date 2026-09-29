'use client'

/**
 * Caixas em operação (status ABERTO). SOMENTE LEITURA — abrir/fechar/sangria/
 * suprimento são writers do PDV (`/caixa`). Sangrias/suprimentos são totais
 * informativos das movimentações aprovadas; o "esperado" do turno NÃO é
 * exibido aqui (exigiria `calcular_valor_sistema_dinheiro_caixa` por turno).
 */

import type { CaixaAbertoLinha } from '@/app/gerente/caixas/caixasHistorico'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/feedback'
import { StatusChip } from '@/components/ui/StatusChip'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'

export type CaixasAbertosLabels = Readonly<{
  colOperador: string
  colAbertura: string
  colValorInicial: string
  colSangrias: string
  colSuprimentos: string
  colStatus: string
  statusAberto: string
  statusRetomado: string
  vazioTitulo: string
  vazioSub: string
}>

export function CaixasAbertosTable({
  linhas,
  locale,
  labels,
}: {
  linhas: CaixaAbertoLinha[]
  locale: string
  labels: CaixasAbertosLabels
}) {
  const columns: Column<CaixaAbertoLinha>[] = [
    {
      key: 'operador',
      header: labels.colOperador,
      priority: 'primary',
      cell: (r) => <span className="font-medium text-fg">{r.operadorNome}</span>,
    },
    {
      key: 'abertura',
      header: labels.colAbertura,
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums text-body">
          {formatDateTimeOrDash(r.dataAbertura, locale, 'short')}
        </span>
      ),
    },
    {
      key: 'valorInicial',
      header: labels.colValorInicial,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatBRL(r.valorInicial)}</span>,
    },
    {
      key: 'sangrias',
      header: labels.colSangrias,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatBRL(r.sangrias)}</span>,
    },
    {
      key: 'suprimentos',
      header: labels.colSuprimentos,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatBRL(r.suprimentos)}</span>,
    },
    {
      key: 'status',
      header: labels.colStatus,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusChip status="ABERTO" label={`● ${labels.statusAberto}`} />
          {r.retomado ? <StatusChip status="PROCESSANDO" label={`↻ ${labels.statusRetomado}`} /> : null}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      data={linhas}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState={<EmptyState title={labels.vazioTitulo} description={labels.vazioSub} />}
    />
  )
}
