import type { CashErrorCode } from './errorCodes'
import type { CashMovement, CashSession, CaixaId, OperadorId } from './types'

export type CashSessionStatusResult =
  | { ok: true; status: 'FECHADO' }
  | { ok: true; status: 'ABERTO'; session: CashSession }
  | { ok: false; status: 'ERRO'; error: string; code?: CashErrorCode }

export type CashSessionReader = {
  getStatus(operadorId: OperadorId): Promise<CashSessionStatusResult>
}

export type OpenCashSessionCommand = {
  operadorId: OperadorId
  lojaId: string
  valorInicial: number
}

export type OpenCashSessionResult =
  | { ok: true; caixaId: CaixaId }
  | { ok: false; error: string; code?: CashErrorCode }

export type CloseCashSessionCommand = {
  operadorId: OperadorId
  valorContado: number
  motivo?: string
}

export type CloseCashSessionResult =
  | {
      ok: true
      caixaId: CaixaId
      valorSistemaDinheiro: number
      valorContado: number
      diferenca: number
      alreadyClosed: boolean
    }
  | { ok: false; error: string; code?: CashErrorCode }

export type CashSessionWriter = {
  open(command: OpenCashSessionCommand): Promise<OpenCashSessionResult>
  close(command: CloseCashSessionCommand): Promise<CloseCashSessionResult>
}

export type RegisterCashMovementCommand = {
  caixaId: CaixaId
  tipo: string
  formaPagamento: string
  valor: number
  motivo: string
  motivoCodigo?: string
  idempotencyKey: string
  operadorId: OperadorId
  status?: string | null
  gerenteId?: string | null
  deviceId?: string | null
  terminalId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  movimentacaoOrigemId?: string | null
}

export type RegisterCashMovementResult =
  | {
      ok: true
      movimentacaoId: string
      status: string
      saldoAtual: number
    }
  | { ok: false; error: string; code?: CashErrorCode }

export type CashMovementWriter = {
  register(command: RegisterCashMovementCommand): Promise<RegisterCashMovementResult>
}

export type ListCashMovementsResult =
  | { ok: true; movements: CashMovement[] }
  | { ok: false; error: string; code?: CashErrorCode }

export type CashMovementReader = {
  listByCaixa(caixaId: CaixaId): Promise<ListCashMovementsResult>
}
