"use client"

import { useRef } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import { Button } from "@/components/ui/button"
import { formatDecimalBRL } from "@/lib/format/money"

export type ComprovanteFechamento = {
  lojaNome: string
  operadorNome: string
  dataAbertura: Date
  dataFechamento: Date
  valorInicial: number
  quantidadeVendas: number
  totalVendasRecebido: number
  totalSangrias: number
  totalSuprimentos: number
  valorSistemaDinheiro: number
  valorContado: number
  diferenca: number
}

type Props = Readonly<{
  comprovante: ComprovanteFechamento
  m: Mensagens
  onClose: () => void
}>

function fmtData(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Comprovante impresso de fechamento de caixa — impressão via janela do navegador. */
export function CaixaFechamentoReciboModal({ comprovante: c, m, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const moeda = m.caixa.moeda_prefixo
  const temDiferenca = Math.abs(c.diferenca) > 0.005

  const handlePrint = () => {
    const el = printRef.current
    if (!el) return

    const PRINT_CSS = [
      "* { box-sizing: border-box; margin: 0; padding: 0; }",
      "body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; padding: 8px; width: 300px; }",
      ".comp-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }",
      ".comp-header h1 { font-size: 14px; font-weight: bold; }",
      ".comp-header p { font-size: 11px; color: #555; }",
      ".comp-linha { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }",
      ".comp-linha.total { font-weight: bold; font-size: 14px; border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; }",
      ".comp-footer { text-align: center; font-size: 10px; color: #888; border-top: 1px dashed #000; padding-top: 6px; margin-top: 6px; }",
    ].join("\n")

    const iframe = document.createElement("iframe")
    iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden"
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument
    if (!doc) { document.body.removeChild(iframe); return }

    const style = doc.createElement("style")
    style.textContent = PRINT_CSS
    doc.head.appendChild(style)
    doc.body.appendChild(el.cloneNode(true))

    const win = iframe.contentWindow
    if (!win) { document.body.removeChild(iframe); return }
    win.onafterprint = () => document.body.removeChild(iframe)
    win.print()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={m.caixa.comprovante_fechamento_titulo}
      data-testid="caixa-fechamento-recibo-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-body font-semibold text-fg">
            {m.caixa.comprovante_fechamento_titulo}
          </span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="primary" onClick={handlePrint}>
              {m.caixa.btn_imprimir_comprovante}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>
              {m.caixa.btn_fechar_comprovante}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div ref={printRef} className="flex flex-col gap-3 font-mono text-xs text-foreground">
            <div className="comp-header text-center border-b border-dashed border-border pb-3">
              <h1 className="text-sm font-bold">{m.caixa.comprovante_fechamento_titulo}</h1>
              <p className="text-muted-foreground">{c.lojaNome}</p>
              <p className="text-muted-foreground">{fmtData(c.dataFechamento)}</p>
            </div>

            <div className="flex flex-col gap-1">
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">{m.caixa.comprovante_movimentacao_operador}</span>
                <span>{c.operadorNome}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">{m.caixa.comprovante_fechamento_abertura}</span>
                <span>{fmtData(c.dataAbertura)}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">{m.caixa.comprovante_fechamento_saldo_inicial}</span>
                <span>{moeda} {formatDecimalBRL(c.valorInicial)}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">
                  {m.caixa.comprovante_fechamento_vendas} ({c.quantidadeVendas})
                </span>
                <span>+ {moeda} {formatDecimalBRL(c.totalVendasRecebido)}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">{m.caixa.comprovante_fechamento_suprimentos}</span>
                <span>+ {moeda} {formatDecimalBRL(c.totalSuprimentos)}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">{m.caixa.comprovante_fechamento_sangrias}</span>
                <span>− {moeda} {formatDecimalBRL(c.totalSangrias)}</span>
              </div>

              <div className="comp-linha total flex justify-between border-t border-dashed border-border pt-2 mt-1 font-bold text-sm">
                <span>{m.caixa.comprovante_fechamento_saldo_sistema}</span>
                <span>{moeda} {formatDecimalBRL(c.valorSistemaDinheiro)}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">{m.caixa.comprovante_fechamento_saldo_contado}</span>
                <span>{moeda} {formatDecimalBRL(c.valorContado)}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className={temDiferenca ? "font-semibold text-[var(--color-danger-strong)]" : "text-muted-foreground"}>
                  {m.caixa.comprovante_fechamento_diferenca}
                </span>
                <span className={temDiferenca ? "font-semibold text-[var(--color-danger-strong)]" : ""}>
                  {c.diferenca > 0 ? "+ " : c.diferenca < 0 ? "− " : ""}
                  {moeda} {formatDecimalBRL(Math.abs(c.diferenca))}
                </span>
              </div>
            </div>

            <div className="comp-footer border-t border-dashed border-border pt-3 text-center text-caption text-fg-muted">
              <p>{m.caixa.comprovante_movimentacao_rodape}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
