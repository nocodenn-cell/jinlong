import { CUSTOMER_ERROR_CODES } from '../errorCodes'
import type {
  ClienteAnonymizePayload,
  ClienteExclusionDecision,
  ClienteExclusionFacts,
} from '../contracts'

/** Nome marcado após anonimização LGPD (action legada). */
export const CLIENTE_NOME_ANONIMIZADO = 'CLIENTE_ANONIMIZADO_LGPD' as const

/** Campos gravados na anonimização — espelho da action legada. */
export const CLIENTE_ANONIMIZACAO_PAYLOAD: ClienteAnonymizePayload = {
  nome: CLIENTE_NOME_ANONIMIZADO,
  documento: null,
  telefone: null,
  email: null,
  endereco: null,
  ativo: false,
}

/** String PT legada — borda preferirá `code` + catálogo. */
export function mensagemCrediarioAberto(nome: string): string {
  return `Cliente "${nome}" possui crediário aberto. Quite o saldo antes de excluir.`
}

/**
 * Decide efeito de exclusão sem I/O.
 *
 * Ordem legada:
 * 1. saldo_crediario > 0 → reject
 * 2. histórico em contas_receber → anonymize
 * 3. senão → delete físico
 */
export function decideClienteExclusion(facts: ClienteExclusionFacts): ClienteExclusionDecision {
  if (Number(facts.saldoCrediario) > 0) {
    return {
      action: 'reject',
      code: CUSTOMER_ERROR_CODES.HAS_OPEN_CREDIT,
      error: mensagemCrediarioAberto(facts.nome),
      params: { nome: facts.nome },
    }
  }
  if (facts.temHistoricoContasReceber) {
    return { action: 'anonymize' }
  }
  return { action: 'delete' }
}
