import { criarAuthorizationChallengeCaixa } from '@/app/caixa/actions'
import type { AuthorizationProvider } from '../AuthorizationProvider'
import { AuthorizationMethod, type AuthorizationInput, type AuthorizationResult } from '../types'

/**
 * Stub desta sprint: cria um AuthorizationChallenge real (migration 274) —
 * isso já é suficiente para o app do gerente futuro ter algo para consultar
 * e aprovar. O que falta (fora de escopo aqui, por instrução explícita):
 * exibir o QR, o app mobile ler a câmera, aprovar remotamente, e este
 * provider fazer polling até status = APPROVED. Por isso `authorize()`
 * retorna erro mesmo criando o challenge — não há como completar a
 * autorização síncrona nesta sprint.
 *
 * Quando o app existir, a evolução é só: (1) exibir `payload.challengeId`
 * como QR na UI, (2) fazer polling de `obterAuthorizationChallengeCaixa`
 * até `status === 'APPROVED'` e devolver o `token`. Nenhuma operação de
 * negócio muda — elas continuam só chamando `authorization.authorize(...)`.
 */
export class QrCodeAuthorizationProvider implements AuthorizationProvider {
  readonly method = AuthorizationMethod.QR_CODE

  async authorize(input: AuthorizationInput): Promise<AuthorizationResult> {
    if (input.request.method !== AuthorizationMethod.QR_CODE) {
      return { ok: false, error: 'Requisição incompatível com o método QR_CODE.', method: this.method }
    }

    const challenge = await criarAuthorizationChallengeCaixa({
      operation: input.operation,
      method: this.method,
      caixaId: input.caixaId ?? null,
      deviceFingerprint: input.request.deviceFingerprint ?? null,
    })

    if (!challenge.ok) {
      return { ok: false, error: challenge.error, method: this.method }
    }

    return {
      ok: false,
      error:
        'Autorização por QR Code ainda não está disponível — falta o app do gerente para aprovar (challenge criado, aguardando integração mobile).',
      method: this.method,
    }
  }
}
