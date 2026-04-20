/**
 * Logger simples para observabilidade no desktop (Tauri).
 * Registra erros e eventos importantes no console e em arquivo.
 */

import { writeTextFile, readTextFile, exists } from '@tauri-apps/api/fs'
import { appDataDir } from '@tauri-apps/api/path'

export interface LogEntry {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
  context?: Record<string, any>
}

class Logger {
  private logs: LogEntry[] = []
  private maxLogs = 1000
  private logFile = 'app.log'
  private initialized = false

  private async ensureLogFile() {
    if (this.initialized) return
    try {
      const appData = await appDataDir()
      this.logFile = `${appData}fastproduct\\logs\\app.log`
      // Ensure directory exists, but for simplicity, assume it does or create manually
      this.initialized = true
    } catch (e) {
      console.warn('Failed to initialize log file path', e)
    }
  }

  private async persistLog(entry: LogEntry) {
    try {
      await this.ensureLogFile()
      const logLine = JSON.stringify(entry) + '\n'
      await writeTextFile(this.logFile, logLine, { append: true })
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
      await this.ensureLogFile()
      if (await exists(this.logFile)) {
        return await readTextFile(this.logFile)
      }
      return ''
    } catch (e) {
      console.warn('Failed to read log file', e)
      return ''
    }
  }
}

export const logger = new Logger()