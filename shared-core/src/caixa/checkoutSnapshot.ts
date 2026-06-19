/**
 * Guard rail de transação (invariante como código) — SNAPSHOT DE VENDA.
 *
 * Antes de finalizar uma venda o front constrói um snapshot IMUTÁVEL do carrinho
 * e o valida contra a função canônica de totalização (`calcularTotais`). Qualquer
 * inconsistência (preço/quantidade não-finita, total negativo, divergência entre
 * o total exibido e o derivado dos itens) BLOQUEIA a finalização com erro
 * explícito — nunca um fallback silencioso.
 *
 * Princípios atendidos:
 *  - SINGLE SOURCE OF TRUTH: totais sempre reconciliados via `calcularTotais`.
 *  - FAIL FAST VISUAL: divergência vira violação explícita, não correção oculta.
 *  - SNAPSHOT IMUTÁVEL: o objeto retornado é `Object.freeze`-ado; o payload da
 *    venda deve derivar dele, não do estado mutável do store.
 */
import { calcularTotais, type ItemCarrinho } from '../stores/unifiedCartStore'
import { MONEY_TOLERANCE, roundMoney2 } from '../pdv/invariants/money'

export const CHECKOUT_VIOLATION_CODES = [
  'CART_EMPTY',
  'ITEM_INVALID',
  'PRICE_NOT_FINITE',
  'PRICE_NEGATIVE',
  'QUANTITY_INVALID',
  'UNIT_ABOVE_ORIGINAL',
  'TOTAL_NOT_FINITE',
  'TOTAL_NEGATIVE',
  'TOTAL_MISMATCH',
] as const

export type CheckoutViolationCode = (typeof CHECKOUT_VIOLATION_CODES)[number]

export type CheckoutViolation = {
  code: CheckoutViolationCode
  message: string
  /** Índice do item na linha do carrinho, quando aplicável. */
  itemIndex?: number
}

export type CheckoutSnapshotItem = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'
}

export type DeclaredTotals = {
  totalBruto: number
  totalLiquido: number
  totalDesconto: number
}

export type CheckoutSnapshot = Readonly<
  {
    readonly itens: ReadonlyArray<Readonly<CheckoutSnapshotItem>>
  } & DeclaredTotals
>

export type CheckoutValidationResult = {
  ok: boolean
  violations: CheckoutViolation[]
}

function isFinitePositive(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

function isFiniteNonNegative(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
}

/**
 * Constrói o snapshot imutável da venda a partir das linhas do carrinho e dos
 * totais exibidos. Não corrige valores — apenas congela o que será validado e
 * (se válido) enviado ao servidor.
 */
export function buildCheckoutSnapshot(
  itens: ItemCarrinho[],
  declared: DeclaredTotals,
): CheckoutSnapshot {
  const snapItens = itens.map((i) =>
    Object.freeze<CheckoutSnapshotItem>({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      precoOriginal: i.resultado?.precoOriginal ?? i.precoOriginal ?? 0,
      precoUnitario: i.resultado?.precoUnitario ?? i.precoUnitario ?? 0,
      tipoPreco: i.resultado?.tipoPreco ?? 'VAREJO',
    }),
  )
  return Object.freeze({
    itens: Object.freeze(snapItens),
    totalBruto: declared.totalBruto,
    totalLiquido: declared.totalLiquido,
    totalDesconto: declared.totalDesconto,
  })
}

/**
 * Valida o snapshot. Reconciliação de totais é feita contra `calcularTotais`
 * (fonte única). `tolerance` cobre arredondamento de centavos.
 */
export function validateCheckoutSnapshot(
  snapshot: CheckoutSnapshot,
  tolerance = MONEY_TOLERANCE,
): CheckoutValidationResult {
  const violations: CheckoutViolation[] = []

  if (snapshot.itens.length === 0) {
    violations.push({ code: 'CART_EMPTY', message: 'Carrinho vazio — nada a finalizar.' })
  }

  snapshot.itens.forEach((item, index) => {
    if (!item.produtoId || typeof item.produtoId !== 'string') {
      violations.push({ code: 'ITEM_INVALID', message: 'Item sem produtoId.', itemIndex: index })
    }
    if (!isFinitePositive(item.quantidade)) {
      violations.push({
        code: 'QUANTITY_INVALID',
        message: `Quantidade inválida (${item.quantidade}).`,
        itemIndex: index,
      })
    }
    for (const [campo, valor] of [
      ['precoOriginal', item.precoOriginal],
      ['precoUnitario', item.precoUnitario],
    ] as const) {
      if (!Number.isFinite(valor)) {
        violations.push({
          code: 'PRICE_NOT_FINITE',
          message: `${campo} não-finito (${valor}).`,
          itemIndex: index,
        })
      } else if (valor < 0) {
        violations.push({
          code: 'PRICE_NEGATIVE',
          message: `${campo} negativo (${valor}).`,
          itemIndex: index,
        })
      }
    }
    if (
      Number.isFinite(item.precoOriginal) &&
      Number.isFinite(item.precoUnitario) &&
      item.precoUnitario > item.precoOriginal + tolerance
    ) {
      violations.push({
        code: 'UNIT_ABOVE_ORIGINAL',
        message: `precoUnitario (${item.precoUnitario}) acima do precoOriginal (${item.precoOriginal}).`,
        itemIndex: index,
      })
    }
  })

  for (const [campo, valor] of [
    ['totalBruto', snapshot.totalBruto],
    ['totalLiquido', snapshot.totalLiquido],
    ['totalDesconto', snapshot.totalDesconto],
  ] as const) {
    if (!Number.isFinite(valor)) {
      violations.push({ code: 'TOTAL_NOT_FINITE', message: `${campo} não-finito (${valor}).` })
    } else if (valor < 0) {
      violations.push({ code: 'TOTAL_NEGATIVE', message: `${campo} negativo (${valor}).` })
    }
  }

  // Reconciliação contra a fonte única de verdade. Só roda se os itens forem
  // estruturalmente sãos — senão `calcularTotais` produziria ruído redundante.
  const itensSaos = !violations.some(
    (v) => v.code === 'QUANTITY_INVALID' || v.code === 'PRICE_NOT_FINITE',
  )
  if (itensSaos && snapshot.itens.length > 0) {
    const canonico = calcularTotais(
      snapshot.itens.map((i) => ({
        id: i.produtoId,
        produtoId: i.produtoId,
        nome: '',
        quantidade: i.quantidade,
        precoOriginal: i.precoOriginal,
        precoUnitario: i.precoUnitario,
      })),
    )
    if (Math.abs(roundMoney2(canonico.totalBruto) - roundMoney2(snapshot.totalBruto)) > tolerance) {
      violations.push({
        code: 'TOTAL_MISMATCH',
        message: `totalBruto exibido (${snapshot.totalBruto}) diverge do derivado dos itens (${canonico.totalBruto}).`,
      })
    }
    if (Math.abs(roundMoney2(canonico.totalLiquido) - roundMoney2(snapshot.totalLiquido)) > tolerance) {
      violations.push({
        code: 'TOTAL_MISMATCH',
        message: `totalLiquido exibido (${snapshot.totalLiquido}) diverge do derivado dos itens (${canonico.totalLiquido}).`,
      })
    }
  }

  return { ok: violations.length === 0, violations }
}
