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
import type { Mensagens } from "@/src/lib/i18n/getMessages"
import { caixaFmt } from "@/app/caixa/caixaI18n"

export type TipoMovimentacaoUi = "suprimento" | "sangria"

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
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open || !precisaSenhaGerente) return
    queueMicrotask(() => senhaRef.current?.focus())
  }, [open, precisaSenhaGerente])

  const motivoFinal = motivoCodigo === "OUTRO" ? motivoOutro.trim() : motivoLabel[motivoCodigo as keyof typeof motivoLabel]

  const handleSalvar = useCallback(async () => {
    setErroLocal(null)
    const valor = Number(valorStr.replace(",", "."))
    if (!Number.isFinite(valor) || valor <= 0) {
      setErroLocal(m.caixa.movimentacao_valor_invalido)
      return
    }
    if (tipo === "sangria" && valor > saldoEstimado) {
      setErroLocal(
        caixaFmt(m.caixa.movimentacao_saldo_insuficiente, {
          saldo: saldoEstimado.toFixed(2),
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        className="w-full sm:max-w-md rounded-none sm:rounded-lg border-slate-700 bg-slate-900 text-slate-50 shadow-xl max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle className="text-lg text-slate-50">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-3 overflow-y-auto">
          <label className="block text-xs text-slate-400">
            {m.caixa.modal_movimentacao_valor}
            <Input
              ref={valorRef}
              inputMode="decimal"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
              placeholder="0,00"
              className="mt-1 bg-slate-800 border-slate-600 text-slate-100"
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
                className="border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                onClick={() => setValorStr(String(s))}
              >
                {m.caixa.moeda_prefixo} {s.toFixed(2)}
              </Button>
            ))}
          </div>

          <p className="text-xs text-slate-300">
            {caixaFmt(m.caixa.modal_movimentacao_saldo_estimado, {
              saldo: saldoEstimado.toFixed(2),
            })}
          </p>

          <label className="block text-xs text-slate-400">
            {m.caixa.modal_movimentacao_motivo}
            <select
              value={motivoCodigo}
              onChange={(e) => setMotivoCodigo(e.target.value)}
              className="mt-1 w-full h-9 rounded-md bg-slate-800 border border-slate-600 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {MOTIVOS_BASE.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {motivoLabel[codigo]}
                </option>
              ))}
            </select>
          </label>

          {motivoCodigo === "OUTRO" && (
            <label className="block text-xs text-slate-400">
              {m.caixa.modal_movimentacao_outro}
              <Input
                value={motivoOutro}
                onChange={(e) => setMotivoOutro(e.target.value)}
                placeholder={m.caixa.modal_movimentacao_outro_placeholder}
                className="mt-1 bg-slate-800 border-slate-600 text-slate-100"
              />
            </label>
          )}

          {precisaSenhaGerente && (
            <label className="block text-xs text-amber-300">
              {caixaFmt(m.caixa.modal_movimentacao_senha_gerente, {
                limite: limiteSangriaSemGerente.toFixed(2),
              })}
              <Input
                ref={senhaRef}
                type="password"
                autoComplete="current-password"
                value={gerenteSenha}
                onChange={(e) => setGerenteSenha(e.target.value)}
                placeholder={m.caixa.modal_gerente_senha_placeholder}
                className="mt-1 bg-slate-800 border-slate-600 text-slate-100"
              />
            </label>
          )}

          {erroLocal && (
            <p className="text-xs text-amber-300" role="alert">
              {erroLocal}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-end px-4 sm:px-6 pb-4 sm:pb-6 pt-0 border-t border-slate-800/80 mt-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            className="text-slate-400 hover:text-slate-200"
            onClick={() => onOpenChange(false)}
            disabled={processando}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
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
