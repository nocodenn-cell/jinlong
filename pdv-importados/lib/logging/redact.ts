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
 * Retorna uma cópia segura para log (console/JSON), mascarando chaves sensíveis.
 * Não garante anonimização semântica de strings livres (ex.: CPF dentro de `mensagem`).
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
