'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type FiltroLateralCadastroProps = Readonly<{
  title: string
  filtros: ReactNode
  onFiltrar: () => void
  onLimpar: () => void
  labelFiltrar: string
  labelLimpar: string
  className?: string
}>

/**
 * Painel lateral de filtros (cadastro/listagens gerente).
 * O conteúdo dos campos é passado em `filtros`; os botões disparam as ações no pai.
 */
export function FiltroLateralCadastro({
  title,
  filtros,
  onFiltrar,
  onLimpar,
  labelFiltrar,
  labelLimpar,
  className,
}: FiltroLateralCadastroProps) {
  return (
    <aside
      className={cn(
        'dragon-glass-card flex flex-col gap-3 rounded-xl border p-4 app-border lg:sticky lg:top-4',
        className,
      )}
    >
      <h2 className="text-sm font-semibold tracking-wide app-accent-text">{title}</h2>
      <div className="flex flex-col gap-3">{filtros}</div>
      <div className="mt-1 flex flex-col gap-2 border-t pt-3 app-divider sm:flex-row sm:flex-wrap sm:justify-end">
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-xs font-semibold app-muted transition hover:underline"
          onClick={onLimpar}
        >
          {labelLimpar}
        </button>
        <button
          type="button"
          className="inline-flex min-h-[40px] min-w-[120px] items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90 app-border app-accent-text"
          onClick={onFiltrar}
        >
          {labelFiltrar}
        </button>
      </div>
    </aside>
  )
}
