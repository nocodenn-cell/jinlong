'use client'

import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette'

/** Botão que abre a paleta (o atalho Ctrl+K funciona sem ele). */
export function CommandPaletteTrigger({
  label,
  className,
  compact = false,
}: {
  label: string
  className?: string
  /** Só o ícone (barra superior mobile). */
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
      aria-label={label}
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        'flex items-center gap-2 rounded-full border border-[var(--admin-v2-border)] text-sm text-jl-fg-3 transition-colors',
        'outline-none hover:bg-white/[0.05] hover:text-jl-fg-1 focus-visible:ring-2 focus-visible:ring-amber-400/70',
        compact ? 'h-9 w-9 justify-center' : 'w-full px-3 py-2',
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      {compact ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <kbd className="rounded border border-[var(--admin-v2-border)] px-1.5 text-[10px] leading-5">Ctrl K</kbd>
        </>
      )}
    </button>
  )
}
