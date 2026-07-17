import type { AuthorizationInput, AuthorizationMethod, AuthorizationResult } from './types'

/**
 * Contrato que qualquer método de autorização implementa. `AuthorizationService`
 * despacha para o provider correto por `request.method` — a operação chamadora
 * nunca importa um provider diretamente.
 */
export interface AuthorizationProvider {
  readonly method: AuthorizationMethod
  authorize(input: AuthorizationInput): Promise<AuthorizationResult>
}
