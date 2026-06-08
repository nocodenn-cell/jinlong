import { createHash } from 'node:crypto'

/** PRNG determinístico (Mulberry32) — mesmo seed → mesma sequência. */
export function createDeterministicRng(seed: number) {
  let state = seed >>> 0
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    nextInt(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min
    },
  }
}

/** UUID v4-like determinístico a partir de seed + rótulo estável. */
export function deterministicUuid(seed: number, label: string): string {
  const hash = createHash('sha256').update(`pdv-gate:${seed}:${label}`).digest('hex')
  const variant = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variant}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join('-')
}

export function parseGateSeed(): number {
  const raw = process.env.GATE_SEED?.trim() ?? '12345'
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return 12345
  return n
}
