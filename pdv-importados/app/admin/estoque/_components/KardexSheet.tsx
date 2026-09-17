'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { History } from 'lucide-react'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { obterKardexProduto, type KardexMovimento } from '../actions'
import { DragonModal } from '@/components/ui/DragonModal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState, Loading } from '@/components/ui/feedback'
import { MovementBadge } from '@/components/ui/MovementBadge'
import { StatusChip } from '@/components/ui/StatusChip'

export type KardexAlvo = Readonly<{ produtoId: string; produtoNome: string }>

export type KardexLabels = {
  titulo: string
  semMovimentos: string
  semMovimentosSub: string
  tipoMap: Record<string, string>
  /** RM-10: link de volta para a trilha de auditoria (filtro geral de ajustes de estoque). */
  verAuditoria: string
}

/**
 * Kardex e Auditoria leem os mesmos dados (`movimentos_estoque_log`), mas até aqui
 * eram becos sem saída um em relação ao outro. Sem filtro por produto na Auditoria
 * ainda (RM-10 fica com esse follow-up), este link abre a trilha já filtrada por
 * tipo — o operador continua tendo que localizar a linha do produto, mas não parte
 * mais do zero.
 */
const AUDITORIA_AJUSTES_HREF = pathWithQuery(
  ROUTES.admin.auditoria,
  new URLSearchParams({ tipo: 'AJUSTE_ESTOQUE' }),
)

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
      footer={
        <Link
          href={AUDITORIA_AJUSTES_HREF}
          className="text-caption font-medium text-[var(--color-info)] hover:underline"
        >
          {labels.verAuditoria}
        </Link>
      }
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
