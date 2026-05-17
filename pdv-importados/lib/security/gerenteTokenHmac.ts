import { createHmac, timingSafeEqual } from 'crypto'

const VERSION = 'v1'
const ALGO = 'sha256'

export interface GerenteTokenPayload {
  /** Token original emitido pela edge function (repassado ao RPC). */
  edgeToken: string
  gerenteId: string
  deviceFingerprint: string
  expiraEm: string
  maxDesconto: number
}

function computeSignature(b64: string, secret: string): string {
  return createHmac(ALGO, secret).update(`${VERSION}.${b64}`).digest('hex') // NOSONAR S4790 — SHA-256 HMAC for token integrity, not password storage
}

export function gerarTokenHmacGerente(payload: GerenteTokenPayload, secret: string): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = computeSignature(b64, secret)
  return `${VERSION}.${b64}.${sig}`
}

export type TokenVerifyResult =
  | { ok: true; payload: GerenteTokenPayload }
  | { ok: false; reason: 'formato' | 'assinatura' | 'expirado' }

export function verificarTokenHmacGerente(token: string, secret: string): TokenVerifyResult {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'formato' }
  const [, b64, sig] = parts
  const expected = computeSignature(b64, secret)
  const sigBuf = Buffer.from(sig, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'assinatura' }
  }
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8')) as GerenteTokenPayload
    if (new Date(payload.expiraEm) < new Date()) return { ok: false, reason: 'expirado' }
    return { ok: true, payload }
  } catch (_e: unknown) {
    return { ok: false, reason: 'formato' }
  }
}
