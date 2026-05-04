/**
 * Logger unificado para todo o projeto
 * Combina funcionalidades de Edge functions, desktop e server errors
 */

// Interface base para todos os logs
export interface LogEntry {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
  context?: Record<string, any>
  service?: string
}

// Configuração de redação de dados sensíveis (importado do server-error)
const DEFAULT_SENSITIVE_KEYS = new Set(
  [
    'password',
    'senha',
    'token',
    'access_token',
    'refresh_token',
    'authorization',
    'apikey',
    'api_key',
    'secret',
    'service_role',
    'cpf',
    'cnpj',
    'documento',
    'email',
    'email_address',
  ].map((k) => k.toLowerCase()),
)

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase()
  if (DEFAULT_SENSITIVE_KEYS.has(k)) return true
  if (k.endsWith('_token') || k.endsWith('token')) return true
  if (k.includes('password') || k.includes('senha')) return true
  return false
}

/**
 * Retorna uma cópia segura para log, mascarando chaves sensíveis
 */
export function redactForLog<T>(value: T, depth = 0): T {
  if (depth > 12) return '[MAX_DEPTH]' as T

  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    if (value.length > 200) return (`${value.slice(0, 80)}…[truncated]` as unknown) as T
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, depth + 1)) as T
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? '[REDACTED]' : redactForLog(v, depth + 1)
    }
    return out as T
  }

  return value
}

// Logger base com funcionalidades compartilhadas
class BaseLogger {
  protected createLogEntry(level: LogEntry['level'], message: string, context?: Record<string, any>): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    }
  }

  protected formatConsoleOutput(entry: LogEntry): string {
    const prefix = `[${entry.timestamp}] ${entry.level.toUpperCase()}:`
    return prefix
  }

  protected outputToConsole(entry: LogEntry): void {
    const prefix = this.formatConsoleOutput(entry)
    switch (entry.level) {
      case 'error':
        console.error(prefix, entry.message, entry.context)
        break
      case 'warn':
        console.warn(prefix, entry.message, entry.context)
        break
      default:
        console.log(prefix, entry.message, entry.context)
    }
  }
}

// Logger para Edge functions (compatibilidade com código existente)
export class EdgeLogger extends BaseLogger {
  logJson(svc: string, payload: Record<string, unknown>): void {
    const entry = this.createLogEntry('info', `Service: ${svc}`, payload)
    console.log(
      JSON.stringify({ ts: entry.timestamp, svc, ...payload })
    )
  }
}

// Logger para Desktop (com persistência)
export class DesktopLogger extends BaseLogger {
  private logs: LogEntry[] = []
  private maxLogs = 1000
  private storageKey = 'pdv_local_logs'

  private async persistLog(entry: LogEntry): Promise<void> {
    try {
      if (typeof globalThis === 'undefined') return
      const previous = globalThis.localStorage.getItem(this.storageKey)
      const parsed = previous ? (JSON.parse(previous) as LogEntry[]) : []
      parsed.push(entry)
      const bounded = parsed.slice(-this.maxLogs)
      globalThis.localStorage.setItem(this.storageKey, JSON.stringify(bounded))
    } catch {
      // Silently handle persistence errors
    }
  }

  private log(level: LogEntry['level'], message: string, context?: Record<string, any>): void {
    const entry = this.createLogEntry(level, message, context)

    // Buffer em memória
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // Console output
    this.outputToConsole(entry)

    // Persistência assíncrona
    this.persistLog(entry)
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, any>): void {
    this.log('error', message, context)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clearLogs(): void {
    this.logs = []
  }

  async getLogFileContent(): Promise<string> {
    try {
      if (typeof globalThis === 'undefined') return ''
      const value = globalThis.localStorage.getItem(this.storageKey)
      if (!value) return ''
      const logs = JSON.parse(value) as LogEntry[]
      return logs.map((log) => JSON.stringify(log)).join('\n')
    } catch {
      return ''
    }
  }
}

// Logger para Server errors (com redação de dados sensíveis)
export class ServerLogger extends BaseLogger {
  logCaughtServerError(context: string, err: unknown): void {
    const payload =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { thrown: err }
    
    const sanitizedPayload = redactForLog(payload)
    console.error(`[${context}]`, JSON.stringify(sanitizedPayload))
  }
}

// Instâncias globais para compatibilidade
export const edgeLogger = new EdgeLogger()
export const desktopLogger = new DesktopLogger()
export const serverLogger = new ServerLogger()

// Funções de compatibilidade para código existente
export function logJson(svc: string, payload: Record<string, unknown>): void {
  edgeLogger.logJson(svc, payload)
}

export function logCaughtServerError(context: string, err: unknown): void {
  serverLogger.logCaughtServerError(context, err)
}

// Exportar logger desktop como padrão para compatibilidade
export const logger = desktopLogger
