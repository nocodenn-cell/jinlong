'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MovementBadge } from '@/components/ui/MovementBadge'
import { ROUTES } from '@/lib/navigation/routes'
import type { MovimentoLinha } from './actions'
import { MovimentoDetalhePainel } from './MovimentoDetalhePainel'

type Labels = {
  detalhe: string
  fechar: string
  produto: string
  data: string
  tipo: string
  variacao: string
  observacao: string
  verProduto: string
  vazio: string
}

export function MovimentacoesTable({
  rows,
  zh,
  tipos,
  labels,
}: {
  rows: MovimentoLinha[]
  zh: boolean
  tipos: Record<string, string>
  labels: Labels
}) {
  const [aberto, setAberto] = useState<MovimentoLinha | null>(null)
  const locale = zh ? 'zh-CN' : 'pt-BR'
  const columns: Column<MovimentoLinha>[] = [
    {
      key: 'data',
      header: labels.data,
      cell: (row) => new Date(row.ocorrido_em).toLocaleString(locale),
    },
    {
      key: 'produto',
      header: labels.produto,
      cell: (row) => (
        <Link
          className="underline"
          href={`${ROUTES.admin.estoque}?q=${encodeURIComponent(row.produto_nome)}`}
          onClick={(event) => event.stopPropagation()}
        >
          {row.produto_nome}
        </Link>
      ),
    },
    {
      key: 'tipo',
      header: labels.tipo,
      cell: (row) => tipos[row.tipo_codigo] ?? row.tipo_codigo,
    },
    {
      key: 'quantidade',
      header: labels.variacao,
      cell: (row) => <MovementBadge delta={row.quantidade_delta} />,
    },
  ]

  return (
    <>
      <DataTable
        compact
        data={rows}
        columns={columns}
        rowKey={(row) => row.evento_id}
        emptyTitle={labels.vazio}
        onRowClick={setAberto}
      />
      <MovimentoDetalhePainel
        row={aberto}
        tipoLabel={aberto ? (tipos[aberto.tipo_codigo] ?? aberto.tipo_codigo) : ''}
        dataLabel={aberto ? new Date(aberto.ocorrido_em).toLocaleString(locale) : ''}
        labels={{ ...labels, titulo: labels.detalhe }}
        onClose={() => setAberto(null)}
      />
    </>
  )
}
