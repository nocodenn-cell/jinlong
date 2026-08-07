'use client'

import { AlertTriangle } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'

export type ConfirmDialogVariant = 'danger' | 'neutral'

type ConfirmDialogProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmDialogVariant
  loading?: boolean
}

/**
 * ConfirmDialog — único confirm do DS (Sprint 0 / IX-CONFIRM).
 * Esc/backdrop fecham; foco gerenciado pelo DragonModal.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'neutral',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <DragonModal
      open={open}
      onClose={onClose}
      title={title}
      variant={variant === 'danger' ? 'danger' : 'default'}
      icon={variant === 'danger' ? AlertTriangle : undefined}
      size="sm"
      dismissable={!loading}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
            autoFocus={variant !== 'danger'}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description ? (
        <p className="text-body text-fg-muted">{description}</p>
      ) : (
        <span className="sr-only">{title}</span>
      )}
    </DragonModal>
  )
}
