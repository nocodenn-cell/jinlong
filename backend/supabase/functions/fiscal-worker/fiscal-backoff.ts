// Backoff exponencial para retry de documentos fiscais

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 6,
  baseDelayMs: 60 * 1000, // 1 minuto
  maxDelayMs: 30 * 60 * 1000, // 30 minutos
  multiplier: 2.0,
};

// Calcula delay exponencial com jitter
export function calculateBackoffDelay(
  retryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  if (retryCount <= 0) return 0;
  if (retryCount > config.maxRetries) return config.maxDelayMs;
  
  // Exponential backoff: baseDelay * multiplier^(retryCount - 1)
  const exponentialDelay = config.baseDelayMs * Math.pow(config.multiplier, retryCount - 1);
  
  // Add jitter (±25%) to avoid thundering herd
  const jitter = 0.5 + Math.random(); // 0.5 to 1.5
  const delayWithJitter = exponentialDelay * jitter;
  
  // Cap at max delay
  return Math.min(delayWithJitter, config.maxDelayMs);
}

// Calcula próxima tentativa timestamp
export function calculateNextRetryAt(
  currentRetryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Date {
  const delayMs = calculateBackoffDelay(currentRetryCount + 1, config);
  return new Date(Date.now() + delayMs);
}

// Verifica se deve tentar novamente baseado no resultado
export function shouldRetry(
  result: { ok: boolean; transitorio?: boolean; retryable?: boolean },
  currentRetryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): boolean {
  // Se sucesso, não retry
  if (result.ok) return false;
  
  // Se atingiu máximo de tentativas, não retry
  if (currentRetryCount >= config.maxRetries) return false;
  
  // Se erro não é transitorio/retryable, não retry
  if (result.transitorio === false || result.retryable === false) return false;
  
  // Por padrão, retry se erro é transitorio ou não especificado
  // undefined significa "não especificado", então permitimos retry
  const isTransitorio = Boolean(result.transitorio) !== false;
  const isRetryable = Boolean(result.retryable) !== false;
  return isTransitorio && isRetryable;
}

// Gera mensagem de log para retry
export function formatRetryMessage(
  docId: string,
  retryCount: number,
  nextRetryAt: Date,
  error: string,
): string {
  const delayMinutes = Math.round((nextRetryAt.getTime() - Date.now()) / (60 * 1000));
  return `Retry ${retryCount}/${DEFAULT_RETRY_CONFIG.maxRetries} for doc ${docId}: ${error}. Next retry in ${delayMinutes}min`;
}
