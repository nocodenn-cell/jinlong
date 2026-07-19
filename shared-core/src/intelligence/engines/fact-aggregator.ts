import type { BlockedFactRecord } from '../contracts/decision-snapshot'
import type { FactEnvelope } from '../contracts/fact'
import type { FactProviderDescriptor } from '../contracts/provider-support'
import { evaluateProviderForRecommendation } from '../contracts/provider-support'
import { summarizeFactConfidence } from '../contracts/recommendation-purity'
import type { DiGateId } from '../gates/data-readiness'
import { isWaveASupportedFactId } from '../facts/wave-plan'
import { cloneFactEnvelope } from '../immutability'

export type ProviderLoadBatch = {
  descriptor: FactProviderDescriptor
  facts: readonly FactEnvelope[]
  ignored: boolean
  ignoreReason?: string
}

export type AggregateFactsResult = {
  factsUsed: FactEnvelope[]
  factsPartialIdentified: FactEnvelope[]
  factsBlocked: BlockedFactRecord[]
  gatesEncountered: DiGateId[]
  providersLoaded: number
  providersIgnored: number
  confidenceSummary: ReturnType<typeof summarizeFactConfidence>
}

function dedupeKey(fact: FactEnvelope): string {
  return `${fact.factId}::${fact.storeId ?? ''}::${fact.inputFingerprint}`
}

function collectGates(descriptor: FactProviderDescriptor, acc: Set<DiGateId>): void {
  for (const g of descriptor.gateIds) acc.add(g)
}

function blockRecord(
  descriptor: FactProviderDescriptor,
  reason: BlockedFactRecord['reason'],
): BlockedFactRecord {
  return {
    factId: descriptor.factId,
    supportLevel: descriptor.supportLevel,
    reason,
    gateIds: descriptor.gateIds,
    explanationCode: descriptor.statusExplanationCode,
  }
}

function classifyBatch(
  batch: ProviderLoadBatch,
  waveAOnly: boolean,
): 'use' | 'partial' | 'block' | 'skip' {
  if (batch.ignored) return 'skip'
  const { descriptor } = batch
  if (descriptor.supportLevel === 'UNSUPPORTED' || descriptor.supportLevel === 'DEPRECATED') {
    return 'block'
  }
  if (descriptor.supportLevel === 'PARTIAL') return 'partial'
  if (waveAOnly && !isWaveASupportedFactId(descriptor.factId)) return 'block'
  const eligibility = evaluateProviderForRecommendation(descriptor)
  if (!eligibility.ok) return 'block'
  return 'use'
}

function pushFacts(
  target: FactEnvelope[],
  facts: readonly FactEnvelope[],
  seen: Set<string>,
  blocked: BlockedFactRecord[],
  descriptor: FactProviderDescriptor,
): void {
  for (const fact of facts) {
    const key = dedupeKey(fact)
    if (seen.has(key)) {
      blocked.push(blockRecord(descriptor, 'DUPLICATE'))
      continue
    }
    seen.add(key)
    target.push(cloneFactEnvelope(fact))
  }
}

/**
 * Agrega Facts SUPPORTED, identifica PARTIAL, bloqueia UNSUPPORTED.
 * Sem I/O — opera só sobre batches já carregados via FactProviderPort.
 */
export function aggregateFacts(
  batches: readonly ProviderLoadBatch[],
  options?: { waveAOnly?: boolean },
): AggregateFactsResult {
  const waveAOnly = options?.waveAOnly ?? true
  const factsUsed: FactEnvelope[] = []
  const factsPartialIdentified: FactEnvelope[] = []
  const factsBlocked: BlockedFactRecord[] = []
  const gates = new Set<DiGateId>()
  const seen = new Set<string>()
  let providersLoaded = 0
  let providersIgnored = 0

  for (const batch of batches) {
    collectGates(batch.descriptor, gates)
    if (batch.ignored) {
      providersIgnored += 1
      continue
    }
    providersLoaded += 1
    const kind = classifyBatch(batch, waveAOnly)
    if (kind === 'skip') continue
    if (kind === 'block') {
      const reason =
        batch.descriptor.supportLevel === 'UNSUPPORTED'
          ? 'UNSUPPORTED'
          : batch.descriptor.supportLevel === 'DEPRECATED'
            ? 'DEPRECATED'
            : waveAOnly && !isWaveASupportedFactId(batch.descriptor.factId)
              ? 'WAVE_A_EXCLUDED'
              : 'GATE_OPEN'
      factsBlocked.push(blockRecord(batch.descriptor, reason))
      continue
    }
    if (kind === 'partial') {
      pushFacts(factsPartialIdentified, batch.facts, seen, factsBlocked, batch.descriptor)
      continue
    }
    pushFacts(factsUsed, batch.facts, seen, factsBlocked, batch.descriptor)
  }

  return {
    factsUsed,
    factsPartialIdentified,
    factsBlocked,
    gatesEncountered: [...gates],
    providersLoaded,
    providersIgnored,
    confidenceSummary: summarizeFactConfidence(factsUsed),
  }
}
