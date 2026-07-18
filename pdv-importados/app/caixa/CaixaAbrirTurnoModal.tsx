"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"

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

  const fechar = useCallback(() => onOpenChange(false), [onOpenChange])

  useEffect(() => {
    if (!open) return
    setValorStr(initialValor)
    setErro(null)
    queueMicrotask(() => inputRef.current?.focus())
  }, [open, initialValor])

  const handleConfirmar = useCallback(() => {
    const v = parseValor(valorStr)
    if (v === null || v < 0) {
      setErro(m.caixa.msg_valor_monetario_invalido)
      return
    }
    onConfirm(v)
    fechar()
  }, [valorStr, parseValor, m.caixa.msg_valor_monetario_invalido, onConfirm, fechar])

  return (
    <DragonModal
      open={open}
      onClose={fechar}
      title={m.caixa.abrir_turno_titulo}
      subtitle={m.caixa.abrir_turno_descricao}
      sheet
      closeLabel={m.comum.fechar}
      data-testid="caixa-abrir-turno-modal"
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
            {m.caixa.abrir}
          </Button>
        </>
      }
    >
      <div className="space-y-3" data-caixa-atalho-bloqueado="true">
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
    </DragonModal>
  )
}
