import { logger as unifiedLogger, type LogEntry } from '../../../shared/unified-logger';

// Manter a interface original para compatibilidade com o restante do desktop
class Logger {
  private static instance: Logger;
  private buffer: LogEntry[] = [];

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  info(message: string, context?: Record<string, unknown>): void {
    unifiedLogger.info(message, context);
    this.buffer.push({ level: 'info', message, timestamp: new Date().toISOString(), context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    unifiedLogger.warn(message, context);
    this.buffer.push({ level: 'warn', message, timestamp: new Date().toISOString(), context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    unifiedLogger.error(message, context);
    this.buffer.push({ level: 'error', message, timestamp: new Date().toISOString(), context });
  }

  getLogs(): LogEntry[] {
    return this.buffer;
  }

  clearLogs(): void {
    this.buffer = [];
  }

  // Persistência local (preservar funcionalidade original)
  saveToLocalStorage(): void {
    try {
      localStorage.setItem('pdv_logs', JSON.stringify(this.buffer));
    } catch (e) {
      unifiedLogger.warn('Failed to save logs to localStorage', { error: String(e) });
    }
  }

  loadFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem('pdv_logs');
      if (saved) {
        this.buffer = JSON.parse(saved);
      }
    } catch (e) {
      unifiedLogger.warn('Failed to load logs from localStorage', { error: String(e) });
    }
  }
}

export const logger = Logger.getInstance();
export { LogEntry };