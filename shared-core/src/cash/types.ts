/**
 * Tipos de domínio — cash (turno físico).
 * ADR-009 · ADR-CAIXA-002.
 * Sem I/O. Helpers PDV permanecem em `shared-core/caixa`.
 */

export type CaixaId = string
export type OperadorId = string
export type LojaId = string
export type MovimentacaoId = string

export type CashSessionStatus = 'ABERTO' | 'FECHADO' | 'ERRO'

export type CashSession = {
  caixaId: CaixaId
  status: 'ABERTO'
  dataAbertura: string
  valorInicial: number
  /** Esperado \(E(c)\) quando a RPC de status o expõe. */
  valorSistemaDinheiro: number
  blindClosureEnabled: boolean
}

export type CashMovementType = 'SANGRIA' | 'SUPRIMENTO' | string
export type CashMovementStatus = 'PENDENTE' | 'APROVADO' | 'CANCELADO' | string

export type CashMovement = {
  movimentacaoId: MovimentacaoId
  caixaId: CaixaId
  tipo: CashMovementType
  valor: number
  status: CashMovementStatus
  motivo: string | null
  createdAt: string | null
}
