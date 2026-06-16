/**
 * FastProduct — StatusPill
 *
 * Pílula de status genérica para uso em qualquer tabela/tela (vendas, estoque,
 * produtos, clientes). Mesma paleta de tons usada em `badges.tsx`
 * (StatusBadge/PaymentBadge/etc.), só que sem amarração a um domínio
 * específico — para módulos que ainda não têm um badge dedicado.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export type StatusPillTone = 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral'

const TONE_STYLE: Record<StatusPillTone, React.CSSProperties> = {
  success: {
    background: 'var(--fp-success-bg)',
    border: '1px solid var(--fp-success-border)',
    color: 'var(--fp-success)',
  },
  warning: {
    background: 'var(--fp-warning-bg)',
    border: '1px solid var(--fp-warning-border)',
    color: 'var(--fp-warning)',
  },
  danger: {
    background: 'var(--fp-danger-bg)',
    border: '1px solid var(--fp-danger-border)',
    color: 'var(--fp-danger)',
  },
  info: {
    background: 'var(--fp-info-bg)',
    border: '1px solid var(--fp-info-border)',
    color: 'var(--fp-info)',
  },
  purple: {
    background: 'var(--fp-purple-bg)',
    border: '1px solid var(--fp-purple-border)',
    color: 'var(--fp-purple)',
  },
  neutral: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--fp-border)',
    color: 'var(--fp-text-secondary)',
  },
}

export function StatusPill({
  tone,
  children,
  className,
  title,
}: {
  tone: StatusPillTone
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px]',
        'text-[11px] font-medium leading-none',
        className,
      )}
      style={TONE_STYLE[tone]}
      title={title}
    >
      {children}
    </span>
  )
}
