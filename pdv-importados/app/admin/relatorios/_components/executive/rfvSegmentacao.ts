/**
 * Segmentação RFV simplificada a partir de vendas do período.
 * R = dias desde última compra (no período), F = nº compras, V = valor total.
 * Heurística local — não substitui CRM completo.
 */

export type VendaRfvInput = {
  cliente_nome: string | null
  data: string | null
  total_liquido: number
  status: string
}

/** Marcador interno do cliente sem nome; a UI traduz na exibição. */
export const CLIENTE_NAO_IDENTIFICADO = 'Cliente não identificado'

export type ClienteRfv = {
  cliente: string
  recenciaDias: number
  frequencia: number
  valor: number
  segmento: 'Campeões' | 'Fieis' | 'Em risco' | 'Hibernando' | 'Novos'
}

function daysBetween(iso: string, ateYmd: string): number {
  const last = new Date(iso)
  const end = new Date(`${ateYmd}T23:59:59.999Z`)
  if (Number.isNaN(last.getTime()) || Number.isNaN(end.getTime())) return 999
  return Math.max(0, Math.floor((end.getTime() - last.getTime()) / 86_400_000))
}

function segmentar(r: number, f: number, v: number, medianaV: number): ClienteRfv['segmento'] {
  if (f === 1 && r <= 30) return 'Novos'
  if (r <= 30 && f >= 3 && v >= medianaV) return 'Campeões'
  if (r <= 60 && f >= 2) return 'Fieis'
  if (r > 60 && f >= 2) return 'Em risco'
  return 'Hibernando'
}

export function construirSegmentacaoRfv(
  vendas: readonly VendaRfvInput[],
  ateYmd: string,
  limite = 40,
): ClienteRfv[] {
  const map = new Map<string, { last: string; freq: number; valor: number }>()

  for (const venda of vendas) {
    if (venda.status !== 'CONCLUIDA') continue
    const nome = (venda.cliente_nome ?? '').trim() || CLIENTE_NAO_IDENTIFICADO
    if (!venda.data) continue
    const prev = map.get(nome)
    if (!prev) {
      map.set(nome, { last: venda.data, freq: 1, valor: Number(venda.total_liquido) || 0 })
      continue
    }
    if (venda.data > prev.last) prev.last = venda.data
    prev.freq += 1
    prev.valor += Number(venda.total_liquido) || 0
  }

  const valores = [...map.values()].map((c) => c.valor).sort((a, b) => a - b)
  const medianaV = valores.length ? valores[Math.floor(valores.length / 2)]! : 0

  return [...map.entries()]
    .map(([cliente, c]) => {
      const recenciaDias = daysBetween(c.last, ateYmd)
      return {
        cliente,
        recenciaDias,
        frequencia: c.freq,
        valor: c.valor,
        segmento: segmentar(recenciaDias, c.freq, c.valor, medianaV),
      }
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite)
}
