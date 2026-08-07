'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CadastroRapidoBlockProps = Readonly<{
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}>

/**
 * Bloco de cadastro rápido colapsável (`<details>`).
 * Tokens Admin V2 — sem dragon-glass (Sprint 5 / RFC-UX-022).
 */
export function CadastroRapidoBlock({
  title,
  subtitle,
  defaultOpen = true,
  children,
  className,
}: CadastroRapidoBlockProps) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        'group overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2.5',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{subtitle}</p> : null}
        </div>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 opacity-70 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="p-3">{children}</div>
    </details>
  )
}
