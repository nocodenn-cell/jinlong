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
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"

export type ValidarSenhaGerentePontualResult =
  | { ok: true; token: string }
  | { ok: false; error: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  validando: boolean
  onValidateSenha: (senha: string) => Promise<ValidarSenhaGerentePontualResult>
  onAutorizado: (token: string) => void
}

/**
 * Autorização pontual de gerente (senha → token de uso único), sem a etapa de
 * percentual do CaixaGerenteModal — usada para cancelamento/devolução iniciados
 * pelo operador do caixa (Fase 5, Entrega 2).
 */
export function CaixaGerenteSenhaModal({
  open,
  onOpenChange,
  m,
  validando,
  onValidateSenha,
  onAutorizado,
}: Props) {
  const [senha, setSenha] = useState("")
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const senhaRef = useRef<HTMLInputElement>(null)

  const fechar = useCallback(() => onOpenChange(false), [onOpenChange])

  useEffect(() => {
    if (!open) return
    setSenha("")
    setErroLocal(null)
    queueMicrotask(() => senhaRef.current?.focus())
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

  const handleContinuar = useCallback(async () => {
    if (validando) return
    setErroLocal(null)
    const s = senha.trim()
    if (!s) {
      setErroLocal(m.caixa.msg_senha_obrigatoria)
      return
    }
    const res = await onValidateSenha(s)
    if (!res.ok) {
      setErroLocal(res.error)
      return
    }
    onAutorizado(res.token)
    fechar()
  }, [validando, senha, onValidateSenha, onAutorizado, fechar, m.caixa.msg_senha_obrigatoria])

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
        aria-labelledby="caixa-gerente-senha-modal-title"
        className="dragon-elev-2 w-full sm:max-w-md rounded-none sm:rounded-lg max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle
            id="caixa-gerente-senha-modal-title"
            className="flex items-center gap-2 text-lg app-surface-text"
          >
            <ImperialSealIcon
              className="h-6 w-6 shrink-0 app-accent-text"
              title={m.caixa.aria_selo_gerente}
              pulse
            />
            {m.caixa.caixa_gerente_senha_titulo}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-3 overflow-y-auto">
          <p className="text-xs app-muted">{m.caixa.caixa_gerente_senha_subtitulo}</p>
          <label className="block text-xs app-muted">
            {m.caixa.modal_gerente_passo_senha}
            <Input
              ref={senhaRef}
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={m.caixa.modal_gerente_senha_placeholder}
              disabled={validando}
              className="mt-1 app-input"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleContinuar()
              }}
            />
          </label>
          {erroLocal && (
            <p className="rounded-md border px-2 py-1 text-xs app-badge-warn" role="alert">
              {erroLocal}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-end px-4 sm:px-6 pb-4 sm:pb-6 pt-0 border-t app-divider mt-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            className="app-btn-neutral"
            onClick={fechar}
            disabled={validando}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            className="app-btn-accent"
            onClick={() => void handleContinuar()}
            disabled={validando}
          >
            {validando ? m.caixa.validando_gerente : m.caixa.caixa_gerente_senha_continuar}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
