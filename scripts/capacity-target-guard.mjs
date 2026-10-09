/**
 * Re-export ESM do SSoT CommonJS (capacity-target-guard.cjs).
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const guard = require('./capacity-target-guard.cjs')

export const loadProdDenylist = guard.loadProdDenylist
export const parseTargetUrl = guard.parseTargetUrl
export const evaluateCapacityTarget = guard.evaluateCapacityTarget
export const assertCapacityTargetFromEnv = guard.assertCapacityTargetFromEnv
export const assertCapacityTarget = guard.assertCapacityTarget
