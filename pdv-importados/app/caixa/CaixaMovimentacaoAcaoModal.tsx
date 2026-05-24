"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Mensagens } from "@/i18n/getMessages"
import type { AcaoMovimentacaoTipo } from "@/app/caixa/caixaMovimentacaoTypes"

type Props = {
  open: boolean
  tipo: AcaoMovimentacaoTipo
  processando: boolean
  m: Mensagens
  onOpenChange: (open: boolean) => void
  onConfirm: (motivo: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

export const CaixaMovimentacaoAcaoModal = memo(function CaixaMovimentacaoAcaoModal({
  open,
  tipo,
  processando,
  m,
  onOpenChange,
  onConfirm,
}: Props) {
  const [motivo, setMotivo] = useState("")
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const motivoRef = useRef<HTMLTextAreaElement>(null)

  const title = tipo === "estornar" ? m.caixa.timeline_modal_estornar_titulo : m.caixa.timeline_modal_cancelar_titulo
  const submitLabel =
    tipo === "estornar" ? m.caixa.timeline_modal_confirmar_estornar : m.caixa.timeline_modal_confirmar_cancelar

  const reset = useCallback(() => {
    setMotivo("")
    setErroLocal(null)
  }, [])

  useEffect(() => {
    if (!open) return
    reset()
    queueMicrotask(() => motivoRef.current?.focus())
  }, [open, reset])

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

  const confirmar = useCallback(async () => {
    setErroLocal(null)
    const texto = motivo.trim()
    if (texto.length < 2) {
      setErroLocal(m.caixa.timeline_modal_motivo_invalido)
      return
    }
    const res = await onConfirm(texto)
    if (!res.ok) {
      setErroLocal(res.error)
      return
    }
    onOpenChange(false)
  }, [motivo, m, onConfirm, onOpenChange])

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
        className="dragon-glass-card app-border w-full sm:max-w-md rounded-none sm:rounded-lg border app-surface-text shadow-xl max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle className="text-lg app-surface-text">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-3 overflow-y-auto">
          <label className="block text-xs app-muted">
            {m.caixa.timeline_modal_motivo_label}
            <textarea
              ref={motivoRef}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={m.caixa.timeline_modal_motivo_placeholder}
              className="mt-1 min-h-24 w-full rounded-md px-2 py-1.5 text-xs app-input"
            />
          </label>
          {erroLocal && (
            <p className="text-xs app-badge-warn rounded-md border px-2 py-1" role="alert">
              {erroLocal}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-end px-4 sm:px-6 pb-4 sm:pb-6 pt-0 border-t app-divider mt-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            className="app-btn-neutral"
            onClick={() => onOpenChange(false)}
            disabled={processando}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            className="app-btn-danger"
            onClick={() => void confirmar()}
            disabled={processando}
          >
            {processando ? m.caixa.movimentacao_processando : submitLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
})

CaixaMovimentacaoAcaoModal.displayName = "CaixaMovimentacaoAcaoModal"
