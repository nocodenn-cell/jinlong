"use client"

import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import type { Mensagens } from "@/i18n/getMessages"

type Props = {
  open: boolean
  title: string
  description: string
  m: Mensagens
  processing?: boolean
  initialFocus?: "confirm" | "cancel"
  /** Rótulo do botão de confirmação; padrão `m.comum.confirmar`. */
  confirmLabel?: string
  /** `danger` (padrão) para ações destrutivas; `primary` mapeia para neutral. */
  confirmVariant?: "danger" | "primary"
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/**
 * Confirm do PDV — thin-wrap de ConfirmDialog (IX-CONFIRM).
 * Mantém a API histórica do caixa; o chrome é o SSOT do Design System.
 */
export function CaixaConfirmModal({
  open,
  title,
  description,
  m,
  processing = false,
  confirmLabel,
  confirmVariant = "danger",
  onOpenChange,
  onConfirm,
}: Props) {
  return (
    <ConfirmDialog
      open={open}
      onClose={() => onOpenChange(false)}
      onConfirm={onConfirm}
      title={title}
      description={description}
      confirmLabel={confirmLabel ?? m.comum.confirmar}
      cancelLabel={m.comum.cancelar}
      variant={confirmVariant === "danger" ? "danger" : "neutral"}
      loading={processing}
    />
  )
}
