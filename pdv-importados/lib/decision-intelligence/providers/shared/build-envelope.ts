import { createHash } from 'node:crypto'
import type {
  FactEnvelope,
  FactId,
  FactOwnerDomain,
  FactProviderDescriptor,
} from '@shared-core/src/intelligence'

export function fingerprintParts(
  ...parts: readonly (string | number | boolean | null | undefined)[]
): string {
  const raw = parts.map((p) => (p == null ? '' : String(p))).join('|')
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

export function buildReadyEnvelope(args: {
  descriptor: FactProviderDescriptor
  storeId: string
  observedAt: string
  inputFingerprint: string
  payload: unknown
  owner: FactOwnerDomain
  factId: FactId
}): FactEnvelope {
  return {
    factId: args.factId,
    owner: args.owner,
    readiness: 'READY',
    storeId: args.storeId,
    observedAt: args.observedAt,
    inputFingerprint: args.inputFingerprint,
    confidence: 'HIGH',
    operationalConfidence: args.descriptor.operationalConfidence,
    payload: args.payload,
  }
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

export function isoOrNow(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value
  return new Date().toISOString()
}
