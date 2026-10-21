/**
 * Decimais do hub de Importações — sem float em nenhum ponto.
 * Entrada do usuário (pt-BR ou ponto) → texto canônico; exibição com separadores pt-BR;
 * somas exatas via bigint do próprio motor (shared-core/src/import/decimal).
 */
import { formataDecimal, parseDecimal, reescala } from '@shared-core/src/import/decimal'

/**
 * Normaliza o que o usuário digitou para decimal canônico ("1234.56").
 * Aceita "1.234,56", "1234,56", "1234.56" e sinal negativo quando `permitirNegativo`.
 * Recusa notação científica, letras e mais casas que `casas`. Retorna null se inválido.
 */
export function normalizarDecimal(
  bruto: string | null | undefined,
  casas: number,
  opts: { permitirNegativo?: boolean } = {},
): string | null {
  const t = (bruto ?? '').trim().replace(/\s+/g, '')
  if (!t) return null
  const neg = t.startsWith('-')
  if (neg && !opts.permitirNegativo) return null
  const corpo = neg ? t.slice(1) : t
  let inteiro: string
  let fracao = ''
  if (corpo.includes(',')) {
    // vírgula = decimal; pontos = milhar
    const partes = corpo.split(',')
    if (partes.length !== 2) return null
    inteiro = partes[0].replace(/\./g, '')
    fracao = partes[1]
    if (partes[0].includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(partes[0])) return null
  } else {
    const partes = corpo.split('.')
    if (partes.length > 2) return null
    inteiro = partes[0]
    fracao = partes[1] ?? ''
  }
  if (!/^\d+$/.test(inteiro || '0') || !/^\d*$/.test(fracao) || fracao.length > casas) return null
  const i = (inteiro || '0').replace(/^0+(?=\d)/, '')
  const valor = fracao ? `${i}.${fracao}` : i
  return neg && /[1-9]/.test(valor) ? `-${valor}` : valor
}

/** Exibe um decimal canônico com separador de milhar e vírgula (pt-BR). Mantém as casas recebidas. */
export function formatarDecimal(texto: string | number | null | undefined, opts: { casasMin?: number } = {}): string {
  if (texto === null || texto === undefined || texto === '') return '—'
  const s = String(texto).trim()
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s)
  if (!m) return s
  const [, sinal, int, frac = ''] = m
  const fracao = opts.casasMin && frac.length < opts.casasMin ? frac.padEnd(opts.casasMin, '0') : frac
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sinal}${milhar}${fracao ? ',' + fracao : ''}`
}

/** Soma exata de decimais em texto (escala fixa). Valores inválidos tornam o resultado null. */
export function somarDecimais(valores: readonly (string | null | undefined)[], escala: number): string | null {
  let total = 0n
  for (const v of valores) {
    if (v === null || v === undefined || v === '') continue
    try {
      total += parseDecimal(String(v), escala)
    } catch {
      return null
    }
  }
  return formataDecimal(total, escala)
}

/** Soma exata usando a maior escala presente nos valores (nenhuma casa é perdida). */
export function somarExato(valores: readonly (string | null | undefined)[]): string | null {
  const escala = Math.max(0, ...valores.map((v) => (v ? (String(v).split('.')[1] ?? '').length : 0)))
  return somarDecimais(valores, escala)
}

/** Diferença exata b − a (escala fixa). */
export function diferencaDecimal(a: string | null | undefined, b: string | null | undefined, escala: number): string | null {
  if (a == null || b == null) return null
  try {
    return formataDecimal(parseDecimal(String(b), escala) - parseDecimal(String(a), escala), escala)
  } catch {
    return null
  }
}

/** Completa com zeros até `casas` para exibição. Nunca corta nem arredonda casas existentes. */
export function comCasas(texto: string | null | undefined, casas: number): string | null {
  if (texto == null || texto === '') return null
  const s = String(texto)
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s
  const [int, frac = ''] = s.split('.')
  if (frac.length >= casas) return s
  return `${int}.${frac.padEnd(casas, '0')}`
}

/**
 * Resumo monetário (KPIs): 2 casas, HALF_UP (D4: resumos financeiros em duas casas).
 * Só para exibição de totais; memória de cálculo e custos unitários usam o valor exato.
 */
export function resumoMonetario(texto: string | null | undefined): string {
  if (texto == null || texto === '') return formatarDecimal('0.00')
  const s = String(texto)
  const casas = (s.split('.')[1] ?? '').length
  try {
    return formatarDecimal(formataDecimal(reescala(parseDecimal(s, casas), casas, 2), 2))
  } catch {
    return s
  }
}
