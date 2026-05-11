import React, { type ReactNode } from 'react'
import type { Mensagens } from '@/i18n/getMessages'

type Props = Readonly<{
  m: Mensagens
  tituloPagina: string
  rightSlot?: ReactNode
}>

/** Trilha estilo ERP: Cadastros › Página atual (cores do tema). */
export function GerenteCadastroBreadcrumb({ m, tituloPagina, rightSlot }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="Breadcrumb" className="text-xs font-medium">
        <span className="app-accent-text">{m.gerente.nav_grupo_cadastros}</span>
        <span className="mx-1.5 opacity-60" aria-hidden>
          ›
        </span>
        <span className="font-semibold text-[color:var(--color-text-primary)]">{tituloPagina}</span>
      </nav>
      {rightSlot}
    </div>
  )
}
