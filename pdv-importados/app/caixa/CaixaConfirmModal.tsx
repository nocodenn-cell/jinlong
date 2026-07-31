"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
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
  /** `danger` (padrão) para ações destrutivas; `primary` para ações de recuperação. */
  confirmVariant?: "danger" | "primary"
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function CaixaConfirmModal({
  open,
  title,
  description,
  m,
  processing = false,
  initialFocus = "cancel",
  confirmLabel,
  confirmVariant = "danger",
  onOpenChange,
  onConfirm,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      if (initialFocus === "confirm") {
        confirmRef.current?.focus()
      } else {
        cancelRef.current?.focus()
      }
    })
  }, [open, initialFocus])

  return (
    <DragonModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      sheet
      footer={
        <>
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={processing}
          >
            {confirmLabel ?? m.comum.confirmar}
          </Button>
        </>
      }
    >
      <div data-testid="caixa-confirm-modal">
        <p className="text-body text-fg-muted">{description}</p>
      </div>
    </DragonModal>
  )
}
