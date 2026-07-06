import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'

export const LIMITE_DIVERGENCIA_FECHAMENTO = 5

export function parseMoneyInput(v: number): number | null {
  if (!Number.isFinite(v)) return null
  if (v < 0) return null
  return roundMoney2(v)
}
