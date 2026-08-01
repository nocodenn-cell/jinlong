/**
 * Máquina de estados mínima do recebimento (Onda B).
 *
 * Espelha o CHECK de `remessas.status` e as pré-condições das RPCs
 * `registrar_conferencia_remessa` / `confirmar_remessa_entrada`. A RPC repete a
 * checagem porque concorrência é problema do banco; aqui a regra fica testável
 * sem banco e a UI consegue habilitar botão sem adivinhar.
 */

export const RECEBIMENTO_STATUS = [
  'RASCUNHO',
  'EM_CONFERENCIA',
  'CONFERIDO',
  'DIVERGENTE',
  'CONCLUIDA',
  'CANCELADA',
] as const

export type RecebimentoStatus = (typeof RECEBIMENTO_STATUS)[number]

/** Origem da expectativa — determina pré-preenchimento, nunca comportamento. */
export const RECEBIMENTO_ORIGENS = ['NFE', 'ORDEM_COMPRA', 'SEM_DOCUMENTO'] as const
export type RecebimentoOrigem = (typeof RECEBIMENTO_ORIGENS)[number]

export const RECEBIMENTO_TRANSITIONS: Readonly<
  Record<RecebimentoStatus, readonly RecebimentoStatus[]>
> = {
  RASCUNHO: ['EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE', 'CANCELADA'],
  EM_CONFERENCIA: ['EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE', 'CANCELADA'],
  // Recontagem permitida: quem contou errado conta de novo sem abrir outro recebimento.
  CONFERIDO: ['EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE', 'CONCLUIDA', 'CANCELADA'],
  DIVERGENTE: ['EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE', 'CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
}

export function podeTransicionarRecebimento(
  de: RecebimentoStatus,
  para: RecebimentoStatus,
): boolean {
  return RECEBIMENTO_TRANSITIONS[de]?.includes(para) ?? false
}

export function isRecebimentoFinalizado(status: RecebimentoStatus): boolean {
  return RECEBIMENTO_TRANSITIONS[status]?.length === 0
}

/** Registrar contagem: só recebimento aberto ou já conferido (recontagem). */
export function podeConferirRecebimento(status: RecebimentoStatus): boolean {
  return status === 'RASCUNHO' || status === 'EM_CONFERENCIA'
    || status === 'CONFERIDO' || status === 'DIVERGENTE'
}

/**
 * Confirmar move saldo. Exige ter passado pela conferência — é a regra que a
 * Onda B introduz.
 */
export function podeConfirmarRecebimento(status: RecebimentoStatus): boolean {
  return podeTransicionarRecebimento(status, 'CONCLUIDA')
}

export type ItemConferencia = {
  quantidadeEsperada: number
  /** `null` = não contado. `0` = contado e não veio — casos diferentes. */
  quantidadeConferida: number | null
}

/** Tolerância de arredondamento: `numeric(10,3)` no banco. */
const EPSILON = 1e-6

export function temItemNaoConferido(itens: readonly ItemConferencia[]): boolean {
  return itens.some((i) => i.quantidadeConferida === null)
}

export function contarDivergencias(itens: readonly ItemConferencia[]): number {
  return itens.filter(
    (i) =>
      i.quantidadeConferida !== null &&
      Math.abs(i.quantidadeConferida - i.quantidadeEsperada) > EPSILON,
  ).length
}

/**
 * Status derivado da contagem — mesma regra da RPC. Nunca é escolhido por quem
 * chama.
 */
export function statusAposConferencia(itens: readonly ItemConferencia[]): RecebimentoStatus {
  if (itens.length === 0 || temItemNaoConferido(itens)) return 'EM_CONFERENCIA'
  return contarDivergencias(itens) > 0 ? 'DIVERGENTE' : 'CONFERIDO'
}
