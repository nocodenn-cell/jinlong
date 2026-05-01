/**
 * Tipos para validação de senha do gerente - Refatorado para resolver SonarCloud
 */

export interface GerenteValidationParams {
  senha: string
  lojaId?: string
  deviceFingerprint?: string
  sessionId?: string
  userAgent?: string
  ipAddress?: string
  timestamp?: Date
  motivo?: string
  valor?: number
  operadorId?: string
  caixaId?: string
}

export interface ValidarSenhaGerenteResult {
  ok: true
  token: string
  expiraEm: string
  maxDescontoPercentual: number
  gerenteId: string
}

export interface ValidarSenhaGerenteError {
  ok: false
  error: string
  scope?: string
  lockUntil?: string
}

export type ValidarSenhaGerenteResultType = ValidarSenhaGerenteResult | ValidarSenhaGerenteError
