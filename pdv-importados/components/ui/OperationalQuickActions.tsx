'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type OperationalQuickAction = {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}

type Props = {
  title: string
  actions: OperationalQuickAction[]
  className?: string
}

/** Faixa fixa de atalhos operacionais (mín. 56px, rótulo ≥18px, alto contraste). */
export function OperationalQuickActions({ title, actions, className }: Props) {
  return (
    <nav
      aria-label={title}
      className={cn(
        'sticky top-0 z-30 -mx-1 mb-4 border-b-2 border-[var(--color-border-secondary)] bg-[var(--color-surface)] px-1 py-3 shadow-sm',
        className,
      )}
    >
      <p className="mb-2 text-[18px] font-bold text-jl-fg-1">{title}</p>
      <ul className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <li key={action.id} className="min-w-[9rem] flex-1 sm:flex-none">
            <button
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              className="flex h-14 min-h-[56px] w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--color-border-secondary)] bg-jl-surface-elev px-3 text-[18px] font-semibold text-jl-fg-1 hover:bg-jl-surface-soft focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center [&>svg]:h-7 [&>svg]:w-7" aria-hidden>
                {action.icon}
              </span>
              <span className="leading-tight">{action.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
