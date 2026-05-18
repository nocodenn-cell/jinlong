"use client"

import { useEffect, useRef, useState } from "react"
import type { Mensagens } from "@/i18n/getMessages"

type Props = Readonly<{
  m: Mensagens
  open: boolean
  onClose: () => void
  onConfirmar: (identificacao: string) => void
  salvando?: boolean
}>

export function CaixaIdentificacaoModal({ m, open, onClose, onConfirmar, salvando }: Props) {
  const [valor, setValor] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValor("")
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    if (open) window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirmar(valor.trim())
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={m.caixa.suspender_venda}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">{m.caixa.suspender_venda}</span>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="identificacao-suspensao" className="text-xs font-medium text-muted-foreground">
              {m.caixa.identificacao_cliente}
            </label>
            <input
              id="identificacao-suspensao"
              ref={inputRef}
              type="text"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={m.caixa.identificacao_cliente}
              maxLength={80}
              disabled={salvando}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="app-btn-neutral rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {m.comum.cancelar}
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-500 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvando ? "Salvando…" : m.caixa.suspender_venda}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
