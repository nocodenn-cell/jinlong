/**
 * Wrapper TS do guard STG-01 (scripts/capacity-target-guard.cjs).
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

type CapacityTargetResult = {
  ok: boolean
  mode: string
  projectRef: string | null
  errors?: string[]
  warnings?: string[]
}

type GuardModule = {
  assertCapacityTargetFromEnv: (env?: NodeJS.ProcessEnv) => CapacityTargetResult
  evaluateCapacityTarget: (input: Record<string, unknown>) => CapacityTargetResult
}

function loadGuard(): GuardModule {
  return require('../scripts/capacity-target-guard.cjs') as GuardModule
}

export function assertCapacityTargetFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CapacityTargetResult {
  return loadGuard().assertCapacityTargetFromEnv(env)
}

export function evaluateCapacityTarget(
  input: Record<string, unknown>,
): CapacityTargetResult {
  return loadGuard().evaluateCapacityTarget(input)
}
