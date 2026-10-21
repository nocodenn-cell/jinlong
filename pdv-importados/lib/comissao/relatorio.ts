/** Relatório por vendedor: CSV (separador ';', decimal com vírgula, BOM para Excel) e PDF (jsPDF). */
export type LinhaRelatorio = {
  operadorId: string
  nome: string
  vendas: number
  base: number
  comissao: number
  ajustes: number
  bonusMeta: number
  total: number
}

export type CabecalhoRelatorio = {
  vendedor: string; vendas: string; base: string; comissao: string; ajustes: string; bonus: string; total: string
}

const brl = (n: number) => n.toFixed(2).replace('.', ',')
const esc = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

export function totaisRelatorio(linhas: LinhaRelatorio[]): Omit<LinhaRelatorio, 'operadorId' | 'nome'> {
  const soma = (k: keyof LinhaRelatorio) => Math.round(linhas.reduce((a, l) => a + Number(l[k]), 0) * 100) / 100
  return { vendas: linhas.reduce((a, l) => a + l.vendas, 0), base: soma('base'), comissao: soma('comissao'), ajustes: soma('ajustes'), bonusMeta: soma('bonusMeta'), total: soma('total') }
}

export function gerarCsvRelatorio(linhas: LinhaRelatorio[], h: CabecalhoRelatorio, rotuloTotal: string): string {
  const out = [[h.vendedor, h.vendas, h.base, h.comissao, h.ajustes, h.bonus, h.total].map(esc).join(';')]
  for (const l of linhas) out.push([esc(l.nome), String(l.vendas), brl(l.base), brl(l.comissao), brl(l.ajustes), brl(l.bonusMeta), brl(l.total)].join(';'))
  const t = totaisRelatorio(linhas)
  out.push([esc(rotuloTotal), String(t.vendas), brl(t.base), brl(t.comissao), brl(t.ajustes), brl(t.bonusMeta), brl(t.total)].join(';'))
  return '\uFEFF' + out.join('\r\n') + '\r\n'
}

export async function gerarPdfRelatorio(linhas: LinhaRelatorio[], h: CabecalhoRelatorio, titulo: string, rotuloTotal: string): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const cols = [h.vendedor, h.vendas, h.base, h.comissao, h.ajustes, h.bonus, h.total]
  const x = [12, 90, 115, 150, 185, 220, 255]
  let y = 16
  doc.setFontSize(13); doc.text(titulo, 12, y); y += 10
  doc.setFontSize(9)
  const linha = (vals: string[], negrito = false) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal')
    vals.forEach((v, i) => doc.text(v, x[i], y))
    y += 6
    if (y > 195) { doc.addPage(); y = 16 }
  }
  linha(cols, true)
  for (const l of linhas) linha([l.nome.slice(0, 40), String(l.vendas), brl(l.base), brl(l.comissao), brl(l.ajustes), brl(l.bonusMeta), brl(l.total)])
  const t = totaisRelatorio(linhas)
  linha([rotuloTotal, String(t.vendas), brl(t.base), brl(t.comissao), brl(t.ajustes), brl(t.bonusMeta), brl(t.total)], true)
  return doc.output('blob')
}
