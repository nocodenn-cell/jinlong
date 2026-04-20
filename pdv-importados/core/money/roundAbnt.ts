/**
 * Arredondamento monetário alinhado a `public.round_abnt(value, scale)` no Postgres
 * (migration `055_round_abnt_finalize_v2.sql` → `ROUND(p_value::numeric, p_scale)`).
 *
 * No motor JS usamos `Intl.NumberFormat` com `roundingMode: 'halfExpand'` (meio para longe de zero),
 * equivalente ao `ROUND` de `numeric` no PostgreSQL para os casos de caixa/preço.
 */
const intlByScale = new Map<number, Intl.NumberFormat>()
const intlUnavailable = new Set<number>()

function intlHalfExpand(scale: number): Intl.NumberFormat | null {
  if (intlUnavailable.has(scale)) return null
  const hit = intlByScale.get(scale)
  if (hit) return hit
  try {
    const options: Intl.NumberFormatOptions & { roundingMode?: 'halfExpand' } = {
      minimumFractionDigits: scale,
      maximumFractionDigits: scale,
      roundingMode: 'halfExpand',
      useGrouping: false,
    }
    const f = new Intl.NumberFormat('en-US', options)
    intlByScale.set(scale, f)
    return f
  } catch {
    intlUnavailable.add(scale)
    return null
  }
}

/** Fallback quando `roundingMode` não existe (meio para longe de zero em `scale`). */
function roundAbntFallback(value: number, scale: number): number {
  const factor = 10 ** scale
  const x = value * factor
  const sign = x < 0 ? -1 : x > 0 ? 1 : 0
  if (sign === 0) return 0
  const abs = Math.abs(x)
  const ip = Math.floor(abs + 1e-11)
  const frac = abs - ip
  if (frac + 1e-11 < 0.5) return (sign * ip) / factor
  if (frac - 1e-11 > 0.5) return (sign * (ip + 1)) / factor
  return (sign * (ip + 1)) / factor
}

/**
 * @param value valor finito
 * @param scale casas decimais (0–6; caixa usa 2, quantidades até 3)
 */
export function roundAbnt(value: number, scale = 2): number {
  if (!Number.isFinite(value)) return value
  if (scale < 0 || scale > 6) {
    throw new RangeError('roundAbnt: scale deve estar entre 0 e 6')
  }
  const intl = intlHalfExpand(scale)
  if (intl) return Number(intl.format(value))
  return roundAbntFallback(value, scale)
}
