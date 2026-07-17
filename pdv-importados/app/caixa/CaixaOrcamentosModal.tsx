"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import { formatDecimalBRL } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import {
  cancelarOrcamentoCaixa,
  listarOrcamentosCaixa,
  type OrcamentoCard,
} from "@/app/caixa/actions"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  onConverter: (id: string) => void
}

function fmtValidade(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR")
}

/** Lista de orçamentos abertos do operador — converter carrega no carrinho (Fase 5, Entrega 6). */
export function CaixaOrcamentosModal({ open, onOpenChange, m, onConverter }: Props) {
  const [orcamentos, setOrcamentos] = useState<OrcamentoCard[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState("")
  const [processando, setProcessando] = useState(false)
  const tituloId = useId()

  const fechar = useCallback(() => onOpenChange(false), [onOpenChange])

  const recarregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const res = await listarOrcamentosCaixa()
    if (res.ok) setOrcamentos(res.orcamentos)
    else setErro(res.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    setCancelandoId(null)
    void recarregar()
  }, [open, recarregar])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        if (cancelandoId) setCancelandoId(null)
        else fechar()
      }
    }
    document.body.style.overflow = "hidden"
    globalThis.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      globalThis.removeEventListener("keydown", onKey)
    }
  }, [open, fechar, cancelandoId])

  if (!open) return null

  async function handleConfirmarCancelar() {
    if (!cancelandoId) return
    setProcessando(true)
    try {
      const res = await cancelarOrcamentoCaixa(cancelandoId, motivoCancelamento.trim() || undefined)
      if (res.ok) {
        setCancelandoId(null)
        setMotivoCancelamento("")
        await recarregar()
      } else {
        setErro(res.error)
      }
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
    >
      <div className="absolute inset-0 bg-black/60" onClick={fechar} aria-hidden />
      <div
        className="relative z-10 flex h-full max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-jl-border-1 bg-jl-surface-elev text-jl-fg-1 shadow-xl"
        data-caixa-atalho-bloqueado="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-jl-border-1 px-4 py-3">
          <div>
            <h2 id={tituloId} className="text-base font-semibold">
              {m.caixa.orcamentos_titulo}
            </h2>
            <p className="mt-0.5 text-xs text-jl-fg-3">{m.caixa.orcamentos_subtitulo}</p>
          </div>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-jl-fg-3 hover:bg-white/10"
            aria-label={m.comum.fechar}
            onClick={fechar}
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {loading ? <p className="text-sm text-jl-fg-3">{m.comum.carregando}</p> : null}
          {erro ? (
            <p className="text-sm text-destructive" role="alert">
              {erro}
            </p>
          ) : null}
          {!loading && !erro && orcamentos.length === 0 ? (
            <p className="text-sm italic text-jl-fg-3">{m.caixa.orcamentos_vazio}</p>
          ) : null}
          {!loading && !erro && orcamentos.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {orcamentos.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-dashed border-jl-border-1 bg-jl-surface-soft p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">#{o.numeroLocal}</span>
                      <span className="text-sm font-bold tabular-nums">
                        {m.caixa.moeda_prefixo} {formatDecimalBRL(o.totalLiquido)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-jl-fg-3">
                      {o.qtdItens} {o.qtdItens === 1 ? m.caixa.em_aberto_item : m.caixa.em_aberto_itens}
                      {o.nomeCliente ? ` · ${o.nomeCliente}` : ""}
                      {" · "}
                      {caixaFmt(m.caixa.orcamentos_validade, { data: fmtValidade(o.validadeAte) })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => onConverter(o.id)}
                    >
                      {m.caixa.orcamentos_converter}
                    </Button>
                    <button
                      type="button"
                      className="text-[11px] text-red-400 underline-offset-2 hover:underline"
                      onClick={() => {
                        setCancelandoId(o.id)
                        setMotivoCancelamento("")
                      }}
                    >
                      {m.caixa.orcamentos_cancelar}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-jl-border-1 px-4 py-3">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={fechar}>
            {m.comum.fechar}
          </Button>
        </footer>
      </div>

      {cancelandoId ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !processando) setCancelandoId(null)
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-jl-border-1 bg-jl-surface-elev p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-semibold">{m.caixa.orcamentos_cancelar}</h3>
            <textarea
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={processando}
              placeholder={m.caixa.caixa_cancelar_venda_motivo_label}
              className="w-full resize-y rounded-lg border border-jl-border-1 bg-jl-surface-base px-3 py-2 text-sm text-jl-fg-1 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:opacity-60"
            />
            <div className={cn("mt-3 flex justify-end gap-2")}>
              <Button
                type="button"
                variant="ghost"
                className="app-btn-neutral"
                onClick={() => setCancelandoId(null)}
                disabled={processando}
              >
                {m.comum.voltar}
              </Button>
              <Button
                type="button"
                className="app-btn-danger"
                onClick={() => void handleConfirmarCancelar()}
                disabled={processando}
              >
                {m.caixa.caixa_cancelar_venda_confirmar}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
