/**
 * ESC/POS command builder for thermal receipt printers (58mm / 80mm).
 * Generates a Uint8Array ready to be sent via WebUSB or serial.
 */

import type { ReciboVenda, ReciboLabels } from "@/lib/caixa/reciboTypes"
import { descontoProdutosLiquido } from "@/lib/caixa/reciboTotais"

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

// ── Codepage CP1252 ───────────────────────────────────────────────────────────
// Declaramos CODEPAGE_PC1252 acima, então o texto PRECISA sair em bytes CP1252 —
// não em UTF-8. Acentos (Ã, ç, é), `¥` (0xA5), `·` (0xB7) e `…` passam a imprimir
// corretamente. Caracteres fora do CP1252 (ex.: glifos CJK 福/非) viram `?`, em vez
// de bytes multibyte que corrompiam a impressão (e podiam disparar comandos).
// Observação: imprimir glifos CJK de fato em bobina exige renderização raster
// (GS v 0) ou firmware com codepage chinês — decisão de hardware, fora deste fix.
const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
}

function encodeCp1252(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0x3f
    if (cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff)) out.push(cp)
    else if (CP1252_EXTRA[cp] !== undefined) out.push(CP1252_EXTRA[cp])
    else out.push(0x3f) // '?'
  }
  return out
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
    // Bytes CP1252 (não UTF-8) — coerente com o CODEPAGE_PC1252 enviado no init().
    this.buf.push(...encodeCp1252(s))
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
/** Builds a complete ESC/POS receipt buffer from a `ReciboVenda` + rótulos do idioma ativo. */
export function buildReciboEscPos(venda: ReciboVenda, labels: ReciboLabels, cols = 32): Uint8Array {
  const b   = new EscPosBuilder(cols)
  const brl = (v: number) => `${venda.moeda} ${v.toFixed(2)}`

  // ── Header ──
  b.init().center()
  if (venda.lojaNome) b.boldOn().line(venda.lojaNome.slice(0, cols)).boldOff()
  b.boldOn().line(labels.titulo).boldOff()
  if (venda.segundaVia) b.boldOn().line(labels.segundaVia).boldOff()
  b
   .line(venda.data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))
   .line("#" + venda.vendaId.slice(0, 8).toUpperCase())

  if (venda.clienteNome) {
    b.line(`${labels.cliente}: ${venda.clienteNome}`.slice(0, cols))
  }

  b.rule()
   .left()

  // ── Items ──
  for (const item of venda.itens) {
    // Truncate name to fit the column width
    b.line(item.nome.slice(0, cols))
    const label  = `  ${item.quantidade}x ${brl(item.precoUnitario)}`
    const subtot = brl(item.quantidade * item.precoUnitario)
    b.cols2(label, subtot)
    if (item.tipoPreco === "ATACADO") b.line(`  [${labels.atacado}]`)
  }

  b.rule()

  // ── Totals ──
  if (venda.totalBruto > venda.totalLiquidoComGerente) {
    b.cols2(labels.subtotal, brl(venda.totalBruto))
    const descontoProdutos = descontoProdutosLiquido(venda)
    if (descontoProdutos > 0)
      b.cols2(labels.descontoProdutos, `- ${brl(descontoProdutos)}`)
    if (venda.descontoGerentePercentual > 0)
      b.cols2(
        `${labels.descontoGerente} ${venda.descontoGerentePercentual.toFixed(1)}%`,
        `- ${brl(venda.valorDescontoGerente)}`,
      )
  }

  b.boldOn().cols2(labels.total, brl(venda.totalLiquidoComGerente)).boldOff()
  b.rule()

  // ── Payments ──
  for (const p of venda.pagamentos) {
    b.cols2(labels.formas[p.formaPagamento] ?? p.formaPagamento, brl(p.valor))
  }

  // ── Footer ──
  b.lf(1)
   .center()
   .line(labels.rodapeObrigado)
   .line(labels.rodapeNaoFiscal)
   .lf(3)
   .cut()

  return b.build()
}
