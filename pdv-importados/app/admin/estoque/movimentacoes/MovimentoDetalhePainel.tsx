'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { MovementBadge } from '@/components/ui/MovementBadge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/navigation/routes'
import type { MovimentoLinha } from './actions'

type Labels = {
  titulo: string
  fechar: string
  produto: string
  data: string
  tipo: string
  variacao: string
  observacao: string
  verProduto: string
}

type Props = {
  row: MovimentoLinha | null
  tipoLabel: string
  dataLabel: string
  labels: Labels
  onClose: () => void
}

export function MovimentoDetalhePainel({ row, tipoLabel, dataLabel, labels, onClose }: Props) {
  useEffect(() => {
    if (!row) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [row, onClose])

  if (!row) return null

  const produtoHref = `${ROUTES.admin.estoque}?q=${encodeURIComponent(row.produto_nome)}`

  return (
    <div className="fixed inset-0 z-40 flex justify-end" data-testid="mov-detalhe">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label={labels.fechar}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="false"
        aria-label={labels.titulo}
        className="relative flex h-full w-full max-w-md flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] p-4">
          <div>
            <h2 className="text-title font-semibold text-fg">{labels.titulo}</h2>
            <p className="mt-1 text-caption text-fg-subtle">{dataLabel}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label={labels.fechar} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <dl className="space-y-4 overflow-y-auto p-4 text-body">
          <Linha rotulo={labels.produto} valor={row.produto_nome} />
          <Linha rotulo={labels.tipo} valor={tipoLabel} />
          <div>
            <dt className="text-caption text-fg-muted">{labels.variacao}</dt>
            <dd className="mt-1">
              <MovementBadge delta={row.quantidade_delta} />
            </dd>
          </div>
          <Linha rotulo={labels.observacao} valor={row.observacao?.trim() || '—'} />
        </dl>
        <div className="mt-auto border-t border-[var(--color-border)] p-4">
          <Link href={produtoHref} className="text-body font-medium text-brand underline-offset-2 hover:underline">
            {labels.verProduto}
          </Link>
        </div>
      </aside>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-caption text-fg-muted">{rotulo}</dt>
      <dd className="mt-1 break-words text-fg">{valor}</dd>
    </div>
  )
}
