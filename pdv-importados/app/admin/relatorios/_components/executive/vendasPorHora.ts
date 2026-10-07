/**
 * Agrega vendas por hora do dia (0–23) a partir de timestamps ISO.
 * Pure helper — sem I/O.
 */

export type VendaComHorario = {
  data: string | null
  total_liquido: number
  status: string
}

export type HoraBucket = {
  hour: number
  label: string
  total: number
  count: number
}

function parseHour(iso: string | null, timeZone?: string): number | null {
  if (!iso) return null
  try {
    if (timeZone) {
      const parts = new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        hour12: false,
        timeZone,
      }).formatToParts(new Date(iso))
      const hourPart = parts.find((p) => p.type === 'hour')?.value
      const hour = hourPart != null ? Number(hourPart) : Number.NaN
      return Number.isFinite(hour) ? hour % 24 : null
    }
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.getHours()
  } catch {
    return null
  }
}

/** Soma faturamento de vendas CONCLUIDA por hora civil. */
export function agruparVendasPorHora(
  vendas: readonly VendaComHorario[],
  timeZone?: string,
): HoraBucket[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}h`,
    total: 0,
    count: 0,
  }))

  for (const venda of vendas) {
    if (venda.status !== 'CONCLUIDA') continue
    const hour = parseHour(venda.data, timeZone)
    if (hour == null) continue
    const bucket = buckets[hour]
    if (!bucket) continue
    bucket.total += Number(venda.total_liquido) || 0
    bucket.count += 1
  }

  return buckets
}

export function picoDeVendas(buckets: readonly HoraBucket[]): HoraBucket | null {
  let best: HoraBucket | null = null
  for (const b of buckets) {
    if (!best || b.total > best.total) best = b
  }
  return best && best.total > 0 ? best : null
}
