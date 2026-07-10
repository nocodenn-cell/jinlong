"use client"

import { useEffect, useRef } from "react"
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import type { UseThermalPrinterReturn } from "@/hooks/useThermalPrinter"
import type { Mensagens } from "@/i18n/getMessages"
import { cn } from "@/lib/utils"
import { formatDecimalBRL } from "@/lib/format/money"

export type ReciboItem = {
  nome: string
  quantidade: number
  precoUnitario: number
  precoOriginal: number
  tipoPreco: string
}

export type ReciboVenda = {
  vendaId: string
  data: Date
  itens: ReciboItem[]
  pagamentos: Array<{ formaPagamento: FinalizarVendaInput["formaPagamento"]; valor: number }>
  totalBruto: number
  totalDesconto: number
  totalLiquidoComGerente: number
  descontoGerentePercentual: number
  valorDescontoGerente: number
  moeda: string
}

/** Rótulos do cupom já resolvidos no idioma do operador — compartilhados entre a tela e o ESC/POS. */
export type ReciboLabels = {
  titulo: string
  subtotal: string
  descontoProdutos: string
  descontoGerente: string
  total: string
  pagamento: string
  rodapeObrigado: string
  rodapeNaoFiscal: string
  atacado: string
  /** Forma de pagamento (DINHEIRO/PIX/CARTAO_DEBITO/CARTAO_CREDITO) → rótulo traduzido. */
  formas: Record<string, string>
}

type Props = Readonly<{
  venda: ReciboVenda
  m: Mensagens
  onClose: () => void
  onNovaVenda: () => void
  onFinalizarCaixa: () => void
  thermal: UseThermalPrinterReturn
}>

/** Monta os rótulos do cupom a partir do dicionário ativo (pt/zh). */
export function buildReciboLabels(m: Mensagens): ReciboLabels {
  const r = m.caixa.recibo
  return {
    titulo: r.titulo,
    subtotal: r.subtotal,
    descontoProdutos: r.desconto_produtos,
    descontoGerente: r.desconto_gerente,
    total: r.total,
    pagamento: r.pagamento,
    rodapeObrigado: r.rodape_obrigado,
    rodapeNaoFiscal: r.rodape_nao_fiscal,
    atacado: r.atacado,
    formas: {
      DINHEIRO: m.caixa.pdv_metodo_pagamento_dinheiro,
      PIX: m.caixa.pdv_metodo_pagamento_pix,
      CARTAO_DEBITO: m.caixa.pdv_metodo_pagamento_debito,
      CARTAO_CREDITO: m.caixa.pdv_metodo_pagamento_credito,
    },
  }
}

function fmtBRL(valor: number, moeda: string): string {
  return `${moeda} ${formatDecimalBRL(valor)}`
}

