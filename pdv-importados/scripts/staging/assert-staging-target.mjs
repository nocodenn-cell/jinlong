#!/usr/bin/env node
/**
 * Valida que o shell aponta para staging allowlisted (nunca produção).
 * Não lê .env.local — use env vars CAPACITY_* exportadas explicitamente.
 *
 *   CAPACITY_ENV=staging \
 *   CAPACITY_ALLOWED_PROJECT_REF=<ref> \
 *   CAPACITY_SUPABASE_URL=https://<ref>.supabase.co \
 *   node scripts/staging/assert-staging-target.mjs
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const { assertCapacityTargetFromEnv } = require(
  join(__dirname, '../../../scripts/capacity-target-guard.cjs'),
)

try {
  assertCapacityTargetFromEnv(process.env)
  process.exit(0)
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(2)
}
