import { pbkdf2Sync, randomBytes } from 'node:crypto'

/**
 * PIN do operador do PDV (P0 do login rápido). 4 dígitos (decisão do Damatta) + bloqueio por tentativas.
 * Só o servidor deriva o hash: PBKDF2-SHA256(pin, salt 16 bytes, ITERACOES, 32 bytes). O PDV desktop refaz a
 * mesma conta offline (pdv-local/src-tauri/src/operador.rs) e a Edge sync-outbox online (operadorPin.ts).
 */
export const PIN_ITERACOES = 150_000

const OBVIOS = new Set([
  '0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210',
  '1212', '1122', '2580', '0852', '1004', '2000', '2001', '1010', '6969',
])

export type ErroPin = 'formato' | 'obvio' | 'confirmacao'

/** Mesma regra de `public.pdv_pin_obvio` no banco. */
export function validarPinNovo(pin: string, confirmacao: string): ErroPin | null {
  if (!/^[0-9]{4}$/.test(pin)) return 'formato'
  if (/^(.)\1{3}$/.test(pin) || OBVIOS.has(pin)) return 'obvio'
  if (pin !== confirmacao) return 'confirmacao'
  return null
}

export function derivarPinHash(pin: string, saltHex = randomBytes(16).toString('hex'), iteracoes = PIN_ITERACOES) {
  const hash = pbkdf2Sync(pin, Buffer.from(saltHex, 'hex'), iteracoes, 32, 'sha256').toString('hex')
  return { hash, salt: saltHex, iteracoes }
}
