/** Helpers puros do modal Retirar / Ajustar — testáveis sem React. */

export function fmtQtd(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/** "Saldo: 9 → 5 (−4)". Sem valor válido, mostra só o saldo atual. */
export function previaAjuste(atual: number, novo: number | null): string {
  if (novo == null || !Number.isFinite(novo)) return `Saldo atual: ${fmtQtd(atual)}`
  const delta = Math.round((novo - atual) * 1000) / 1000
  if (delta === 0) return `Saldo: ${fmtQtd(atual)} (sem alteração)`
  const sinal = delta > 0 ? '+' : '−'
  return `Saldo: ${fmtQtd(atual)} → ${fmtQtd(novo)} (${sinal}${fmtQtd(Math.abs(delta))})`
}

/** Prévia da retirada: quantidade a remover → saldo resultante. */
export function previaRetirada(atual: number, qtdRetirar: number | null): string {
  if (qtdRetirar == null || !Number.isFinite(qtdRetirar) || qtdRetirar <= 0) {
    return `Saldo atual: ${fmtQtd(atual)}`
  }
  const novo = Math.round((atual - qtdRetirar) * 1000) / 1000
  return `Saldo: ${fmtQtd(atual)} → ${fmtQtd(novo)} (−${fmtQtd(qtdRetirar)})`
}

export function parseQtdPositiva(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function parseQtdNaoNegativa(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function saldoAposRetirada(atual: number, qtdRetirar: number): number {
  return Math.round((atual - qtdRetirar) * 1000) / 1000
}

export function diferencaAjuste(sistema: number, contada: number): number {
  return Math.round((contada - sistema) * 1000) / 1000
}

export type ValidacaoRetirada =
  | { ok: true; qtd: number; novoSaldo: number }
  | { ok: false; erro: 'vazio' | 'invalido' | 'excede' }

export function validarRetirada(atual: number, raw: string): ValidacaoRetirada {
  const t = raw.trim()
  if (!t) return { ok: false, erro: 'vazio' }
  const n = Number(t.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return { ok: false, erro: 'invalido' }
  if (n > atual) return { ok: false, erro: 'excede' }
  return { ok: true, qtd: n, novoSaldo: saldoAposRetirada(atual, n) }
}
