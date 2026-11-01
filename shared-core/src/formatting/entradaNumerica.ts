/**
 * Parsers estritos de entrada numérica digitada ou colada pelo operador (pt-BR).
 *
 * Regra: entrada inválida vira `motivo`, nunca um valor "corrigido" em silêncio
 * ("10.50" não vira 1050, "-10" não vira 10, "1e5" não vira 15, "0,500" não vira 500).
 * Vazio retorna `value: null` (campo opcional). Sem React e sem I/O.
 *
 * Limites: quem chama passa `max` e `casas` do contrato da coluna destino. Não há
 * teto de negócio embutido aqui; tetos técnicos vêm do schema (ver constantes).
 */

/** Teto técnico de `numeric(10,2)` (preço de venda, atacado e custo hoje). */
export const MOEDA_MAX_NUMERIC_10_2 = 99_999_999.99

/** Teto técnico de `numeric(10,3)` (estoque, movimentos, itens de venda). */
export const QUANTIDADE_MAX_NUMERIC_10_3 = 9_999_999.999

/** Teto técnico de `integer` (ex.: `precos_atacado.quantidade_minima`). */
export const INTEIRO_MAX_INT4 = 2_147_483_647

/** Casas máximas que o parser aceita para custo, quando a coluna permitir (alinhado ao IM-F01). */
export const CASAS_MAX_CUSTO_CONFIGURAVEL = 6

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

export type OpcoesEntradaNumerica = Readonly<{
  /** Casas decimais aceitas (0 = inteiro). */
  casas: number
  /** Teto técnico do campo de destino. */
  max: number
}>

const PARTE_INTEIRA = '\\d{1,3}(?:\\.\\d{3})+|\\d+'

/**
 * Núcleo do parser pt-BR: inteiro com milhar opcional, vírgula e até `casas` decimais.
 * `10.50` não casa (ponto só é milhar com 3 dígitos) e é classificado à parte.
 */
function parsePtBR(raw: string, { casas, max }: OpcoesEntradaNumerica): ResultadoEntradaNumerica {
  const t = raw.trim()
  if (t === '') return { ok: true, value: null }
  if (t.startsWith('-')) return { ok: false, motivo: 'negativo' }

  const decimal = casas > 0 ? `(?:,(\\d{1,${casas}}))?` : ''
  const m = new RegExp(`^(${PARTE_INTEIRA})${decimal}$`).exec(t)
  if (!m) {
    if (casas === 0) {
      if (/^\d+[.,]\d+$/.test(t)) return { ok: false, motivo: 'fracionada' }
    } else {
      if (/^\d+\.\d+$/.test(t)) return { ok: false, motivo: 'separador_decimal' }
      if (new RegExp(`^\\d+,\\d{${casas + 1},}$`).test(t)) {
        return { ok: false, motivo: 'casas_decimais' }
      }
    }
    return { ok: false, motivo: 'formato' }
  }

  const inteiro = m[1].replace(/\./g, '')
  const decimais = (m[2] ?? '').padEnd(casas, '0')
  const value = Number(casas > 0 ? `${inteiro}.${decimais}` : inteiro)
  if (value > max) return { ok: false, motivo: 'faixa' }
  return { ok: true, value }
}

/** Moeda pt-BR com 2 casas e teto de `numeric(10,2)` (padrão de preço de venda). */
export function parseMoedaEntrada(raw: string): ResultadoEntradaNumerica {
  return parsePtBR(raw.trim().replace(/^R\$\s*/i, ''), {
    casas: 2,
    max: MOEDA_MAX_NUMERIC_10_2,
  })
}

/**
 * Valor monetário com casas e teto explícitos (ex.: custo com até 6 casas no futuro).
 * O chamador é responsável por `casas` coincidir com a coluna destino.
 */
export function parseValorEntrada(raw: string, opcoes: OpcoesEntradaNumerica): ResultadoEntradaNumerica {
  return parsePtBR(raw.trim().replace(/^R\$\s*/i, ''), opcoes)
}

/**
 * Quantidade: fracionada (até 3 casas, ex.: `0,500`) para unidades de peso ou
 * medida; inteira para unidades contáveis. Sem arredondamento: 0,5 continua 0,5.
 */
export function parseQuantidadeEntrada(
  raw: string,
  opcoes: Readonly<{ fracionada: boolean; max?: number }>,
): ResultadoEntradaNumerica {
  return parsePtBR(raw, {
    casas: opcoes.fracionada ? 3 : 0,
    max: opcoes.max ?? QUANTIDADE_MAX_NUMERIC_10_3,
  })
}

/** Quantidade inteira (estoque de unidade contável, gatilho e faixa de atacado). */
export function parseQuantidadeInteiraEntrada(
  raw: string,
  opcoes: Readonly<{ max?: number }> = {},
): ResultadoEntradaNumerica {
  return parseQuantidadeEntrada(raw, { fracionada: false, max: opcoes.max })
}
