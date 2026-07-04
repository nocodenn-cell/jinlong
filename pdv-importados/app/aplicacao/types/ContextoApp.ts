/**
 * ContextoApp: Contexto de Execução da Aplicação
 *
 * Informações sobre COMO e ONDE o comando está sendo executado.
 * Usado para rastreabilidade, auditoria e contexto de persistência.
 *
 * Domínio (pricing) nunca vê isso.
 */

export interface ContextoApp {
  /** Identificador único da loja (null = global) */
  lojaId: string | null

  /** Origem do comando (UI, CSV import, API, seed/test) */
  source: 'ui' | 'csv' | 'api' | 'seed'

  /** Usuário que originou o comando (para auditoria) */
  userId?: string
}
