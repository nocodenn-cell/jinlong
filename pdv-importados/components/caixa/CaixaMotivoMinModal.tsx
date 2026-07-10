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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        fechar()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, fechar])

  const handleConfirmar = useCallback(() => {
    const t = texto.trim()
    if (t.length < minLength) {
      setErro(m.caixa.msg_motivo_curto)
      return
    }
    onConfirm(t)
    fechar()
  }, [texto, minLength, m.caixa.msg_motivo_curto, onConfirm, fechar])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 dragon-glass-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="caixa-motivo-modal-title"
        className="dragon-elev-2 w-full sm:max-w-md rounded-none sm:rounded-lg max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle id="caixa-motivo-modal-title" className="text-lg text-foreground">
            {title}
          </CardTitle>
          {description ? (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{description}</p>
          ) : null}
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-2">
          <label className="block text-xs text-muted-foreground">
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
