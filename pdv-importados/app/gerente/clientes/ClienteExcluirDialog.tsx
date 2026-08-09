'use client'

/**
 * Confirmação de exclusão local (DragonModal danger = diálogo Alert do DS).
 * Não altera ConfirmActionButton global.
 */

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'

type Props = Readonly<{
  open: boolean
  nome: string
  loading?: boolean
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  confirmingLabel: string
  onCancel: () => void
  onConfirm: () => void
}>

export function ClienteExcluirDialog({
  open,
  nome,
  loading = false,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmingLabel,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <DragonModal
      open={open}
      onClose={onCancel}
      variant="danger"
      size="sm"
      icon={AlertTriangle}
      title={title}
      dismissable={!loading}
      closeLabel={cancelLabel}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? confirmingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="pb-1 text-body text-fg-muted">
        {description.replace('{{nome}}', nome)}
      </p>
    </DragonModal>
  )
}
