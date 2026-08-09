/** Helpers de apresentação (máscaras) — sem alterar contratos de payload. */

export const UFS_BR = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const

export const CSTS_COMUNS = ['00', '10', '20', '30', '40', '41', '50', '51', '60', '70', '90'] as const

export function digitsOnly(raw: string, max?: number): string {
  const d = raw.replace(/\D/g, '')
  return typeof max === 'number' ? d.slice(0, max) : d
}

export function maskCnpj(raw: string): string {
  const x = digitsOnly(raw, 14)
  if (x.length <= 2) return x
  if (x.length <= 5) return `${x.slice(0, 2)}.${x.slice(2)}`
  if (x.length <= 8) return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5)}`
  if (x.length <= 12) return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8)}`
  return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12)}`
}

export function maskTel(raw: string): string {
  const x = digitsOnly(raw, 11)
  if (x.length <= 2) return x
  if (x.length <= 6) return `(${x.slice(0, 2)}) ${x.slice(2)}`
  if (x.length <= 10) return `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}`
  return `(${x.slice(0, 2)}) ${x.slice(2, 3)} ${x.slice(3, 7)}-${x.slice(7)}`
}

export function maskCep(raw: string): string {
  const x = digitsOnly(raw, 8)
  if (x.length <= 5) return x
  return `${x.slice(0, 5)}-${x.slice(5)}`
}
