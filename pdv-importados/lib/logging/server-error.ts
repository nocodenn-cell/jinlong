import { serverLogger } from '../../../shared/unified-logger';

/**
 * Log estruturado no servidor (stderr) com redação de chaves sensíveis.
 * Use em `catch` de Server Actions / rotas; não envia este payload ao cliente.
 */
export function logCaughtServerError(context: string, err: unknown): void {
  serverLogger.logCaughtServerError(context, err);
}
