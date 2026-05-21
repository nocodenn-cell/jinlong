/**
 * ESC/POS command builder for thermal receipt printers (58mm / 80mm).
 * Generates a Uint8Array ready to be sent via WebUSB or serial.
 */

import type { ReciboVenda } from "@/app/caixa/CaixaReciboModal"

// ── ESC/POS command bytes ────────────────────────────────────────────────────
const CMD = {
  INIT:             [0x1b, 0x40],
  CODEPAGE_PC1252:  [0x1b, 0x74, 0x10],
  ALIGN_LEFT:       [0x1b, 0x61, 0x00],
  ALIGN_CENTER:     [0x1b, 0x61, 0x01],
  BOLD_ON:          [0x1b, 0x45, 0x01],
  BOLD_OFF:         [0x1b, 0x45, 0x00],
  LF:               [0x0a],
  // Partial cut — no built-in line feed; rely on explicit LFs before this command
  CUT:              [0x1d, 0x56, 0x42, 0x00],
} as const

const FORMA_LABEL: Record<string, string> = {
  DINHEIRO:       "Dinheiro",
  PIX:            "Pix",
  CARTAO_DEBITO:  "Debito",
  CARTAO_CREDITO: "Credito",
}

// ── Builder ──────────────────────────────────────────────────────────────────
class EscPosBuilder {
  private buf: number[] = []
  constructor(readonly cols: number) {}

  private push(...data: number[]): this {
    this.buf.push(...data)
    return this
  }

  init():        this { return this.push(...CMD.INIT, ...CMD.CODEPAGE_PC1252) }
  left():        this { return this.push(...CMD.ALIGN_LEFT) }
  center():      this { return this.push(...CMD.ALIGN_CENTER) }
  boldOn():      this { return this.push(...CMD.BOLD_ON) }
  boldOff():     this { return this.push(...CMD.BOLD_OFF) }
  cut():         this { return this.push(...CMD.CUT) }

  lf(n = 1): this {
    for (let i = 0; i < n; i++) this.push(...CMD.LF)
    return this
  }

  text(s: string): this {
    // TextEncoder outputs UTF-8; most modern printers accept it
    new TextEncoder().encode(s).forEach((b) => this.buf.push(b))
    return this
  }

  line(s: string): this { return this.text(s).lf() }

  rule(): this { return this.line("-".repeat(this.cols)) }

  /** Two-column line: left text + right text aligned to `cols` width. */
  cols2(left: string, right: string): this {
    const gap = this.cols - left.length - right.length
    return this.line(left + " ".repeat(Math.max(1, gap)) + right)
  }

  build(): Uint8Array { return new Uint8Array(this.buf) }
}

// ── Public API ────────────────────────────────────────────────────────────────
/** Builds a complete ESC/POS receipt buffer from a `ReciboVenda`. */
export function buildReciboEscPos(venda: ReciboVenda, cols = 32): Uint8Array {
  const b   = new EscPosBuilder(cols)
  const brl = (v: number) => `${venda.moeda} ${v.toFixed(2)}`

  // ── Header ──
  b.init()
   .center()
   .boldOn()
   .line("福 CUPOM NAO FISCAL 福")   // 福
   .boldOff()
   .line(venda.data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))
   .line("#" + venda.vendaId.slice(0, 8).toUpperCase())
   .rule()
   .left()

  // ── Items ──
  for (const item of venda.itens) {
    // Truncate name to fit the column width
    b.line(item.nome.slice(0, cols))
    const label  = `  ${item.quantidade}x ${brl(item.precoUnitario)}`
    const subtot = brl(item.quantidade * item.precoUnitario)
    b.cols2(label, subtot)
    if (item.tipoPreco === "ATACADO") b.line("  [preco atacado]")
  }

  b.rule()

  // ── Totals ──
  if (venda.totalBruto > venda.totalLiquidoComGerente) {
    b.cols2("Subtotal", brl(venda.totalBruto))
    if (venda.totalDesconto > 0)
      b.cols2("Desc. produtos", `- ${brl(venda.totalDesconto)}`)
    if (venda.descontoGerentePercentual > 0)
      b.cols2(
        `Desc. gerente ${venda.descontoGerentePercentual.toFixed(1)}%`,
        `- ${brl(venda.valorDescontoGerente)}`,
      )
  }

  b.boldOn().cols2("TOTAL", brl(venda.totalLiquidoComGerente)).boldOff()
  b.rule()

  // ── Payments ──
  for (const p of venda.pagamentos) {
    b.cols2(FORMA_LABEL[p.formaPagamento] ?? p.formaPagamento, brl(p.valor))
  }

  // ── Footer ──
  b.lf(1)
   .center()
   .line("Obrigado pela preferencia!")
   .line("Nao e documento fiscal.")
   .lf(3)
   .cut()

  return b.build()
}
