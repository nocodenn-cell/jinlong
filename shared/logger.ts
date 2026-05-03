/**
 * Logger unificado para todo o projeto
 * Este arquivo agora redireciona para o logger unificado para compatibilidade
 */

export { 
  logJson, 
  logCaughtServerError, 
  logger,
  redactForLog,
  type LogEntry,
  EdgeLogger,
  DesktopLogger,
  ServerLogger
} from './unified-logger.ts';