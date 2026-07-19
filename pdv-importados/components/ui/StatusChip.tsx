import { memo } from 'react'
import { cn } from '@/lib/utils'

export type StatusChipTone =
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'orange'

type StatusChipProps = Readonly<{
  /** Chave de domínio (ex.: ATIVO, PENDENTE) — mapeada para tom. */
  status: string
  label?: string
  className?: string
}>

/** Status operacionais → tom semântico (Estoque, Financeiro, Cadastros). */
const STATUS_TONE: Record<string, StatusChipTone> = {
  CONCLUIDA: 'success',
  ATIVO: 'success',
  EMITIDO: 'success',
  ABERTO: 'info',
  PROCESSANDO: 'info',
  TEM_NF: 'info',
  FECHADO: 'neutral',
  INATIVO: 'neutral',
  RASCUNHO: 'warning',
  CANCELADA: 'danger',
  ERRO: 'danger',
  PARCIAL: 'warning',
  PENDENTE: 'warning',
  SEM_NF: 'warning',
  ALERTA: 'warning',
  CRITICO: 'orange',
}

const TONE_CLASS: Record<StatusChipTone, string> = {
  success:
    'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-strong)]',
  info: 'border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-brand',
  warning:
    'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]',
  danger:
    'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]',
  neutral: 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg-muted',
  orange:
    'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]',
}

/**
 * StatusChip — badge de status operacional reutilizável (Onda 7).
 * Substitui GerenteStatusBadge em código novo.
 */
export const StatusChip = memo(function StatusChip({ status, label, className }: StatusChipProps) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-semibold',
        TONE_CLASS[tone],
        className,
      )}
    >
      {label ?? status}
    </span>
  )
})
