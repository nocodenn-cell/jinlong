"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"

export type CaixaValorNumericoModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  campoLabel: string
  placeholder?: string
  initial: string
  m: Mensagens
  /** Interpreta texto (aceita vírgula decimal); null = inválido. */
  parseValor: (raw: string) => number | null
  mensagemInvalido: string
  onConfirm: (valor: number) => void
}

export function CaixaValorNumericoModal({
  open,
  onOpenChange,
  title,
  description,
  campoLabel,
  placeholder,
  initial,
  m,
  parseValor,
  mensagemInvalido,
  onConfirm,
}: CaixaValorNumericoModalProps) {
  const [valorStr, setValorStr] = useState(initial)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    setValorStr(initial)
    setErro(null)
    queueMicrotask(() => inputRef.current?.focus())
  }, [open, initial])

  const handleConfirmar = useCallback(() => {
    const v = parseValor(valorStr)
    if (v === null) {
      setErro(mensagemInvalido)
      return
    }
    onConfirm(v)
    fechar()
  }, [valorStr, parseValor, mensagemInvalido, onConfirm, fechar])

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
      <div data-testid="caixa-valor-numerico-modal" className="space-y-2">
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
        <label className="block text-xs font-medium text-foreground">
          {campoLabel}
          <Input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={valorStr}
            onChange={(e) => {
              setValorStr(e.target.value)
              setErro(null)
            }}
            placeholder={placeholder}
            className="mt-1 jl-modal-field"
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
