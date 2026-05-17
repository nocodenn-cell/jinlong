const VERSION = 'v1'
const ENC = new TextEncoder()
const DEC = new TextDecoder()

export interface GerenteTokenPayload {
  edgeToken: string
  gerenteId: string
  deviceFingerprint: string
  expiraEm: string
  maxDesconto: number
}

export type TokenVerifyResult =
  | { ok: true; payload: GerenteTokenPayload }
  | { ok: false; reason: 'formato' | 'assinatura' | 'expirado' }

async function hmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw', ENC.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage,
  )
}

function toBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64url(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}

export async function gerarTokenHmacGerente(payload: GerenteTokenPayload, secret: string): Promise<string> {
  const b64 = toBase64url(ENC.encode(JSON.stringify(payload)))
  const key = await hmacKey(secret, ['sign'])
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, ENC.encode(`${VERSION}.${b64}`))
  return `${VERSION}.${b64}.${toBase64url(new Uint8Array(sig))}`
}

export async function verificarTokenHmacGerente(token: string, secret: string): Promise<TokenVerifyResult> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'formato' }
  const [, b64, sigB64] = parts
  try {
    const key = await hmacKey(secret, ['verify'])
    const sigBytes = fromBase64url(sigB64)
    const valid = await globalThis.crypto.subtle.verify('HMAC', key, sigBytes, ENC.encode(`${VERSION}.${b64}`))
    if (!valid) return { ok: false, reason: 'assinatura' }
    const payload = JSON.parse(DEC.decode(fromBase64url(b64))) as GerenteTokenPayload
    if (new Date(payload.expiraEm) < new Date()) return { ok: false, reason: 'expirado' }
    return { ok: true, payload }
  } catch (_e: unknown) {
    return { ok: false, reason: 'formato' }
  }
}
