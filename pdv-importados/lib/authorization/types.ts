/**
 * Domínio de Autorização Privilegiada — tipos compartilhados.
 *
 * SSoT real da decisão "autorizado ou não" é a RPC `autorizar_operacao_
 * privilegiada` no banco (migration 272): perfil próprio (GERENTE/DONO/ADMIN)
 * OU um token válido de `tokens_desconto_gerente`. Este módulo cliente NÃO
 * reimplementa essa regra — ele só decide QUAL provider usar para obter um
 * token (ou para deixar o backend confirmar perfil próprio), mantendo as
 * operações de negócio (cancelar venda, devolução, desconto, sangria...)
 * completamente alheias ao método usado.
 */

/** Métodos de autorização suportados. Preparado para futuras extensões (biometria). */
export enum AuthorizationMethod {
  PASSWORD = 'PASSWORD',
  PIN = 'PIN',
  QR_CODE = 'QR_CODE',
}

/** Operações privilegiadas que passam pela autorização de gerente. */
export enum OperacaoPrivilegiada {
  CANCELAR_VENDA = 'CANCELAR_VENDA',
  DEVOLVER_VENDA = 'DEVOLVER_VENDA',
  TROCA = 'TROCA',
  DESCONTO_GERENTE = 'DESCONTO_GERENTE',
  SANGRIA = 'SANGRIA',
  SUPRIMENTO = 'SUPRIMENTO',
  REABERTURA_CAIXA = 'REABERTURA_CAIXA',
}

/** O que o caller já coletou antes de pedir autorização — varia por método. */
export type AuthorizationRequest =
  | { method: AuthorizationMethod.PASSWORD; senha: string; deviceFingerprint?: string }
  | { method: AuthorizationMethod.PIN; pin: string; deviceFingerprint?: string }
  | { method: AuthorizationMethod.QR_CODE; deviceFingerprint?: string }

export type AuthorizationInput = {
  operation: OperacaoPrivilegiada
  request: AuthorizationRequest
  lojaId?: string | null
  caixaId?: string | null
}

/**
 * Resultado normalizado: `token` é sempre um token de `tokens_desconto_
 * gerente`, independente do método usado para obtê-lo — é isso que permite
 * as RPCs de cancelamento/devolução/futuras operações privilegiadas
 * nunca precisarem saber como o token foi emitido.
 */
export type AuthorizationResult =
  | { ok: true; token: string; method: AuthorizationMethod }
  | { ok: false; error: string; method: AuthorizationMethod }

export type AuthorizationChallengeStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONSUMED'

export type AuthorizationChallenge = {
  id: string
  status: AuthorizationChallengeStatus
  expiresAt: string
  token: string | null
}
