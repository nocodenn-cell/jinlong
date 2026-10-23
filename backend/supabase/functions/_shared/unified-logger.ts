/**
 * Logger unificado para todo o projeto
 * Combina funcionalidades de Edge functions, desktop e server errors
 */

export interface LogEntry {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
  context?: Record<string, unknown>
  service?: string
}

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

const MAX_REDACT_DEPTH = 12
const MAX_STRING_LOG_LENGTH = 200

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase()
  if (DEFAULT_SENSITIVE_KEYS.has(k)) return true
  if (k.endsWith('_token') || k.endsWith('token')) return true
  return k.includes('password') || k.includes('senha')
}

function redactString(value: string): string {
  if (value.length <= MAX_STRING_LOG_LENGTH) return value
  return `${value.slice(0, 80)}…[truncated]`
}

function redactObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = isSensitiveKey(k) ? '[REDACTED]' : redactForLog(v, depth + 1)
  }
  return out
}

/**
 * Retorna uma cópia segura para log, mascarando chaves sensíveis
 */
export function redactForLog<T>(value: T, depth = 0): T {
  if (depth > MAX_REDACT_DEPTH) return '[MAX_DEPTH]' as unknown as T
  if (value === null || value === undefined) return value

  const valueType = typeof value
  if (valueType === 'string') return redactString(value as string) as unknown as T
  if (valueType === 'number' || valueType === 'boolean') return value
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => redactForLog(item, depth + 1)) as unknown as T
  }
  if (valueType === 'object') {
    return redactObject(value as Record<string, unknown>, depth) as unknown as T
  }

  return value
}

function createLogEntry(
  level: LogEntry['level'],
  message: string,
  context?: Record<string, unknown>,
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  }
}

function writeConsole(entry: LogEntry): void {
  const prefix = `[${entry.timestamp}] ${entry.level.toUpperCase()}:`
  if (entry.level === 'error') {
    console.error(prefix, entry.message, entry.context)
    return
  }
  if (entry.level === 'warn') {
    console.warn(prefix, entry.message, entry.context)
    return
  }
  console.log(prefix, entry.message, entry.context)
}

function errorToLogPayload(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  return { thrown: err }
}

function readStoredLogs(storageKey: string): LogEntry[] {
  if (typeof globalThis === 'undefined') return []
  try {
    const raw = globalThis.localStorage.getItem(storageKey)
    if (!raw) return []
    return JSON.parse(raw) as LogEntry[]
  } catch {
    return []
  }
}

function writeStoredLogs(storageKey: string, logs: LogEntry[], maxLogs: number): void {
  if (typeof globalThis === 'undefined') return
  try {
    const bounded = logs.slice(-maxLogs)
    globalThis.localStorage.setItem(storageKey, JSON.stringify(bounded))
  } catch {
    // Persistência opcional; falhas de quota ou ambiente sem storage são ignoradas
  }
}

export class EdgeLogger {
  logJson(svc: string, payload: Record<string, unknown>): void {
    const entry = createLogEntry('info', `Service: ${svc}`, payload)
    console.log(JSON.stringify({ ts: entry.timestamp, svc, ...payload }))
  }
}

export class DesktopLogger {
  private logs: LogEntry[] = []
  private readonly maxLogs = 1000
  private readonly storageKey = 'pdv_local_logs'

  private persistLog(entry: LogEntry): void {
    const stored = readStoredLogs(this.storageKey)
    stored.push(entry)
    writeStoredLogs(this.storageKey, stored, this.maxLogs)
  }

  private pushToBuffer(entry: LogEntry): void {
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  private log(level: LogEntry['level'], message: string, context?: Record<string, unknown>): void {
    const entry = createLogEntry(level, message, context)
    this.pushToBuffer(entry)
    writeConsole(entry)
    this.persistLog(entry)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clearLogs(): void {
    this.logs = []
  }

  async getLogFileContent(): Promise<string> {
    const logs = readStoredLogs(this.storageKey)
    return logs.map((log) => JSON.stringify(log)).join('\n')
  }
}

export class ServerLogger {
  logCaughtServerError(context: string, err: unknown): void {
    const sanitizedPayload = redactForLog(errorToLogPayload(err))
    console.error(`[${context}]`, JSON.stringify(sanitizedPayload))
  }
}

export const edgeLogger = new EdgeLogger()
export const desktopLogger = new DesktopLogger()
export const serverLogger = new ServerLogger()

export function logJson(svc: string, payload: Record<string, unknown>): void {
  edgeLogger.logJson(svc, payload)
}

export function logCaughtServerError(context: string, err: unknown): void {
  serverLogger.logCaughtServerError(context, err)
}

export const logger = desktopLogger
