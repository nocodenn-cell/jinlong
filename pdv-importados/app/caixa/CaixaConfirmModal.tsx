"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 dragon-glass-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        className="dragon-elev-2 w-full sm:max-w-md rounded-none sm:rounded-lg max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle className="text-lg app-surface-text">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <p className="text-sm app-muted">{description}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-end px-4 sm:px-6 pb-4 sm:pb-6 pt-0 border-t app-divider mt-3 pt-3">
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
        </CardFooter>
      </Card>
    </div>
  )
}
