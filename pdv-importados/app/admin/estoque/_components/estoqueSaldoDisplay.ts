/**
 * Severidade visual local da coluna Saldo (Saldos).
 * Evita pintar de vermelho todo SKU com mínimo 0 / sem mínimo.
 */

export type EstoqueSaldoTone = 'empty' | 'neutral-zero' | 'danger-zero' | 'low' | 'ok'

export function estoqueSaldoTone(
  value: number | null | undefined,
  minimo: number | null | undefined,
): EstoqueSaldoTone {
  if (value == null) return 'empty'
  if (value <= 0) {
    return minimo != null && minimo > 0 ? 'danger-zero' : 'neutral-zero'
  }
  if (minimo != null && value <= minimo) return 'low'
  return 'ok'
}
