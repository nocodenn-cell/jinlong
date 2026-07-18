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
            variant="ghost"
            className="app-btn-neutral"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            className="app-btn-danger"
            onClick={onConfirm}
            disabled={processing}
          >
            {m.comum.confirmar}
          </Button>
        </>
      }
    >
      <div data-testid="caixa-confirm-modal">
        <p className="text-sm app-muted">{description}</p>
      </div>
    </DragonModal>
  )
}
