import type { AuthorizationProvider } from './AuthorizationProvider'
import { AuthorizationMethod, type AuthorizationInput, type AuthorizationResult } from './types'

/**
 * Serviço de domínio: única porta de entrada para autorização privilegiada
 * do lado do cliente. Nenhuma operação (cancelar venda, devolução, desconto,
 * sangria, suprimento, reabertura de caixa...) deve conhecer PasswordAuthorization
 * Provider, PinAuthorizationProvider ou QrCodeAuthorizationProvider diretamente —
 * só chama `authorize({ operation, request })` e recebe um token opaco.
 */
export class AuthorizationService {
  private readonly providers: Partial<Record<AuthorizationMethod, AuthorizationProvider>>

  constructor(providers: AuthorizationProvider[]) {
    this.providers = Object.fromEntries(providers.map((p) => [p.method, p]))
  }

  async authorize(input: AuthorizationInput): Promise<AuthorizationResult> {
    const provider = this.providers[input.request.method]
    if (!provider) {
      return {
        ok: false,
        error: 'Método de autorização não suportado.',
        method: input.request.method,
      }
    }
    return provider.authorize(input)
  }
}
