"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"
import { validarPercentualPermitido } from "@/stores/managerDiscount"

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

export function CaixaGerenteModal({
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
    const validacao = validarPercentualPermitido(percentual, ctx.maxDescontoPercentual)
    if (!validacao.ok || !Number.isFinite(percentual) || percentual <= 0) {
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

  return (
    <DragonModal
      open={open}
      onClose={fechar}
      title={
        <span className="flex items-center gap-2">
          {passo === "senha" ? (
            <ImperialSealIcon
              className="h-6 w-6 shrink-0 app-accent-text"
              title={m.caixa.aria_selo_gerente}
              pulse
            />
          ) : null}
          {m.caixa.modal_gerente_titulo}
        </span>
      }
      sheet
      closeLabel={m.comum.fechar}
      footer={
        passo === "percent" ? (
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
        )
      }
    >
      <div data-testid="caixa-gerente-modal" className="space-y-3">
        {passo === "senha" ? (
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
      </div>
    </DragonModal>
  )
}
