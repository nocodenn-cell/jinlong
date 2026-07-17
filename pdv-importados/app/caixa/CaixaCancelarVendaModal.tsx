"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { Mensagens } from "@/i18n/getMessages"

type Props = {
  open: boolean
  m: Mensagens
  processing?: boolean
  erro?: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (motivo: string) => void
}

/** Motivo do cancelamento (Fase 5, Entrega 2 — cancelamento direto do caixa). */
export function CaixaCancelarVendaModal({
  open,
  m,
  processing = false,
  erro = null,
  onOpenChange,
  onConfirm,
}: Props) {
  const [motivo, setMotivo] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setMotivo("")
    queueMicrotask(() => textareaRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open) return null

  const motivoTrim = motivo.trim()
  const valido = motivoTrim.length >= 2 && motivoTrim.length <= 500

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
          <CardTitle className="text-lg app-surface-text">
            {m.caixa.caixa_cancelar_venda_titulo}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-2">
          <label className="block text-xs app-muted" htmlFor="caixa-cancelar-motivo">
            {m.caixa.caixa_cancelar_venda_motivo_label}
          </label>
          <textarea
            id="caixa-cancelar-motivo"
            ref={textareaRef}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
            minLength={2}
            maxLength={500}
            rows={3}
            disabled={processing}
            className="w-full resize-y rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm text-jl-fg-1 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:opacity-60"
          />
          {erro && (
            <p className="rounded-md border px-2 py-1 text-xs app-badge-warn" role="alert">
              {erro}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-end px-4 sm:px-6 pb-4 sm:pb-6 pt-0 border-t app-divider mt-3 pt-3">
          <Button
            type="button"
            variant="ghost"
            className="app-btn-neutral"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            className="app-btn-danger"
            onClick={() => onConfirm(motivoTrim)}
            disabled={processing || !valido}
          >
            {m.caixa.caixa_cancelar_venda_confirmar}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
