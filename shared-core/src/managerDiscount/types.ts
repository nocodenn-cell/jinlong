export interface ValidarGerenteInput {
  senha: string
  lojaId?: string
  deviceFingerprint?: string
}

export interface ValidarGerenteOk {
  ok: true
  token: string
  expiraEm: string
  maxDescontoPercentual: number
  gerenteId: string
}

export interface ValidarGerenteErro {
  ok: false
  error: string
  scope?: string
  lockUntil?: string
}

export type ValidarGerenteResult = ValidarGerenteOk | ValidarGerenteErro

export type DescontoGerenteValidationFailure =
  | 'PERCENTUAL_NEGATIVO'
  | 'PERCENTUAL_ACIMA_DO_LIMITE'
  | 'TETO_NEGATIVO'

export type ValidarPercentualPermitidoResult =
  | { ok: true }
  | { ok: false; motivo: DescontoGerenteValidationFailure }

export interface AplicarDescontoGerenteInput {
  totalLiquido: number
  percentual: number
  maxPermitido: number
}

export interface AplicarDescontoGerenteResult {
  percentualClamped: number
  descontoValor: number
  totalLiquidoComDesconto: number
}
