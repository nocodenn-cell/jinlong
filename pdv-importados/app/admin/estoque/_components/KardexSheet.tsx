'use client'

import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { obterKardexProduto, type KardexMovimento } from '../actions'
import { DragonModal } from '@/components/ui/DragonModal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState, Loading } from '@/components/ui/feedback'
import { MovementBadge } from '@/components/ui/MovementBadge'
import { StatusChip } from '@/components/ui/StatusChip'

export type KardexAlvo = Readonly<{ produtoId: string; produtoNome: string }>

type KardexLabels = {
  titulo: string
  semMovimentos: string
  semMovimentosSub: string
  tipoMap: Record<string, string>
}

const dtFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** Tipos de movimento → tom de StatusChip (mesmo padrão visual). */
function toneStatusForTipo(codigo: string, entrada: boolean): string {
  if (codigo === 'VENDA' || codigo === 'SAIDA' || codigo === 'PERDA' || codigo === 'QUEBRA') {
    return 'ERRO'
  }
  if (codigo === 'AJUSTE' || codigo === 'ACERTO_INVENTARIO' || codigo === 'TRANSFERENCIA') {
    return 'PENDENTE'
  }
  return entrada ? 'ATIVO' : 'INATIVO'
}

export function KardexSheet({
  alvo,
  onClose,
  labels,
}: {
  alvo: KardexAlvo | null
  onClose: () => void
  labels: KardexLabels
}) {
  const [movimentos, setMovimentos] = useState<KardexMovimento[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!alvo) return
    let vivo = true
    setCarregando(true)
    setMovimentos([])
    obterKardexProduto(alvo.produtoId)
      .then((rows) => {
        if (vivo) setMovimentos(rows)
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [alvo])

  const rotuloTipo = (codigo: string): string =>
    labels.tipoMap[codigo] ?? codigo.replace(/_/g, ' ').toLowerCase()

  const columns: Column<KardexMovimento>[] = useMemo(
    () => [
      {
        key: 'tipo',
        header: 'Tipo',
        priority: 'primary',
        cell: (m) => (
          <div className="min-w-0">
            <StatusChip
              status={toneStatusForTipo(m.tipo_codigo, m.quantidade_delta >= 0)}
              label={rotuloTipo(m.tipo_codigo)}
            />
            {m.observacao ? (
              <p className="mt-1 truncate text-caption text-fg-subtle">{m.observacao}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'quando',
        header: '',
        priority: 'contextual',
        cell: (m) => (
          <span className="text-caption text-fg-subtle">
            {dtFmt.format(new Date(m.created_at))}
          </span>
        ),
      },
      {
        key: 'delta',
        header: '',
        align: 'right',
        cell: (m) => <MovementBadge delta={m.quantidade_delta} />,
      },
    ],
    // labels.tipoMap identity is stable per open; rotuloTipo closes over labels
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labels],
  )

  if (!alvo) return null

  return (
    <DragonModal
      open
      onClose={onClose}
      sheet
      size="md"
      icon={History}
      title={labels.titulo}
      subtitle={alvo.produtoNome}
      closeLabel="Fechar"
    >
      {carregando ? (
        <Loading label="…" className="min-h-0 py-12" size="sm" />
      ) : (
        <DataTable
          columns={columns}
          data={movimentos}
          rowKey={(m) => m.id}
          emptyState={
            <EmptyState title={labels.semMovimentos} description={labels.semMovimentosSub} />
          }
          className="rounded-none border-0"
        />
      )}
    </DragonModal>
  )
}
