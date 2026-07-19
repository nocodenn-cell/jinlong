#!/usr/bin/env node
/**
 * Auditoria Go-Live Decision Intelligence (Onda 5).
 * Verifica presença de artefatos críticos — não substitui testes.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const MONO = join(ROOT, '..')

const required = [
  'lib/decision-intelligence/providers/create-wave-a-providers.ts',
  'lib/decision-intelligence/orchestrator/run-orchestrator.ts',
  'lib/decision-intelligence/read-model/build-read-model.ts',
  'lib/decision-intelligence/governed-feedback.ts',
  'app/admin/intelligence/page.tsx',
  'app/admin/intelligence/actions.ts',
  'app/api/cron/decision-intelligence/route.ts',
  'scripts/check-decision-intelligence-admin.mjs',
  'scripts/check-decision-intelligence-orchestrator.mjs',
  'scripts/check-decision-intelligence-providers.mjs',
]

const monoRequired = [
  'backend/supabase/migrations/272_decision_snapshots.sql',
  'backend/supabase/migrations/273_decision_records.sql',
  'backend/supabase/migrations/274_decision_governed_memory.sql',
  'docs/architecture/DECISION_INTELLIGENCE_FACT_PROVIDERS.md',
  'docs/architecture/DECISION_INTELLIGENCE_ORCHESTRATOR.md',
  'docs/architecture/DECISION_INTELLIGENCE_GOVERNED_FEEDBACK.md',
]

const blockers = []

for (const rel of required) {
  if (!existsSync(join(ROOT, rel))) blockers.push(`missing ${rel}`)
}
for (const rel of monoRequired) {
  if (!existsSync(join(MONO, rel))) blockers.push(`missing ${rel}`)
}

const cronRoute = join(ROOT, 'app/api/cron/decision-intelligence/route.ts')
if (existsSync(cronRoute)) {
  const src = readFileSync(cronRoute, 'utf8')
  if (!src.includes('createWaveAProviders')) {
    blockers.push('cron ainda não usa createWaveAProviders')
  }
  if (src.includes('createEmptyWaveAProviders')) {
    blockers.push('cron ainda usa createEmptyWaveAProviders em produção')
  }
}

const vercel = join(ROOT, 'vercel.json')
if (existsSync(vercel)) {
  const v = readFileSync(vercel, 'utf8')
  if (!v.includes('/api/cron/decision-intelligence')) {
    blockers.push('vercel.json sem cron DI')
  }
}

if (blockers.length > 0) {
  console.error('check-decision-intelligence-golive: BLOCKERS\n')
  for (const b of blockers) console.error(`  - ${b}`)
  process.exit(1)
}

console.log('check-decision-intelligence-golive: OK — sem blockers estruturais')
