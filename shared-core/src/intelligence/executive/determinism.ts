import type { ExecutiveSnapshot } from '../contracts/executive-snapshot'

export function assertExecutiveDeterminism(snapshot: ExecutiveSnapshot): void {
  if (!snapshot.ruleId || !snapshot.ruleVersion) {
    throw new Error(`INTEL_EXEC_NO_RULE:${snapshot.storeId}`)
  }
  if (
    typeof snapshot.operationalConfidence !== 'number' ||
    snapshot.operationalConfidence < 0 ||
    snapshot.operationalConfidence > 1
  ) {
    throw new Error(`INTEL_EXEC_BAD_CONFIDENCE:${snapshot.storeId}`)
  }
}
