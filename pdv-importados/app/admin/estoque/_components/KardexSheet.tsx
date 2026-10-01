'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { History } from 'lucide-react'
import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'
import { obterKardexProduto, type KardexMovimento } from '../actions'
import { DragonModal } from '@/components/ui/DragonModal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState, Loading } from '@/components/ui/feedback'
import { MovementBadge } from '@/components/ui/MovementBadge'
import { StatusChip } from '@/components/ui/StatusChip'
import { humanizarCodigo } from '@/lib/format/vendaLabels'

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

/**
 * `observacao` do log vem como texto técnico (`devolucao | motivo=troca | operacao=<uuid>`).
 * Só apresentação: mostra o motivo legível e esconde o id da operação (o dado persistido não muda).
 */
export function formatObservacaoKardex(observacao: string | null | undefined): string {
  const partes = String(observacao ?? '')
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p && !/^operacao=/i.test(p))
  const motivos = partes.filter((p) => /^motivo=/i.test(p)).map((p) => p.replace(/^motivo=/i, '').trim())
  return (motivos.length > 0 ? motivos : partes).filter(Boolean).join(' · ')
}

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
    labels.tipoMap[codigo] ?? humanizarCodigo(codigo)

  const columns: Column<KardexMovimento>[] = useMemo(
    () => [
      {
        key: 'quando',
        header: 'Data',
        cell: (m) => (
          <span className="whitespace-nowrap text-caption text-fg-subtle">
            {dtFmt.format(new Date(m.created_at))}
          </span>
        ),
      },
      {
        key: 'tipo',
        header: 'Tipo',
        priority: 'primary',
        cell: (m) => (
          <StatusChip
            status={toneStatusForTipo(m.tipo_codigo, m.quantidade_delta >= 0)}
            label={rotuloTipo(m.tipo_codigo)}
          />
        ),
      },
      {
        key: 'delta',
        header: 'Qtd',
        align: 'right',
        cell: (m) => <MovementBadge delta={m.quantidade_delta} />,
      },
      {
        key: 'motivo',
        header: 'Motivo',
        className: 'max-w-[14rem]',
        cell: (m) => {
          const texto = formatObservacaoKardex(m.observacao)
          return texto ? (
            <span className="block truncate text-caption text-fg-subtle" title={texto}>
              {texto}
            </span>
          ) : (
            <span className="text-caption text-fg-subtle">—</span>
          )
        },
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
      size="lg"
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
