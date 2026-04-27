/**
 * Logger simples para observabilidade no desktop.
 * Mantém buffer em memória e persiste snapshot em localStorage quando disponível.
 */

export interface LogEntry {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
  context?: Record<string, any>
}

class Logger {
  private logs: LogEntry[] = []
  private maxLogs = 1000
  private storageKey = 'pdv_local_logs'

  private async persistLog(entry: LogEntry) {
    try {
      if (typeof window === 'undefined') return
      const previous = window.localStorage.getItem(this.storageKey)
      const parsed = previous ? (JSON.parse(previous) as LogEntry[]) : []
      parsed.push(entry)
      const bounded = parsed.slice(-this.maxLogs)
      window.localStorage.setItem(this.storageKey, JSON.stringify(bounded))
    } catch (e) {
      console.warn('Failed to persist log', e)
    }
  }

  private log(level: LogEntry['level'], message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    }

    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // Console output
    const prefix = `[${entry.timestamp}] ${level.toUpperCase()}:`
    switch (level) {
      case 'error':
        console.error(prefix, message, context)
        break
      case 'warn':
        console.warn(prefix, message, context)
        break
      default:
        console.log(prefix, message, context)
    }

    // Persist to file asynchronously
    this.persistLog(entry)
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, any>) {
    this.log('error', message, context)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs = []
  }

  async getLogFileContent(): Promise<string> {
    try {
      if (typeof window === 'undefined') return ''
      const value = window.localStorage.getItem(this.storageKey)
      if (!value) return ''
      const logs = JSON.parse(value) as LogEntry[]
      return logs.map((log) => JSON.stringify(log)).join('\n')
    } catch (e) {
      console.warn('Failed to read log file', e)
      return ''
    }
  }
}

export const logger = new Logger()