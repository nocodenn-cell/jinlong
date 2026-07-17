import { AuthorizationService } from './AuthorizationService'
import { PasswordAuthorizationProvider } from './providers/PasswordAuthorizationProvider'
import { PinAuthorizationProvider } from './providers/PinAuthorizationProvider'
import { QrCodeAuthorizationProvider } from './providers/QrCodeAuthorizationProvider'

export { AuthorizationService } from './AuthorizationService'
export type { AuthorizationProvider } from './AuthorizationProvider'
export * from './types'

/**
 * Instância padrão do serviço, com todos os providers registrados (mesmo os
 * stubs). Consumidores (hooks, Server Actions) devem importar isto em vez de
 * instanciar providers diretamente.
 */
export const authorizationService = new AuthorizationService([
  new PasswordAuthorizationProvider(),
  new PinAuthorizationProvider(),
  new QrCodeAuthorizationProvider(),
])
