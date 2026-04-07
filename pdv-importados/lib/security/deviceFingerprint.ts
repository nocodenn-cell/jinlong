const STORAGE_KEY = 'fastproduct_device_fingerprint'
const UNKNOWN_DEVICE = 'web-unknown-device'

function safeReadStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWriteStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Sem storage disponível (modo privado/restrições). Usa fallback em memória.
  }
}

function normalizeFingerprint(value: string): string {
  const normalized = value.trim().toLowerCase()
  return normalized ? normalized.slice(0, 200) : UNKNOWN_DEVICE
}

export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return UNKNOWN_DEVICE

  const existing = safeReadStorage(STORAGE_KEY)
  if (existing) return normalizeFingerprint(existing)

  const generated = `web-${crypto.randomUUID()}`
  safeWriteStorage(STORAGE_KEY, generated)
  return normalizeFingerprint(generated)
}
