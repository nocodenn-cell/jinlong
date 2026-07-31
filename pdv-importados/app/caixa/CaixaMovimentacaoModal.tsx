"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Input, Select } from "@/components/ui/forms"
import { ErrorState } from "@/components/ui/feedback"
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
    /**
     * Estável entre reenvios da MESMA tentativa do operador. Gerar uma chave
     * nova a cada clique anula o índice único `uq_movimentacoes_caixa_idempotency`
     * e permite registrar a mesma sangria duas vezes quando a resposta se perde.
     */
    idempotencyKey: string
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
  /**
   * Uma chave por abertura do modal. Renovada só quando o operador cancela ou a
   * operação conclui (ambos fecham o modal), nunca entre reenvios após erro.
   */
  const [idempotencyKey, setIdempotencyKey] = useState<string>("")

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
    setIdempotencyKey(crypto.randomUUID())
    queueMicrotask(() => valorRef.current?.focus())
  }, [open, limparEstado])

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
      idempotencyKey,
    })

    if (!res.ok) {
      // Mantém `idempotencyKey`: o reenvio precisa ser reconhecido como a mesma
      // operação caso a primeira tentativa tenha gravado antes de falhar.
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
    idempotencyKey,
    onSubmit,
    motivoCodigo,
    m,
    onOpenChange,
  ])

  return (
    <DragonModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      sheet
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={processando}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleSalvar()}
            disabled={processando}
            loading={processando}
          >
            {processando ? m.caixa.movimentacao_processando : m.comum.confirmar}
          </Button>
        </>
      }
    >
      <div data-testid="caixa-movimentacao-modal" className="space-y-3">
        <label className="block text-caption text-fg-muted">
          {m.caixa.modal_movimentacao_valor}
          <Input
            ref={valorRef}
            inputMode="decimal"
            value={valorStr}
            onChange={(e) => setValorStr(e.target.value)}
            placeholder="0,00"
            className="mt-1"
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
              onClick={() => setValorStr(String(s))}
            >
              {m.caixa.moeda_prefixo} {formatDecimalBRL(s)}
            </Button>
          ))}
        </div>

        <p className="text-caption text-fg-subtle">
          {caixaFmt(m.caixa.modal_movimentacao_saldo_estimado, {
            saldo: formatDecimalBRL(saldoEstimado),
          })}
        </p>

        <label className="block text-caption text-fg-muted">
          {m.caixa.modal_movimentacao_motivo}
          <Select
            value={motivoCodigo}
            onChange={(e) => setMotivoCodigo(e.target.value)}
            className="mt-1"
            controlSize="sm"
          >
            {MOTIVOS_BASE.map((codigo) => (
              <option key={codigo} value={codigo}>
                {motivoLabel[codigo]}
              </option>
            ))}
          </Select>
        </label>

        {motivoCodigo === "OUTRO" && (
          <label className="block text-caption text-fg-muted">
            {m.caixa.modal_movimentacao_outro}
            <Input
              value={motivoOutro}
              onChange={(e) => setMotivoOutro(e.target.value)}
              placeholder={m.caixa.modal_movimentacao_outro_placeholder}
              className="mt-1"
            />
          </label>
        )}

        {precisaSenhaGerente && (
          <label className="block text-caption text-brand">
            <span className="mb-1 flex items-center gap-2 text-brand">
              <ImperialSealIcon
                className="h-5 w-5 shrink-0 text-[var(--color-danger-strong)]"
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
              className="mt-1"
            />
          </label>
        )}

        {erroLocal ? <ErrorState dense description={erroLocal} /> : null}
      </div>
    </DragonModal>
  )
}
