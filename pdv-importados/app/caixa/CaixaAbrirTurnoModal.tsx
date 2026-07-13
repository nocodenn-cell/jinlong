"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  operadorLabel: string
  initialValor?: string
  parseValor: (raw: string) => number | null
  onConfirm: (valorInicial: number) => void
}

/**
 * Abertura de turno: mostra o operador logado (quem abre) + valor do fundo.
 * Fase A — sem troca de operador no terminal (operador = sessão auth).
 */
export function CaixaAbrirTurnoModal({
  open,
  onOpenChange,
  m,
  operadorLabel,
  initialValor = "0",
  parseValor,
  onConfirm,
}: Props) {
  const [valorStr, setValorStr] = useState(initialValor)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tituloId = useId()

  const fechar = useCallback(() => onOpenChange(false), [onOpenChange])

  useEffect(() => {
    if (!open) return
    setValorStr(initialValor)
    setErro(null)
    queueMicrotask(() => inputRef.current?.focus())
  }, [open, initialValor])

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
    if (v === null || v < 0) {
      setErro(m.caixa.msg_valor_monetario_invalido)
      return
    }
    onConfirm(v)
    fechar()
  }, [valorStr, parseValor, m.caixa.msg_valor_monetario_invalido, onConfirm, fechar])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 dragon-glass-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        data-testid="caixa-abrir-turno-modal"
        className="w-full rounded-none border border-jl-border-1 bg-jl-surface-elev text-jl-fg-1 shadow-lg sm:max-w-md sm:rounded-lg"
        onMouseDown={(e) => e.stopPropagation()}
        data-caixa-atalho-bloqueado="true"
      >
        <header className="border-b border-jl-border-1 px-4 py-3">
          <h2 id={tituloId} className="text-lg font-semibold">
            {m.caixa.abrir_turno_titulo}
          </h2>
          <p className="mt-1 text-xs text-jl-fg-3">{m.caixa.abrir_turno_descricao}</p>
        </header>
        <div className="space-y-3 px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-jl-fg-3">
              {m.caixa.abrir_turno_operador}
            </p>
            <p className="mt-0.5 font-semibold">{operadorLabel}</p>
          </div>
          <label className="block text-xs text-jl-fg-3">
            {m.caixa.abrir_turno_valor}
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
              placeholder="0,00"
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
        <footer className={cn("flex justify-end gap-2 border-t border-jl-border-1 px-4 py-3")}>
          <Button type="button" variant="secondary" onClick={fechar}>
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            className="bg-success text-success-foreground hover:bg-success/90"
            onClick={handleConfirmar}
          >
            {m.caixa.abrir}
          </Button>
        </footer>
      </div>
    </div>
  )
}
