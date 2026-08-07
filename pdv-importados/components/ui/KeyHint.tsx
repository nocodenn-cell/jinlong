import { cn } from '@/lib/utils'

type KeyHintProps = {
  children: string
  /** Estilo sobre botão brand (PDV finalizar). */
  onBrand?: boolean
  className?: string
}

/**
 * KeyHint — tecla visível em botões/atalhos (Sprint 0 / IX-SHORTCUT).
 * `aria-hidden`: o rótulo do controle já anuncia a ação.
 */
export function KeyHint({ children, onBrand = false, className }: KeyHintProps) {
  return (
    <kbd
      aria-hidden
      className={cn(
        'ml-2 hidden rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none sm:inline-block',
        onBrand
          ? 'border-white/30 bg-white/15 text-white/90'
          : 'border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-fg-subtle)]',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
