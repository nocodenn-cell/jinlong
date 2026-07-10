"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import type { TipoMovimentacaoUi } from "@/app/caixa/caixaMovimentacaoTypes"
import { formatDecimalBRL, parseBRL } from "@/lib/format/money"

type Props = {
  open: boolean
  tipo: TipoMovimentacaoUi
  saldoEstimado: number
  limiteSangriaSemGerente: number
  processando: boolean
  m: Mensagens
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: {
    valor: number
    motivoCodigo: string
    motivo: string
    gerenteSenha?: string
  }) => Promise<{ ok: true } | { ok: false; error: string }>
}

const MOTIVOS_BASE = [
  "TROCO_INICIAL",
  "PAGAMENTO_FORNECEDOR",
  "RETIRADA_DEPOSITO",
  "OUTRO",
] as const

const SUGESTOES = [50, 100, 200]

export function CaixaMovimentacaoModal({
  open,
  tipo,
  saldoEstimado,
  limiteSangriaSemGerente,
  processando,
  m,
  onOpenChange,
  onSubmit,
}: Props) {
  const [valorStr, setValorStr] = useState("")
  const [motivoCodigo, setMotivoCodigo] = useState<string>(MOTIVOS_BASE[0])
  const [motivoOutro, setMotivoOutro] = useState("")
  const [gerenteSenha, setGerenteSenha] = useState("")
  const [erroLocal, setErroLocal] = useState<string | null>(null)

  const valorRef = useRef<HTMLInputElement>(null)
  const senhaRef = useRef<HTMLInputElement>(null)

  const title = tipo === "sangria" ? m.caixa.modal_sangria_titulo : m.caixa.modal_suprimento_titulo
  const precisaSenhaGerente =
    tipo === "sangria" && Number(valorStr.replace(",", ".")) > limiteSangriaSemGerente

  const motivoLabel = useMemo(
    () => ({
      TROCO_INICIAL: m.caixa.motivo_troco_inicial,
      PAGAMENTO_FORNECEDOR: m.caixa.motivo_pagamento_fornecedor,
      RETIRADA_DEPOSITO: m.caixa.motivo_retirada_deposito,
      OUTRO: m.caixa.motivo_outro,
    }),
    [m],
  )

  const limparEstado = useCallback(() => {
    setValorStr("")
    setMotivoCodigo(MOTIVOS_BASE[0])
    setMotivoOutro("")
    setGerenteSenha("")
    setErroLocal(null)
  }, [])

  useEffect(() => {
    if (!open) return
    limparEstado()
    queueMicrotask(() => valorRef.current?.focus())
  }, [open, limparEstado])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open || !precisaSenhaGerente) return
    queueMicrotask(() => senhaRef.current?.focus())
  }, [open, precisaSenhaGerente])

  const motivoFinal = motivoCodigo === "OUTRO" ? motivoOutro.trim() : motivoLabel[motivoCodigo as keyof typeof motivoLabel]

  const handleSalvar = useCallback(async () => {
    setErroLocal(null)
    const valor = parseBRL(valorStr)
    if (valor === null || valor <= 0) {
      setErroLocal(m.caixa.movimentacao_valor_invalido)
      return
    }
    if (tipo === "sangria" && valor > saldoEstimado) {
      setErroLocal(
        caixaFmt(m.caixa.movimentacao_saldo_insuficiente, {
          saldo: formatDecimalBRL(saldoEstimado),
        }),
      )
      return
    }
    if (!motivoFinal || motivoFinal.length < 2) {
      setErroLocal(m.caixa.movimentacao_motivo_invalido)
      return
    }
    if (precisaSenhaGerente && !gerenteSenha.trim()) {
      setErroLocal(m.caixa.msg_senha_obrigatoria)
      return
    }

    const res = await onSubmit({
      valor: Math.round(valor * 100) / 100,
      motivoCodigo,
      motivo: motivoFinal,
      gerenteSenha: precisaSenhaGerente ? gerenteSenha.trim() : undefined,
    })

    if (!res.ok) {
      setErroLocal(res.error)
      return
    }
    onOpenChange(false)
  }, [
    valorStr,
    tipo,
    saldoEstimado,
    motivoFinal,
    precisaSenhaGerente,
    gerenteSenha,
    onSubmit,
    motivoCodigo,
    m,
    onOpenChange,
  ])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 dragon-glass-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        className="dragon-elev-2 w-full sm:max-w-md rounded-none sm:rounded-lg max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle className="text-lg app-surface-text">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-3 overflow-y-auto">
          <label className="block text-xs app-muted">
            {m.caixa.modal_movimentacao_valor}
            <Input
              ref={valorRef}
              inputMode="decimal"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
              placeholder="0,00"
              className="mt-1 app-input"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSalvar()
              }}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant="outline"
                className="app-btn-neutral"
                onClick={() => setValorStr(String(s))}
              >
                {m.caixa.moeda_prefixo} {formatDecimalBRL(s)}
              </Button>
            ))}
          </div>

          <p className="text-xs app-subtle">
            {caixaFmt(m.caixa.modal_movimentacao_saldo_estimado, {
              saldo: formatDecimalBRL(saldoEstimado),
            })}
          </p>

          <label className="block text-xs app-muted">
            {m.caixa.modal_movimentacao_motivo}
            <select
              value={motivoCodigo}
              onChange={(e) => setMotivoCodigo(e.target.value)}
              className="mt-1 w-full h-9 rounded-md px-2 py-1.5 text-xs app-select"
            >
              {MOTIVOS_BASE.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {motivoLabel[codigo]}
                </option>
              ))}
            </select>
          </label>

          {motivoCodigo === "OUTRO" && (
            <label className="block text-xs app-muted">
              {m.caixa.modal_movimentacao_outro}
              <Input
                value={motivoOutro}
                onChange={(e) => setMotivoOutro(e.target.value)}
                placeholder={m.caixa.modal_movimentacao_outro_placeholder}
                className="mt-1 app-input"
              />
            </label>
          )}

          {precisaSenhaGerente && (
            <label className="block text-xs app-accent-text">
              <span className="mb-1 flex items-center gap-2 app-accent-text">
                <ImperialSealIcon
                  className="h-5 w-5 shrink-0 text-destructive"
                  title={m.caixa.aria_selo_gerente}
                  pulse
                />
                {caixaFmt(m.caixa.modal_movimentacao_senha_gerente, {
                  limite: formatDecimalBRL(limiteSangriaSemGerente),
                })}
              </span>
              <Input
                ref={senhaRef}
                type="password"
                autoComplete="current-password"
                value={gerenteSenha}
                onChange={(e) => setGerenteSenha(e.target.value)}
                placeholder={m.caixa.modal_gerente_senha_placeholder}
                className="mt-1 app-input"
              />
            </label>
          )}

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
            onClick={() => onOpenChange(false)}
            disabled={processando}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            className="app-btn-accent"
            onClick={() => void handleSalvar()}
            disabled={processando}
            aria-busy={processando}
          >
            {processando ? m.caixa.movimentacao_processando : m.comum.confirmar}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
