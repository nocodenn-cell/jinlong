/**
 * Parsers estritos de entrada numérica digitada ou colada pelo operador.
 *
 * Regra: entrada inválida vira `motivo`, nunca um valor "corrigido" em silêncio
 * ("10.50" não vira 1050, "-10" não vira 10, "1e5" não vira 15).
 * Vazio retorna `value: null` (campo opcional). Sem React e sem I/O.
 */

/** Teto de dinheiro: espelha `numeric(10,2)` de `produtos.preco_*`. */
export const MOEDA_ENTRADA_MAX = 99_999_999.99

/** Teto de quantidade inteira digitada (estoque, mínimo, gatilho de atacado). */
export const QUANTIDADE_INTEIRA_ENTRADA_MAX = 9_999_999

export type MotivoEntradaNumerica =
  | 'formato'
  | 'separador_decimal'
  | 'casas_decimais'
  | 'fracionada'
  | 'negativo'
  | 'faixa'

export type ResultadoEntradaNumerica =
  | { ok: true; value: number | null }
  | { ok: false; motivo: MotivoEntradaNumerica }

/** `1234`, `1.234`, `1.234.567`, opcionalmente com `,` e 1 ou 2 casas. */
const MOEDA_PT_BR = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/

/**
 * Moeda em pt-BR: `10,50`, `1.234,56`, `R$ 1.234,56`, `1234`.
 * `10.50` é recusado (ponto não é decimal em pt-BR; evita confundir com milhar).
 */
export function parseMoedaEntrada(raw: string): ResultadoEntradaNumerica {
  const t = raw.trim().replace(/^R\$\s*/i, '')
  if (t === '') return { ok: true, value: null }
  if (t.startsWith('-')) return { ok: false, motivo: 'negativo' }

  const m = MOEDA_PT_BR.exec(t)
  if (!m) {
    if (/^\d+\.\d+$/.test(t)) return { ok: false, motivo: 'separador_decimal' }
    if (/^\d+,\d{3,}$/.test(t)) return { ok: false, motivo: 'casas_decimais' }
    return { ok: false, motivo: 'formato' }
  }

  const inteiro = m[1].replace(/\./g, '')
  const centavos = (m[2] ?? '').padEnd(2, '0')
  const value = Number(`${inteiro}.${centavos}`)
  if (value > MOEDA_ENTRADA_MAX) return { ok: false, motivo: 'faixa' }
  return { ok: true, value }
}

/** Quantidade inteira: `12`, `1.000`. Decimal (`0,500`, `10.5`) é recusado. */
export function parseQuantidadeInteiraEntrada(raw: string): ResultadoEntradaNumerica {
  const t = raw.trim()
  if (t === '') return { ok: true, value: null }
  if (t.startsWith('-')) return { ok: false, motivo: 'negativo' }

  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)$/.exec(t)
  if (!m) {
    if (/^\d+[.,]\d+$/.test(t)) return { ok: false, motivo: 'fracionada' }
    return { ok: false, motivo: 'formato' }
  }

  const value = Number(m[1].replace(/\./g, ''))
  if (value > QUANTIDADE_INTEIRA_ENTRADA_MAX) return { ok: false, motivo: 'faixa' }
  return { ok: true, value }
}
