'use client'

import type { ReactNode } from 'react'
import { GerenteTable, type GerenteTableColumn } from '@/components/gerente/GerenteTable'
import { cn } from '@/lib/utils'

export type TabelaCadastroPadraoProps = Readonly<{
  sectionTitle: string
  sectionMeta?: ReactNode
  columns: GerenteTableColumn[]
  children: ReactNode
  tone?: 'paper' | 'dragon'
  compact?: boolean
  footer?: ReactNode
  className?: string
}>

/** Seção padrão (título + tabela Gerente) para listagens de cadastro. */
export function TabelaCadastroPadrao({
  sectionTitle,
  sectionMeta,
  columns,
  children,
  tone = 'dragon',
  compact = true,
  footer,
  className,
}: TabelaCadastroPadraoProps) {
  return (
    <section className={cn('dragon-glass-card overflow-hidden rounded-xl', className)}>
      <div className="gerente-fin-divider flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
        <h2 className="gerente-section-accent text-sm font-semibold">{sectionTitle}</h2>
        {sectionMeta ? <div className="gerente-fin-muted text-xs font-medium">{sectionMeta}</div> : null}
      </div>
      <div className="p-3">
        <GerenteTable tone={tone} compact={compact} columns={columns}>
          {children}
        </GerenteTable>
      </div>
      {footer}
    </section>
  )
}

export type CadastroLinhaAcoesPadraoProps<T> = Readonly<{
  row: T
  onEditar?: (row: T) => void
  onExcluir?: (row: T) => void
  labels: { editar: string; excluir: string }
}>

/** Botões opcionais de linha (quando a tela expõe editar/excluir). */
export function CadastroLinhaAcoesPadrao<T>({ row, onEditar, onExcluir, labels }: CadastroLinhaAcoesPadraoProps<T>) {
  if (!onEditar && !onExcluir) return null
  return (
    <div className="gerente-row-actions flex items-center justify-center gap-1 sm:gap-2">
      {onEditar ? (
        <button
          type="button"
          onClick={() => onEditar(row)}
          className="gerente-chip-action rounded-md border px-2 py-1 text-[11px] font-medium transition"
        >
          {labels.editar}
        </button>
      ) : null}
      {onExcluir ? (
        <button
          type="button"
          onClick={() => onExcluir(row)}
          className="gerente-chip-action rounded-md border px-2 py-1 text-[11px] font-medium transition app-badge-danger"
        >
          {labels.excluir}
        </button>
      ) : null}
    </div>
  )
}
