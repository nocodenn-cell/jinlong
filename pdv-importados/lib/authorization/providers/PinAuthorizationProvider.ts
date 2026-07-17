import type { AuthorizationProvider } from '../AuthorizationProvider'
import { AuthorizationMethod, type AuthorizationInput, type AuthorizationResult } from '../types'

/**
 * Stub — sem fluxo de PIN implementado ainda (nem UI de captura, nem RPC de
 * validação de PIN). Existe para o enum/contrato ficarem completos e para
 * `AuthorizationService` não precisar de um caso especial quando o PIN for
 * implementado de fato: só trocar este arquivo por uma implementação real.
 */
export class PinAuthorizationProvider implements AuthorizationProvider {
  readonly method = AuthorizationMethod.PIN

  async authorize(_input: AuthorizationInput): Promise<AuthorizationResult> {
    return {
      ok: false,
      error: 'Autorização por PIN ainda não está disponível.',
      method: this.method,
    }
  }
}
