/**
 * ContextoApp — Contexto de Execução da Aplicação
 *
 * Request/Input contract for application execution context.
 * Contains information about HOW and WHERE the command is being executed.
 * Used for traceability, auditing, and persistence context.
 *
 * Domain (pricing) NEVER sees this.
 */

export interface ContextoApp {
  /** Identificador único da loja (null = global) */
  lojaId: string | null

  /** Origem do comando (UI, CSV import, API, seed/test) */
  source: 'ui' | 'csv' | 'api' | 'seed'

  /** Usuário que originou o comando (para auditoria) */
  userId?: string
}
