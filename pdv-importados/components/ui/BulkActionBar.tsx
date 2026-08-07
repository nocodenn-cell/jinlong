import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type BulkActionBarProps = {
  selectedCount: number
  selectedLabel: string
  clearLabel?: string
  onClear: () => void
  children: ReactNode
  className?: string
}

/**
 * BulkActionBar — slot de ações em lote (Sprint 0 / IX-BULK).
 * Usar em `CrudListShell` `bulkBar`.
 */
export function BulkActionBar({
  selectedCount,
  selectedLabel,
  clearLabel = 'Limpar seleção',
  onClear,
  children,
  className,
}: BulkActionBarProps) {
  if (selectedCount <= 0) return null
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-card border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2',
        className,
      )}
      role="region"
      aria-label={selectedLabel}
    >
      <span className="text-caption font-medium text-fg">{selectedLabel}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        {clearLabel}
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
