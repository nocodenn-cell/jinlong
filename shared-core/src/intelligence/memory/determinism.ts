import type { MemorySnapshot } from '../contracts/memory-snapshot'

export function assertMemoryDeterminism(snapshot: MemorySnapshot): void {
  if (!snapshot.ruleId || !snapshot.ruleVersion) {
    throw new Error(`INTEL_MEMORY_NO_RULE:${snapshot.storeId}`)
  }
  if (!snapshot.pipelineFingerprint) {
    throw new Error(`INTEL_MEMORY_NO_FINGERPRINT:${snapshot.storeId}`)
  }
  if (
    typeof snapshot.operationalConfidence !== 'number' ||
    snapshot.operationalConfidence < 0 ||
    snapshot.operationalConfidence > 1
  ) {
    throw new Error(`INTEL_MEMORY_BAD_CONFIDENCE:${snapshot.storeId}`)
  }
  for (const entry of snapshot.entries) {
    if (entry.operationalConfidence > snapshot.operationalConfidence) {
      throw new Error(`INTEL_MEMORY_CONFIDENCE_INFLATED:${entry.id}`)
    }
  }
}
