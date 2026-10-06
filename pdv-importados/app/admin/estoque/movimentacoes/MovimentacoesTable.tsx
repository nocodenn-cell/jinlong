'use client'

import Link from 'next/link'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MovementBadge } from '@/components/ui/MovementBadge'
import { ROUTES } from '@/lib/navigation/routes'
import type { MovimentoLinha } from './actions'

export function MovimentacoesTable({ rows, zh, tipos }: { rows: MovimentoLinha[]; zh: boolean; tipos: Record<string, string> }) {
  const columns: Column<MovimentoLinha>[] = [
    { key: 'data', header: zh ? '日期' : 'Data', cell: (row) => new Date(row.ocorrido_em).toLocaleString(zh ? 'zh-CN' : 'pt-BR') },
    { key: 'produto', header: zh ? '商品' : 'Produto', cell: (row) => <Link className="underline" href={`${ROUTES.admin.estoque}?q=${encodeURIComponent(row.produto_nome)}`}>{row.produto_nome}</Link> },
    { key: 'tipo', header: zh ? '类型' : 'Tipo', cell: (row) => tipos[row.tipo_codigo] ?? row.tipo_codigo },
    { key: 'quantidade', header: zh ? '数量变化' : 'Variação', cell: (row) => <MovementBadge delta={row.quantidade_delta} /> },
    { key: 'motivo', header: zh ? '备注' : 'Observação', cell: (row) => <span className="block max-w-xs break-words">{row.observacao ?? '—'}</span> },
  ]
  return <DataTable data={rows} columns={columns} rowKey={(row) => row.evento_id} emptyTitle={zh ? '没有库存变动' : 'Nenhuma movimentação encontrada'} />
}