function fmtData(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function CaixaReciboModal({
  venda,
  m,
  onClose,
  onNovaVenda,
  onFinalizarCaixa,
  thermal,
}: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const supportsWebUSB = typeof navigator !== "undefined" && "usb" in navigator
  const labels = buildReciboLabels(m)

  const handleThermalPrint = async () => {
    if (!thermal.deviceInfo) {
      await thermal.connect()
    }
    // deviceInfo state is stale in this closure; the printer singleton is connected after connect()
    // printRecibo uses the singleton directly and will error gracefully if connect failed
    await thermal.printRecibo(venda, labels)
  }

  const handlePrint = () => {
    const el = printRef.current
    if (!el) return

    const PRINT_CSS = [
      "* { box-sizing: border-box; margin: 0; padding: 0; }",
      "body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; padding: 8px; width: 300px; }",
      ".recibo-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }",
      ".recibo-header h1 { font-size: 14px; font-weight: bold; }",
      ".recibo-header p { font-size: 11px; color: #555; }",
      ".recibo-id { font-size: 10px; color: #777; }",
      ".recibo-itens { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }",
      ".recibo-item { margin-bottom: 3px; }",
      ".recibo-item-nome { font-weight: bold; }",
      ".recibo-item-detalhe { display: flex; justify-content: space-between; font-size: 11px; color: #444; }",
      ".recibo-totais { border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }",
      ".recibo-linha { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }",
      ".recibo-linha.total { font-weight: bold; font-size: 14px; }",
      ".recibo-pgto { margin-bottom: 6px; }",
      ".recibo-footer { text-align: center; font-size: 10px; color: #888; border-top: 1px dashed #000; padding-top: 6px; }",
    ].join("\n")

    // Use a hidden same-page iframe so we avoid window.open (S5148) while
    // still getting an isolated print context with clean styles.
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

  // Fecha com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const temDesconto = venda.totalBruto > venda.totalLiquidoComGerente

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recibo da venda"
      className="fixed inset-0 z-50 flex items-center justify-center dragon-glass-backdrop p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Recibo da venda</span>
          <div className="flex gap-2">
            {supportsWebUSB ? (
              <button
                type="button"
                onClick={() => { void handleThermalPrint().catch(() => { }) }}
                disabled={thermal.status === "connecting" || thermal.status === "printing"}
                aria-label="Imprimir (térmica direta)"
                title="Imprime diretamente na impressora térmica (sem confirmação)"
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold",
                  thermal.status === "connected" || thermal.status === "printing"
                    ? "app-btn-accent"
                    : "app-btn-neutral",
                )}
              >
                {thermal.status === "connecting" ? "Conectando…" :
                 thermal.status === "printing"   ? "Imprimindo…" :
                 "🖨️ Imprimir (térmica direta)"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePrint}
                aria-label="Imprimir (janela)"
                title="Imprime usando a janela do navegador (clique em OK)"
                className="app-btn-accent rounded-md px-3 py-1.5 text-xs font-semibold"
              >
                🖨️ Imprimir (janela)
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar recibo"
              className="app-btn-neutral rounded-md px-3 py-1.5 text-xs font-semibold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Erro térmica */}
        {thermal.errorMsg && (
          <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {thermal.errorMsg}
          </div>
        )}

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto p-4">
          <div ref={printRef} className="flex flex-col gap-3 font-mono text-xs text-foreground">
            {/* Cabeçalho */}
            <div className="recibo-header text-center border-b border-dashed border-border pb-3">
              <h1 className="text-sm font-bold">
                <span className="mr-1 text-amber-500" aria-hidden="true">福</span>
                {labels.titulo}
                <span className="ml-1 text-amber-500" aria-hidden="true">福</span>
              </h1>
              <p className="text-muted-foreground">{fmtData(venda.data)}</p>
              <p className="recibo-id text-muted-foreground/70 text-[10px]">
                #{venda.vendaId.slice(0, 8).toUpperCase()}
              </p>
            </div>

            {/* Itens */}
            <div className="recibo-itens border-b border-dashed border-border pb-3">
              {venda.itens.map((item, i) => (
                <div key={i} className="recibo-item mb-2">
                  <p className="recibo-item-nome font-semibold leading-tight">{item.nome}</p>
                  <div className="recibo-item-detalhe flex justify-between text-muted-foreground">
                    <span>
                      {item.quantidade} × {fmtBRL(item.precoUnitario, venda.moeda)}
                      {item.tipoPreco === "ATACADO" && (
                        <span className="ml-1 text-[9px] uppercase opacity-60">[{labels.atacado}]</span>
                      )}
                    </span>
                    <span className="font-semibold text-foreground">
                      {fmtBRL(item.quantidade * item.precoUnitario, venda.moeda)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totais */}
            <div className="recibo-totais border-b border-dashed border-border pb-3 flex flex-col gap-1">
              {temDesconto && (
                <>
                  <div className="recibo-linha flex justify-between">
                    <span className="text-muted-foreground">{labels.subtotal}</span>
                    <span>{fmtBRL(venda.totalBruto, venda.moeda)}</span>
                  </div>
                  {venda.totalDesconto > 0 && (
                    <div className="recibo-linha flex justify-between text-muted-foreground">
                      <span>{labels.descontoProdutos}</span>
                      <span>− {fmtBRL(venda.totalDesconto, venda.moeda)}</span>
                    </div>
                  )}
                  {venda.descontoGerentePercentual > 0 && (
                    <div className="recibo-linha flex justify-between text-muted-foreground">
                      <span>{labels.descontoGerente} ({venda.descontoGerentePercentual.toFixed(1)}%)</span>
                      <span>− {fmtBRL(venda.valorDescontoGerente, venda.moeda)}</span>
                    </div>
                  )}
                </>
              )}
              <div className={cn("recibo-linha total flex justify-between font-bold", "text-sm")}>
                <span>{labels.total}</span>
                <span>{fmtBRL(venda.totalLiquidoComGerente, venda.moeda)}</span>
              </div>
            </div>

            {/* Pagamentos */}
            <div className="recibo-pgto flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {labels.pagamento}
              </p>
              {venda.pagamentos.map((p, i) => (
                <div key={i} className="recibo-linha flex justify-between">
                  <span>{labels.formas[p.formaPagamento] ?? p.formaPagamento}</span>
                  <span>{fmtBRL(p.valor, venda.moeda)}</span>
                </div>
              ))}
            </div>

            {/* Rodapé */}
            <div className="recibo-footer border-t border-dashed border-border pt-3 text-center text-[10px] text-muted-foreground">
              <p>{labels.rodapeObrigado}</p>
              <p className="opacity-60">{labels.rodapeNaoFiscal}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border bg-muted/30 p-4">
          <button
            type="button"
            onClick={onNovaVenda}
            className="app-btn-accent w-full rounded-md px-4 py-2.5 text-sm font-semibold"
          >
            {m.caixa.btn_adicionar_nova_venda}
          </button>
          <button
            type="button"
            onClick={onFinalizarCaixa}
            className="app-btn-neutral w-full rounded-md px-4 py-2.5 text-sm font-semibold"
          >
            {m.caixa.btn_finalizar_caixa}
          </button>
        </div>
      </div>
    </div>
  )
}
