import { validarGerenteDesconto } from '@/app/caixa/actions'
import type { AuthorizationProvider } from '../AuthorizationProvider'
import { AuthorizationMethod, type AuthorizationInput, type AuthorizationResult } from '../types'

/**
 * Método real e funcional hoje: senha do gerente → token único de curta
 * duração, emitido pela edge function `validar-gerente` (mesma usada pelo
 * desconto de gerente desde a Fase 5b). `operation`/`lojaId` não mudam
 * como a senha é validada — são só contexto para auditoria futura.
 */
export class PasswordAuthorizationProvider implements AuthorizationProvider {
  readonly method = AuthorizationMethod.PASSWORD

  async authorize(input: AuthorizationInput): Promise<AuthorizationResult> {
    if (input.request.method !== AuthorizationMethod.PASSWORD) {
      return { ok: false, error: 'Requisição incompatível com o método PASSWORD.', method: this.method }
    }

    try {
      const res = await validarGerenteDesconto({
        senha: input.request.senha,
        lojaId: input.lojaId ?? undefined,
        deviceFingerprint: input.request.deviceFingerprint,
      })
      if (!res.ok) return { ok: false, error: res.error, method: this.method }
      return { ok: true, token: res.token, method: this.method }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Falha ao validar a senha do gerente.',
        method: this.method,
      }
    }
  }
}
