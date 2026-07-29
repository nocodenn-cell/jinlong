"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"

export type CaixaMotivoMinModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  minLength?: number
  m: Mensagens
  onConfirm: (motivo: string) => void
}

export function CaixaMotivoMinModal({
  open,
  onOpenChange,
  title,
  description,
  minLength = 5,
  m,
  onConfirm,
}: CaixaMotivoMinModalProps) {
  const [texto, setTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    setTexto("")
    setErro(null)
    queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  const handleConfirmar = useCallback(() => {
    const t = texto.trim()
    if (t.length < minLength) {
      setErro(m.caixa.msg_motivo_curto)
      return
    }
    onConfirm(t)
    fechar()
  }, [texto, minLength, m.caixa.msg_motivo_curto, onConfirm, fechar])

  return (
    <DragonModal
      open={open}
      onClose={fechar}
      title={title}
      sheet
      footer={
        <>
          <Button type="button" variant="secondary" onClick={fechar}>
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            className="bg-success text-success-foreground hover:bg-success/90"
            onClick={handleConfirmar}
          >
            {m.comum.confirmar}
          </Button>
        </>
      }
    >
      <div data-testid="caixa-motivo-min-modal" className="space-y-2">
        {description ? (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{description}</p>
        ) : null}
        <label className="block text-xs font-medium text-foreground">
          {m.caixa.modal_motivo_label}
          <Input
            ref={inputRef}
            type="text"
            autoComplete="off"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setErro(null)
            }}
            placeholder={m.caixa.modal_motivo_placeholder}
            className="mt-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleConfirmar()
              }
            }}
          />
        </label>
        {erro ? (
          <p className="text-xs text-destructive" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </DragonModal>
  )
}
