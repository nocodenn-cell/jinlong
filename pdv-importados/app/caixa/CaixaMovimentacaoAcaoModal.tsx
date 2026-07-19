"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Textarea } from "@/components/ui/forms"
import { ErrorState } from "@/components/ui/feedback"
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

export function CaixaMovimentacaoAcaoModal({
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

  return (
    <DragonModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      sheet
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={processando}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => void confirmar()}
            disabled={processando}
            loading={processando}
          >
            {processando ? m.caixa.movimentacao_processando : submitLabel}
          </Button>
        </>
      }
    >
      <div data-testid="caixa-movimentacao-acao-modal" className="space-y-3">
        <label className="block text-caption text-fg-muted">
          {m.caixa.timeline_modal_motivo_label}
          <Textarea
            ref={motivoRef}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={m.caixa.timeline_modal_motivo_placeholder}
            className="mt-1"
          />
        </label>
        {erroLocal ? <ErrorState dense description={erroLocal} /> : null}
      </div>
    </DragonModal>
  )
}
