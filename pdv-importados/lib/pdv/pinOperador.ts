import { pbkdf2Sync, randomBytes } from 'node:crypto'

/**
 * PIN do operador do PDV (P0 do login rápido). 4 dígitos (decisão do Damatta) + bloqueio por tentativas.
 * Só o servidor deriva o hash: PBKDF2-SHA256(pin, salt 16 bytes, ITERACOES, 32 bytes). O PDV desktop refaz a
 * mesma conta offline (pdv-local/src-tauri/src/operador.rs) e a Edge sync-outbox online (operadorPin.ts).
 */
export const PIN_ITERACOES = 150_000

export { validarPinNovo, statusPin, type ErroPin, type StatusPin } from './pinRegras'

export function derivarPinHash(pin: string, saltHex = randomBytes(16).toString('hex'), iteracoes = PIN_ITERACOES) {
  const hash = pbkdf2Sync(pin, Buffer.from(saltHex, 'hex'), iteracoes, 32, 'sha256').toString('hex')
  return { hash, salt: saltHex, iteracoes }
}

