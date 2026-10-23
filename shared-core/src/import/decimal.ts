/**
 * Aritmética decimal exata para o motor de landed cost.
 *
 * Representação: `bigint` com escala explícita passada em cada chamada
 * (valor real = v × 10^-escala). Não existe objeto "Decimal" nem escala
 * implícita: quem chama sempre informa de quantas casas está falando.
 *
 * Escopo deliberadamente restrito ao que o motor usa:
 * parse de string, formatação, reescala, produto e quociente com
 * arredondamento HALF_UP. Sem trigonometria, sem potência, sem contexto
 * global de precisão.
 *
 * Arredondamento HALF_UP: empate vai para longe de zero
 * (2.5 → 3, −2.5 → −3). Política aprovada para o motor (DECISÃO-06).
 */

import { LANDED_ERROR_CODES, type LandedErroCodigo } from './errorCodes'

/** Erro de aritmética ou formato. O motor converte em `LandedErro`. */
export class DecimalErro extends Error {
  readonly codigo: LandedErroCodigo
  constructor(codigo: LandedErroCodigo, detalhe?: string) {
    super(detalhe ? `${codigo}: ${detalhe}` : codigo)
    this.name = 'DecimalErro'
    this.codigo = codigo
  }
}

const FORMATO = /^-?\d+(\.\d+)?$/

/** 10^n como bigint. Só para n ≥ 0. */
export function potencia10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0) throw new DecimalErro(LANDED_ERROR_CODES.DECIMAL_FORMATO, `escala ${n}`)
  return 10n ** BigInt(n)
}

/**
 * Lê uma string decimal com no máximo `escala` casas.
 * Aceita sinal de menos. Rejeita sinal de mais, notação científica, ponto
 * sem dígito antes ou depois, espaços e vírgula.
 * Zeros à direita contam como casas: "1.000000000" com escala 6 é erro.
 */
export function parseDecimal(texto: unknown, escala: number): bigint {
  if (typeof texto !== 'string' || !FORMATO.test(texto)) {
    throw new DecimalErro(LANDED_ERROR_CODES.DECIMAL_FORMATO, String(texto))
  }
  const negativo = texto.startsWith('-')
  const semSinal = negativo ? texto.slice(1) : texto
  const [inteira, fracao = ''] = semSinal.split('.')
  if (fracao.length > escala) {
    throw new DecimalErro(LANDED_ERROR_CODES.DECIMAL_ESCALA_EXCEDIDA, `${texto} (máximo ${escala} casas)`)
  }
  const v = BigInt(inteira + fracao.padEnd(escala, '0'))
  return negativo ? -v : v
}

/** Divisão inteira com arredondamento HALF_UP (empate longe de zero). `den` > 0. */
export function arredondaHalfUp(num: bigint, den: bigint): bigint {
  if (den <= 0n) throw new DecimalErro(LANDED_ERROR_CODES.DIVISAO_POR_ZERO)
  const negativo = num < 0n
  const a = negativo ? -num : num
  let q = a / den
  if ((a % den) * 2n >= den) q += 1n
  return negativo ? -q : q
}

/** Reescala `v` de `de` casas para `para` casas. Reduzir casas arredonda HALF_UP. */
export function reescala(v: bigint, de: number, para: number): bigint {
  if (de === para) return v
  if (de < para) return v * potencia10(para - de)
  return arredondaHalfUp(v, potencia10(de - para))
}

/** Produto de `a` (escala `sa`) por `b` (escala `sb`), resultado na escala `para`. */
export function multiplica(a: bigint, sa: number, b: bigint, sb: number, para: number): bigint {
  return reescala(a * b, sa + sb, para)
}

/**
 * Quociente de `a` (escala `sa`) por `b` (escala `sb`), resultado na escala `para`.
 * Valor real = (a·10^-sa) / (b·10^-sb), guardado como inteiro na escala `para`.
 */
export function divide(a: bigint, sa: number, b: bigint, sb: number, para: number): bigint {
  if (b === 0n) throw new DecimalErro(LANDED_ERROR_CODES.DIVISAO_POR_ZERO)
  const numerador = a * potencia10(sb + para)
  const denominador = b * potencia10(sa)
  // Sinal do denominador é normalizado para arredondar corretamente
  return denominador < 0n
    ? arredondaHalfUp(-numerador, -denominador)
    : arredondaHalfUp(numerador, denominador)
}

/** Formata `v` (escala `escala`) como string com exatamente `escala` casas. */
export function formataDecimal(v: bigint, escala: number): string {
  const negativo = v < 0n
  const a = negativo ? -v : v
  const p = potencia10(escala)
  const inteira = (a / p).toString()
  const fracao = (a % p).toString().padStart(escala, '0')
  const sinal = negativo ? '-' : ''
  return escala === 0 ? `${sinal}${inteira}` : `${sinal}${inteira}.${fracao}`
}
