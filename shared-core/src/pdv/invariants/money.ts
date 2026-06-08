export const MONEY_TOLERANCE = 0.02

export const LIMITE_DIVERGENCIA_FECHAMENTO = 5

export function roundMoney2(value: number): number {
  return Math.round(value * 100) / 100
}

export function moneyApproxEqual(a: number, b: number, tolerance = MONEY_TOLERANCE): boolean {
  return Math.abs(roundMoney2(a) - roundMoney2(b)) <= tolerance
}
