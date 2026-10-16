"use client"

import { useEffect, useMemo, useRef } from "react"
import type { UseThermalPrinterReturn } from "@/hooks/useThermalPrinter"
import type { Mensagens } from "@/i18n/getMessages"
import { buildReciboLabels, type ReciboVenda } from "@/lib/caixa/reciboTypes"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/feedback"
import { cn } from "@/lib/utils"
import { formatDecimalBRL } from "@/lib/format/money"
import { descontoProdutosLiquido } from "@/lib/caixa/reciboTotais"
import { imprimirNoIframe } from "@/lib/print/imprimirNoIframe"

type Props = Readonly<{
  venda: ReciboVenda
  /** Nome da loja (cabeçalho do cupom). */
  lojaNome?: string | null
  /** true na reimpressão de um cupom já emitido. */
  segundaVia?: boolean
  m: Mensagens
  onClose: () => void
  /** Ações de fluxo do PDV; omitidas quando o cupom é reaberto fora do caixa (ex.: detalhe da venda no admin). */
  onNovaVenda?: () => void
  onFinalizarCaixa?: () => void
  thermal: UseThermalPrinterReturn
}>

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
  venda: vendaBase,
  lojaNome = null,
  segundaVia = false,
  m,
  onClose,
  onNovaVenda,
  onFinalizarCaixa,
  thermal,
}: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const gavetaAbertaRef = useRef(false)
  const gavetaEmAndamentoRef = useRef(false)
  const supportsWebUSB = typeof navigator !== "undefined" && "usb" in navigator
  const labels = buildReciboLabels(m)
  const venda = useMemo<ReciboVenda>(
    () => ({ ...vendaBase, lojaNome, segundaVia }),
    [vendaBase, lojaNome, segundaVia],
  )
  const termicaEmUso = thermal.status === "connected" || thermal.status === "printing"

  // Só primeira via, apresentada após confirmação da venda. A reimpressão
  // não aciona a gaveta e a falha do hardware nunca desfaz uma venda.
  // A gaveta só é marcada como aberta após pulso bem-sucedido; se a impressora
  // ainda não estiver conectada, tenta de novo quando o status da térmica muda.
  useEffect(() => {
    if (gavetaAbertaRef.current || gavetaEmAndamentoRef.current || segundaVia) return
    if (!venda.pagamentos.some((p) => p.formaPagamento === "DINHEIRO" && p.valor > 0)) return
    gavetaEmAndamentoRef.current = true
    void thermal.abrirGaveta().then((ok) => {
      gavetaEmAndamentoRef.current = false
      if (ok) gavetaAbertaRef.current = true
    })
  }, [segundaVia, venda.vendaId, venda.pagamentos, thermal.abrirGaveta, thermal.status])

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
      ".recibo-loja, .recibo-segunda-via { font-weight: bold; color: #000 !important; }",
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

    imprimirNoIframe(el, PRINT_CSS)
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
  const descontoProdutos = descontoProdutosLiquido(venda)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={m.caixa.modal_recibo_venda_titulo}
      data-testid="caixa-recibo-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-body font-semibold text-fg">{m.caixa.modal_recibo_venda_titulo}</span>
          <div className="flex gap-2">
            {supportsWebUSB ? (
              <Button
                type="button"
                size="sm"
                variant={termicaEmUso ? "primary" : "secondary"}
                onClick={() => { void handleThermalPrint().catch(() => { }) }}
                disabled={thermal.status === "connecting" || thermal.status === "printing"}
                loading={thermal.status === "connecting" || thermal.status === "printing"}
                title={m.caixa.modal_recibo_venda_imprimir_termica_hint}
                aria-label={m.caixa.modal_recibo_venda_imprimir_termica}
              >
                {thermal.status === "connecting" ? m.caixa.modal_recibo_venda_conectando :
                 thermal.status === "printing"   ? m.caixa.modal_recibo_venda_imprimindo :
                 m.caixa.modal_recibo_venda_imprimir_termica}
              </Button>
            ) : null}
            {/* Sempre disponível: impressora com driver do SO não é alcançável via WebUSB. */}
            <Button
              type="button"
              size="sm"
              variant={supportsWebUSB && termicaEmUso ? "secondary" : "primary"}
              onClick={handlePrint}
              title={m.caixa.modal_recibo_venda_imprimir_janela_hint}
            >
              {m.caixa.btn_imprimir_comprovante}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onClose}
              data-testid="caixa-recibo-fechar"
            >
              {m.caixa.btn_fechar_comprovante}
            </Button>
          </div>
        </div>

        {thermal.errorMsg ? (
          <ErrorState dense description={thermal.errorMsg} className="rounded-none border-x-0" />
        ) : null}

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto p-4">
          <div ref={printRef} className="flex flex-col gap-3 font-mono text-xs text-foreground">
            {/* Cabeçalho */}
            <div className="recibo-header text-center border-b border-dashed border-border pb-3">
              {venda.lojaNome ? (
                <p className="recibo-loja text-caption font-semibold text-foreground">{venda.lojaNome}</p>
              ) : null}
              <h1 className="text-sm font-bold">
                <span className="mr-1 text-amber-500" aria-hidden="true">福</span>
                {labels.titulo}
                <span className="ml-1 text-amber-500" aria-hidden="true">福</span>
              </h1>
              {venda.segundaVia ? (
                <p className="recibo-segunda-via text-caption font-bold text-foreground" data-testid="caixa-recibo-segunda-via">
                  {labels.segundaVia}
                </p>
              ) : null}
              <p className="text-muted-foreground">{fmtData(venda.data)}</p>
              <p className="recibo-id text-muted-foreground/70 text-caption">
                #{venda.vendaId.slice(0, 8).toUpperCase()}
              </p>
              {venda.clienteNome ? (
                <p className="recibo-cliente text-caption font-medium text-foreground">
                  {labels.cliente}: {venda.clienteNome}
                </p>
              ) : null}
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
            {/* `totalDesconto` do carrinho ja inclui o desconto do gerente
                (`calcularTotaisComGerente` faz bruto - liquidoComGerente). Sem
                descontar, o recibo listava o MESMO valor duas vezes -- como
                "Desconto produtos" e como "Desconto gerente" -- e a conta do
                cupom nao fechava para o cliente, embora o TOTAL estivesse certo. */}
            <div className="recibo-totais border-b border-dashed border-border pb-3 flex flex-col gap-1">
              {temDesconto && (
                <>
                  <div className="recibo-linha flex justify-between">
                    <span className="text-muted-foreground">{labels.subtotal}</span>
                    <span>{fmtBRL(venda.totalBruto, venda.moeda)}</span>
                  </div>
                  {descontoProdutos > 0 && (
                    <div className="recibo-linha flex justify-between text-muted-foreground">
                      <span>{labels.descontoProdutos}</span>
                      <span>− {fmtBRL(descontoProdutos, venda.moeda)}</span>
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
              <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
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
            <div className="recibo-footer border-t border-dashed border-border pt-3 text-center text-caption text-fg-muted">
              <p>{labels.rodapeObrigado}</p>
              <p className="opacity-60">{labels.rodapeNaoFiscal}</p>
            </div>
          </div>
        </div>

        {onNovaVenda || onFinalizarCaixa ? (
        <div className="flex flex-col gap-2 border-t border-border bg-surface-muted p-4">
          {onNovaVenda ? (
          <Button
            type="button"
            variant="primary"
            className="w-full"
            onClick={onNovaVenda}
            data-testid="caixa-recibo-nova-venda"
            aria-label={m.caixa.btn_adicionar_nova_venda}
          >
            {m.caixa.btn_adicionar_nova_venda}
          </Button>
          ) : null}
          {onFinalizarCaixa ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={onFinalizarCaixa}
          >
            {m.caixa.btn_finalizar_caixa}
          </Button>
          ) : null}
        </div>
        ) : null}
      </div>
    </div>
  )
}
