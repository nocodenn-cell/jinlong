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
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"

export type ValidarSenhaGerenteResult =
  | {
      ok: true
      token: string
      expiraEm: string
      maxDescontoPercentual: number
    }
  | { ok: false; error: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  validando: boolean
  onValidateSenha: (senha: string) => Promise<ValidarSenhaGerenteResult>
  onApply: (payload: {
    token: string
    expiraEm: string
    maxDescontoPercentual: number
    percentual: number
  }) => void
}

export const CaixaGerenteModal = memo(function CaixaGerenteModal({
  open,
  onOpenChange,
  m,
  validando,
  onValidateSenha,
  onApply,
}: Props) {
  const [passo, setPasso] = useState<"senha" | "percent">("senha")
  const [senha, setSenha] = useState("")
  const [percentStr, setPercentStr] = useState("5")
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{
    token: string
    expiraEm: string
    maxDescontoPercentual: number
  } | null>(null)

  const senhaRef = useRef<HTMLInputElement>(null)
  const pctRef = useRef<HTMLInputElement>(null)

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    setPasso("senha")
    setSenha("")
    setPercentStr("5")
    setErroLocal(null)
    setCtx(null)
    queueMicrotask(() => senhaRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open || passo !== "percent") return
    queueMicrotask(() => pctRef.current?.focus())
  }, [open, passo])

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

  const handleContinuarSenha = useCallback(async () => {
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
    setCtx({
      token: res.token,
      expiraEm: res.expiraEm,
      maxDescontoPercentual: res.maxDescontoPercentual,
    })
    setPasso("percent")
  }, [validando, senha, onValidateSenha, m.caixa.msg_senha_obrigatoria])

  const handleAplicarPercent = useCallback(() => {
    setErroLocal(null)
    if (!ctx) return
    const percentual = Number(percentStr.replace(",", "."))
    if (
      !Number.isFinite(percentual) ||
      percentual <= 0 ||
      percentual > ctx.maxDescontoPercentual
    ) {
      setErroLocal(m.caixa.msg_percentual_invalido)
      return
    }
    onApply({
      ...ctx,
      percentual: Math.round(percentual * 100) / 100,
    })
    fechar()
  }, [ctx, percentStr, m.caixa.msg_percentual_invalido, onApply, fechar])

  const handleVoltar = useCallback(() => {
    setPasso("senha")
    setCtx(null)
    setErroLocal(null)
    queueMicrotask(() => senhaRef.current?.focus())
  }, [])

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
        aria-labelledby="caixa-gerente-modal-title"
        className="dragon-glass-card app-border w-full sm:max-w-md rounded-none sm:rounded-lg border app-surface-text shadow-xl max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle
            id="caixa-gerente-modal-title"
            className="flex items-center gap-2 text-lg app-surface-text"
          >
            {passo === "senha" ? (
              <ImperialSealIcon
                className="h-6 w-6 shrink-0 app-accent-text"
                title={m.caixa.aria_selo_gerente}
                pulse
              />
            ) : null}
            {m.caixa.modal_gerente_titulo}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-3 overflow-y-auto">
          {passo === "senha" ? (
            <>
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
                    if (e.key === "Enter") void handleContinuarSenha()
                  }}
                />
              </label>
            </>
          ) : (
            ctx && (
              <>
                <p className="text-xs app-muted">
                  {caixaFmt(m.caixa.modal_gerente_passo_percentual, {
                    max: ctx.maxDescontoPercentual.toFixed(1),
                  })}
                </p>
                <Input
                  ref={pctRef}
                  inputMode="decimal"
                  value={percentStr}
                  onChange={(e) => setPercentStr(e.target.value)}
                  placeholder={m.caixa.modal_gerente_percent_placeholder}
                  disabled={validando}
                  className="app-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAplicarPercent()
                  }}
                />
              </>
            )
          )}
          {erroLocal && (
            <p className="rounded-md border px-2 py-1 text-xs app-badge-warn" role="alert">
              {erroLocal}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-end px-4 sm:px-6 pb-4 sm:pb-6 pt-0 border-t app-divider mt-2 pt-3">
          {passo === "percent" ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="app-btn-neutral"
                onClick={handleVoltar}
                disabled={validando}
              >
                {m.caixa.modal_gerente_voltar}
              </Button>
              <Button
                type="button"
                className="app-btn-accent inline-flex items-center gap-2"
                onClick={handleAplicarPercent}
                disabled={validando || !ctx}
              >
                <ImperialSealIcon
                  className="h-4 w-4 shrink-0 app-accent-text drop-shadow-sm"
                  title={m.caixa.aria_selo_gerente}
                  pulse
                />
                {m.caixa.modal_gerente_aplicar}
              </Button>
            </>
          ) : (
            <>
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
                onClick={() => void handleContinuarSenha()}
                disabled={validando}
              >
                {validando ? m.caixa.validando_gerente : m.caixa.modal_gerente_seguinte}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
})

CaixaGerenteModal.displayName = "CaixaGerenteModal"
