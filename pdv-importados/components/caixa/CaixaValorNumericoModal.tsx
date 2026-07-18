"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        fechar()
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [open, fechar])

  const handleConfirmar = useCallback(() => {
    const v = parseValor(valorStr)
    if (v === null) {
      setErro(mensagemInvalido)
      return
    }
    onConfirm(v)
    fechar()
  }, [valorStr, parseValor, mensagemInvalido, onConfirm, fechar])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 dragon-glass-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="caixa-valor-modal-title"
        data-testid="caixa-valor-numerico-modal"
        className="dragon-elev-2 w-full sm:max-w-md rounded-none sm:rounded-lg max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle id="caixa-valor-modal-title" className="text-lg text-slate-50">
            {title}
          </CardTitle>
          {description ? (
            <p className="text-xs text-slate-400 mt-1">{description}</p>
          ) : null}
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-2">
          <label className="block text-xs text-slate-400">
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
        </CardContent>
        <CardFooter className="px-4 sm:px-6 pb-4 sm:pb-6 flex justify-end gap-2">
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
        </CardFooter>
      </Card>
    </div>
  )
}
