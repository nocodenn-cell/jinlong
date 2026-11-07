/**
 * Regras puras dos formulários do hub de importações (sem React), testáveis isoladamente.
 */

export const MOEDAS_COMUNS = ['USD', 'CNY', 'EUR', 'BRL', 'HKD', 'JPY'] as const

/** Mesmo formato aceito pelo servidor (actions-configuracao.ts, `Pct`). */
const PCT_RE = /^\d{1,2}([.,]\d{1,4})?$/

export function percentualOverrideValido(v: string): boolean {
  return PCT_RE.test(v)
}

type OverrideChave = { tributo: string; ncm_prefixo: string }

/**
 * Override já cadastrado com a mesma chave do upsert (empresa, tributo, ncm_prefixo).
 * Salvar com essa chave SUBSTITUI a alíquota existente — a UI usa isto para avisar antes.
 */
export function existeOverride<T extends OverrideChave>(lista: readonly T[] | null | undefined, tributo: string, ncmPrefixo: string): T | null {
  const ncm = ncmPrefixo.trim()
  return lista?.find((o) => o.tributo === tributo && (o.ncm_prefixo ?? '') === ncm) ?? null
}

/** Opções do select de moeda; um código legado fora da lista é mantido para não perder o dado. */
export function opcoesMoeda(atual: string): { valor: string; rotulo: string }[] {
  const lista: string[] = [...MOEDAS_COMUNS]
  if (atual && !lista.includes(atual)) lista.push(atual)
  return lista.map((m) => ({ valor: m, rotulo: m }))
}
