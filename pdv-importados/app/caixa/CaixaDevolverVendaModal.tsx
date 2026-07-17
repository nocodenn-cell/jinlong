"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { Mensagens } from "@/i18n/getMessages"
import { formatDecimalBRL } from "@/lib/format/money"
import { labelFormaPagamentoVenda } from "@/lib/format/vendaLabels"
import { devolverVendaCaixa, type VendaDetalhe } from "@/app/caixa/actions"
import {
  FORMAS_ESTORNO_DEVOLUCAO,
  type DevolverVendaInput,
} from "@/app/gerente/vendas/parseDevolverVendaForm"

type Props = {
  open: boolean
  venda: VendaDetalhe | null
  gerenteToken: string | null
  m: Mensagens
  onClose: () => void
  onConcluido: () => void
}

type SelecaoItem = Readonly<{ itemVendaId: string; quantidade: number }>

function qtdDisponivel(item: VendaDetalhe["itens"][number]): number {
  return Math.max(0, item.quantidade - item.quantidade_devolvida)
}

function labelFormaEstorno(forma: string, m: Mensagens): string {
  if (forma === "CREDITO_CLIENTE") return "Abater do crédito do cliente"
  return labelFormaPagamentoVenda(forma, m)
}

/** Devolução parcial a partir do caixa (Fase 5, Entrega 2). */
export function CaixaDevolverVendaModal({ open, venda, gerenteToken, m, onClose, onConcluido }: Props) {
  const [motivo, setMotivo] = useState("")
  const [formaEstorno, setFormaEstorno] =
    useState<(typeof FORMAS_ESTORNO_DEVOLUCAO)[number]>("PIX")
  const [selecionados, setSelecionados] = useState<Record<string, number>>({})
  const [idempotencyKey, setIdempotencyKey] = useState<string>("")
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open || !venda) return
    setMotivo("")
    setFormaEstorno(venda.tem_conta_receber ? "CREDITO_CLIENTE" : "PIX")
    setSelecionados({})
    setErro(null)
    setIdempotencyKey(crypto.randomUUID())
    queueMicrotask(() => textareaRef.current?.focus())
  }, [open, venda])

  const valorEstorno = useMemo(() => {
    if (!venda) return 0
    const total = venda.itens.reduce((acc, item) => {
      const q = selecionados[item.id] ?? 0
      if (q <= 0) return acc
      return acc + item.preco_unitario * q
    }, 0)
    return Math.round(total * 100) / 100
  }, [venda, selecionados])

  if (!open || !venda) return null

  const motivoTrim = motivo.trim()
  const itensPayload: SelecaoItem[] = venda.itens
    .filter((i) => (selecionados[i.id] ?? 0) > 0)
    .map((i) => ({ itemVendaId: i.id, quantidade: selecionados[i.id] ?? 0 }))
  const podeEnviar =
    motivoTrim.length >= 2 &&
    motivoTrim.length <= 500 &&
    itensPayload.length > 0 &&
    valorEstorno > 0

  function alterarQtd(itemId: string, max: number, delta: number) {
    setSelecionados((prev) => {
      const atual = prev[itemId] ?? 0
      const prox = Math.min(max, Math.max(0, atual + delta))
      return { ...prev, [itemId]: prox }
    })
  }

  async function handleConfirmar() {
    if (!podeEnviar || processando) return
    setProcessando(true)
    setErro(null)
    try {
      const input: DevolverVendaInput = {
        vendaId: venda!.id,
        idempotencyKey,
        motivo: motivoTrim,
        tipo: "DEVOLUCAO",
        itens: itensPayload,
        valorEstorno,
        formaEstorno,
        gerenteToken: gerenteToken ?? undefined,
      }
      const res = await devolverVendaCaixa(input)
      if (!res.ok) {
        setErro(res.error)
        return
      }
      onConcluido()
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : m.comum.erro)
    } finally {
      setProcessando(false)
    }
  }

  const formasDisponiveis = FORMAS_ESTORNO_DEVOLUCAO.filter((f) =>
    f === "CREDITO_CLIENTE" ? venda.tem_conta_receber : true,
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 dragon-glass-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !processando) onClose()
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        className="dragon-elev-2 w-full sm:max-w-lg rounded-none sm:rounded-lg max-h-[92vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle className="text-lg app-surface-text">
            {m.caixa.caixa_devolver_venda_titulo}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <p className="text-xs font-medium app-muted">{m.caixa.caixa_devolver_venda_itens_label}</p>
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-jl-border-1 p-2">
              {venda.itens.map((item) => {
                const max = qtdDisponivel(item)
                const q = selecionados[item.id] ?? 0
                if (max <= 0) {
                  return (
                    <li key={item.id} className="flex justify-between text-xs text-jl-fg-3 line-through">
                      <span>{item.nome}</span>
                      <span>{m.caixa.caixa_devolver_venda_ja_devolvido}</span>
                    </li>
                  )
                }
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-jl-fg-1">{item.nome}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="h-7 w-7 rounded border border-jl-border-1 text-jl-fg-2"
                        onClick={() => alterarQtd(item.id, max, -1)}
                        disabled={q <= 0 || processando}
                      >
                        −
                      </button>
                      <span className="w-8 text-center tabular-nums">{q}</span>
                      <button
                        type="button"
                        className="h-7 w-7 rounded border border-jl-border-1 text-jl-fg-2"
                        onClick={() => alterarQtd(item.id, max, 1)}
                        disabled={q >= max || processando}
                      >
                        +
                      </button>
                      <span className="w-10 text-right text-xs text-jl-fg-3">/{max}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="caixa-forma-estorno" className="mb-1.5 block text-xs font-medium app-muted">
                {m.caixa.caixa_devolver_venda_forma_label}
              </label>
              <select
                id="caixa-forma-estorno"
                value={formaEstorno}
                onChange={(e) =>
                  setFormaEstorno(e.target.value as (typeof FORMAS_ESTORNO_DEVOLUCAO)[number])
                }
                disabled={processando}
                className="w-full rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm"
              >
                {formasDisponiveis.map((f) => (
                  <option key={f} value={f}>
                    {labelFormaEstorno(f, m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <span className="text-xs app-muted">Valor a estornar</span>
              <span className="text-lg font-semibold tabular-nums text-jl-fg-1">
                {m.caixa.moeda_prefixo} {formatDecimalBRL(valorEstorno)}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="caixa-devolver-motivo" className="mb-1.5 block text-xs font-medium app-muted">
              {m.caixa.caixa_devolver_venda_motivo_label}
            </label>
            <textarea
              id="caixa-devolver-motivo"
              ref={textareaRef}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              minLength={2}
              maxLength={500}
              rows={3}
              disabled={processando}
              className="w-full resize-y rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm text-jl-fg-1 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:opacity-60"
            />
          </div>

          {erro && (
            <p className="rounded-md border px-2 py-1 text-xs app-badge-warn" role="alert">
              {erro}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-end px-4 sm:px-6 pb-4 sm:pb-6 pt-0 border-t app-divider mt-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            className="app-btn-neutral"
            onClick={onClose}
            disabled={processando}
          >
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            className="app-btn-accent"
            onClick={() => void handleConfirmar()}
            disabled={!podeEnviar || processando}
          >
            {m.caixa.caixa_devolver_venda_confirmar}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
