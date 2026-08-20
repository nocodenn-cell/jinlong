"use client"

import { useRef } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import { Button } from "@/components/ui/button"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"
import type { TipoMovimentacaoUi } from "@/app/caixa/caixaMovimentacaoTypes"

export type ComprovanteMovimentacao = {
  tipo: TipoMovimentacaoUi
  valor: number
  motivo: string
  saldoAntes: number
  saldoDepois: number
  data: Date
  operadorNome?: string | null
}

type Props = Readonly<{
  comprovante: ComprovanteMovimentacao
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

/** Comprovante impresso de sangria/suprimento — impressão via janela do navegador. */
export function CaixaMovimentacaoReciboModal({ comprovante, m, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const tipoLabel = comprovante.tipo === "sangria" ? m.caixa.sangria : m.caixa.suprimento
  const moeda = m.caixa.moeda_prefixo

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
      aria-label={caixaFmt(m.caixa.comprovante_movimentacao_titulo, { tipo: tipoLabel })}
      data-testid="caixa-movimentacao-recibo-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-body font-semibold text-fg">
            {caixaFmt(m.caixa.comprovante_movimentacao_titulo, { tipo: tipoLabel })}
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
              <h1 className="text-sm font-bold">
                {caixaFmt(m.caixa.comprovante_movimentacao_titulo, { tipo: tipoLabel })}
              </h1>
              <p className="text-muted-foreground">{fmtData(comprovante.data)}</p>
            </div>

            <div className="flex flex-col gap-1">
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">{m.caixa.comprovante_movimentacao_saldo_antes}</span>
                <span>{moeda} {formatDecimalBRL(comprovante.saldoAntes)}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">{m.caixa.comprovante_movimentacao_motivo}</span>
                <span className="text-right">{comprovante.motivo}</span>
              </div>
              <div className="comp-linha total flex justify-between border-t border-dashed border-border pt-2 mt-1 font-bold text-sm">
                <span>{m.caixa.comprovante_movimentacao_valor}</span>
                <span>{comprovante.tipo === "sangria" ? "− " : "+ "}{moeda} {formatDecimalBRL(comprovante.valor)}</span>
              </div>
              <div className="comp-linha flex justify-between">
                <span className="text-muted-foreground">{m.caixa.comprovante_movimentacao_saldo_depois}</span>
                <span className="font-semibold">{moeda} {formatDecimalBRL(comprovante.saldoDepois)}</span>
              </div>
              {comprovante.operadorNome && (
                <div className="comp-linha flex justify-between">
                  <span className="text-muted-foreground">{m.caixa.comprovante_movimentacao_operador}</span>
                  <span>{comprovante.operadorNome}</span>
                </div>
              )}
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
