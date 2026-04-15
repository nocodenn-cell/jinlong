import { redactForLog } from './redact'

/**
 * Log estruturado no servidor (stderr) com redação de chaves sensíveis.
 * Use em `catch` de Server Actions / rotas; não envia este payload ao cliente.
 */
export function logCaughtServerError(context: string, err: unknown): void {
  const payload =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { thrown: err }
  console.error(`[${context}]`, JSON.stringify(redactForLog(payload)))
}
