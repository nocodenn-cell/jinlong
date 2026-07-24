"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Input } from "@/components/ui/forms"
import { ErrorState } from "@/components/ui/feedback"
import type { Mensagens } from "@/i18n/getMessages"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"
import { validarPercentualPermitido } from "@/stores/managerDiscount"

export type MotivoDescontoEnum =
  | 'NAO_ESPECIFICADO'
  | 'ERRO_DIGITACAO'
  | 'NEGOCIACAO'
  | 'CLIENTE_PREFERENCIAL'
  | 'DANO_PRODUTO'
  | 'AUTORIZACAO_COMERCIAL'
  | 'OUTROS'

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
    motivo: MotivoDescontoEnum
    motivoDescricao: string | null
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
  const [passo, setPasso] = useState<"senha" | "motivo" | "percent">("senha")
  const [senha, setSenha] = useState("")
  const [motivo, setMotivo] = useState<MotivoDescontoEnum>('NAO_ESPECIFICADO')
  const [motivoDescricao, setMotivoDescricao] = useState("")
  const [percentStr, setPercentStr] = useState("5")
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{
    token: string
    expiraEm: string
    maxDescontoPercentual: number
  } | null>(null)

  const senhaRef = useRef<HTMLInputElement>(null)
  const motivoRef = useRef<HTMLSelectElement>(null)
  const pctRef = useRef<HTMLInputElement>(null)

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    setPasso("senha")
    setSenha("")
    setMotivo('NAO_ESPECIFICADO')
    setMotivoDescricao("")
    setPercentStr("5")
    setErroLocal(null)
    setCtx(null)
    queueMicrotask(() => senhaRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    if (passo === "motivo") queueMicrotask(() => motivoRef.current?.focus())
    if (passo === "percent") queueMicrotask(() => pctRef.current?.focus())
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
    setMotivo('NAO_ESPECIFICADO')
    setMotivoDescricao("")
    setPasso("motivo")
  }, [validando, senha, onValidateSenha, m.caixa.msg_senha_obrigatoria])

  const handleContinuarMotivo = useCallback(() => {
    setErroLocal(null)
    // NAO_ESPECIFICADO é o placeholder ("Selecione um motivo...") — exige escolha real (auditabilidade).
    if (!motivo || motivo === 'NAO_ESPECIFICADO') {
      setErroLocal("Motivo é obrigatório")
      return
    }
    if (motivo === 'OUTROS' && !motivoDescricao.trim()) {
      setErroLocal("Descrição é obrigatória quando motivo é 'Outros'")
      return
    }
    setPasso("percent")
  }, [motivo, motivoDescricao])

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
      motivo,
      motivoDescricao: motivo === 'OUTROS' ? motivoDescricao : null,
    })
    fechar()
  }, [ctx, percentStr, motivo, motivoDescricao, m.caixa.msg_percentual_invalido, onApply, fechar])

  const handleVoltarDeMotivo = useCallback(() => {
    setPasso("senha")
    setCtx(null)
    setErroLocal(null)
    queueMicrotask(() => senhaRef.current?.focus())
  }, [])

  const handleVoltarDePercent = useCallback(() => {
    setPasso("motivo")
    setErroLocal(null)
    queueMicrotask(() => motivoRef.current?.focus())
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
              onClick={handleVoltarDePercent}
              disabled={validando}
            >
              {m.caixa.modal_gerente_voltar}
            </Button>
            <Button
              type="button"
              variant="primary"
              className="inline-flex items-center gap-2"
              onClick={handleAplicarPercent}
              disabled={validando || !ctx}
            >
              <ImperialSealIcon
                className="h-4 w-4 shrink-0 text-brand drop-shadow-sm"
                title={m.caixa.aria_selo_gerente}
                pulse
              />
              {m.caixa.modal_gerente_aplicar}
            </Button>
          </>
        ) : passo === "motivo" ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleVoltarDeMotivo}
              disabled={validando}
            >
              {m.caixa.modal_gerente_voltar}
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="motivo-next"
              onClick={handleContinuarMotivo}
              disabled={
                validando ||
                !motivo ||
                motivo === 'NAO_ESPECIFICADO' ||
                (motivo === 'OUTROS' && !motivoDescricao.trim())
              }
            >
              {m.caixa.modal_gerente_seguinte}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={fechar}
              disabled={validando}
            >
              {m.comum.cancelar}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleContinuarSenha()}
              disabled={validando}
              loading={validando}
            >
              {validando ? m.caixa.validando_gerente : m.caixa.modal_gerente_seguinte}
            </Button>
          </>
        )
      }
    >
      <div data-testid="caixa-gerente-modal" className="space-y-3">
        {passo === "senha" ? (
          <label className="block text-caption text-fg-muted">
            {m.caixa.modal_gerente_passo_senha}
            <Input
              ref={senhaRef}
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={m.caixa.modal_gerente_senha_placeholder}
              disabled={validando}
              className="mt-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleContinuarSenha()
              }}
            />
          </label>
        ) : passo === "motivo" ? (
          <div className="space-y-3">
            <label className="block text-caption text-fg-muted">
              Motivo do desconto
              <select
                ref={motivoRef}
                data-testid="motivo-select"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as MotivoDescontoEnum)}
                disabled={validando}
                className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-body"
              >
                <option value="NAO_ESPECIFICADO">Selecione um motivo...</option>
                <option value="ERRO_DIGITACAO">Erro de digitação</option>
                <option value="NEGOCIACAO">Negociação com cliente</option>
                <option value="CLIENTE_PREFERENCIAL">Cliente preferencial</option>
                <option value="DANO_PRODUTO">Produto com dano</option>
                <option value="AUTORIZACAO_COMERCIAL">Autorização comercial</option>
                <option value="OUTROS">Outros (especificar)</option>
              </select>
            </label>
            {motivo === 'OUTROS' && (
              <label className="block text-caption text-fg-muted">
                Descrição do motivo
                <textarea
                  data-testid="motivo-descricao"
                  value={motivoDescricao}
                  onChange={(e) => setMotivoDescricao(e.target.value)}
                  placeholder="Descreva o motivo específico (obrigatório)..."
                  disabled={validando}
                  maxLength={500}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-body"
                />
              </label>
            )}
          </div>
        ) : (
          ctx && (
            <>
              <p className="text-caption text-fg-muted">
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAplicarPercent()
                }}
              />
            </>
          )
        )}
        {erroLocal ? <ErrorState dense description={erroLocal} /> : null}
      </div>
    </DragonModal>
  )
}
