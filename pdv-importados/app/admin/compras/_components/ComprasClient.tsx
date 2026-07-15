'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { formatBRL } from '@/lib/format/money'
import type { OcDetalheDTO, OcListaDTO } from '../actions'
import { OcFormModal } from './OcFormModal'
import { OcDetalheModal } from './OcDetalheModal'
import { OcStatusBadge, fmtDataOc, idCurtoOc } from './comprasFormat'

type Props = Readonly<{
  idioma: Idioma
  rows: OcListaDTO[]
  fornecedores: Array<{ id: string; nome: string }>
  produtos: Array<{ id: string; nome: string; unidade_medida: string }>
}>

export function ComprasClient({ idioma, rows, fornecedores, produtos }: Props) {
  const router = useRouter()
  const m = getMessages(idioma)
  const c = m.compras

  const [formAberto, setFormAberto] = useState(false)
  const [ocParaEditar, setOcParaEditar] = useState<OcDetalheDTO | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)

  function abrirNova() {
    setOcParaEditar(null)
    setFormAberto(true)
  }

  function abrirEditar(oc: OcDetalheDTO) {
    setOcParaEditar(oc)
    setFormAberto(true)
    setDetalheId(null)
  }

  function fecharForm() {
    setFormAberto(false)
    setOcParaEditar(null)
  }

  function aoMudar() {
    fecharForm()
    setDetalheId(null)
    router.refresh()
  }

  const columns: Column<OcListaDTO>[] = [
    {
      key: 'id',
      header: c.col_id,
      cell: (row) => <span className="font-mono text-xs text-jl-fg-3">{idCurtoOc(row.id)}</span>,
    },
    {
      key: 'fornecedor',
      header: c.col_fornecedor,
      cell: (row) => <span className="font-medium">{row.fornecedor_nome ?? '—'}</span>,
      sortValue: (row) => row.fornecedor_nome ?? '',
    },
    {
      key: 'status',
      header: c.col_status,
      cell: (row) => <OcStatusBadge status={row.status} m={m} />,
      sortValue: (row) => row.status,
    },
    {
      key: 'emissao',
      header: c.col_emissao,
      cell: (row) => <span className="text-xs tabular-nums">{fmtDataOc(row.data_emissao)}</span>,
      sortValue: (row) => row.data_emissao,
    },
    {
      key: 'previsto',
      header: c.col_previsto,
      cell: (row) => (
        <span className="text-xs tabular-nums text-jl-fg-3">{fmtDataOc(row.data_prevista_chegada)}</span>
      ),
      sortValue: (row) => row.data_prevista_chegada ?? '',
    },
    {
      key: 'itens',
      header: c.col_itens,
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.total_itens}</span>,
      sortValue: (row) => row.total_itens,
    },
    {
      key: 'total',
      header: c.col_total,
      align: 'right',
      cell: (row) => <span className="tabular-nums">{formatBRL(row.valor_total)}</span>,
      sortValue: (row) => row.valor_total,
    },
  ]

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <button type="button" onClick={abrirNova} className="admin-v2-btn-primary inline-flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {c.nova_oc}
        </button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => setDetalheId(row.id)}
        emptyState={
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-jl-fg-1">{c.vazio_titulo}</div>
            <div className="mt-1 text-xs text-jl-fg-3">{c.vazio_sub}</div>
          </div>
        }
      />

      {formAberto && (
        <OcFormModal
          idioma={idioma}
          ocInicial={ocParaEditar}
          fornecedores={fornecedores}
          produtos={produtos}
          onClose={fecharForm}
          onSaved={aoMudar}
        />
      )}

      {detalheId && (
        <OcDetalheModal
          idioma={idioma}
          ocId={detalheId}
          onClose={() => setDetalheId(null)}
          onEditar={abrirEditar}
          onStatusChanged={aoMudar}
        />
      )}
    </>
  )
}
