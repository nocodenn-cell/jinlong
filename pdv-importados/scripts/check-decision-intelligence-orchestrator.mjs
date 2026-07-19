#!/usr/bin/env node
/**
 * Guarda — orquestrador só coordena; UI não dispara Engine Loop.
 *
 * Uso: node scripts/check-decision-intelligence-orchestrator.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const ORCH = join(ROOT, 'lib', 'decision-intelligence', 'orchestrator')
const UI = join(ROOT, 'app', 'admin', 'intelligence')

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p, files)
      continue
    }
    if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test|integration\.test)\.(ts|tsx)$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

function rel(abs) {
  return normalize(abs).replace(/\\/g, '/').slice(normalize(ROOT).replace(/\\/g, '/').length)
}

const ORCH_FORBIDDEN = [
  { re: /runAnalysisEngine/, msg: 'não chamar Analysis Engine direto' },
  { re: /deriveKpis/, msg: 'não derivar KPIs no orquestrador' },
  { re: /runAlertEngine/, msg: 'não chamar Alert Engine direto' },
  { re: /runActionPlanEngine/, msg: 'não chamar Action Plan Engine direto' },
  { re: /createRecommendationEngine/, msg: 'não montar Recommendation Engine' },
  { re: /from ['"].*models\/decision-record/, msg: 'não criar DecisionRecord no orquestrador' },
]

const UI_FORBIDDEN = [
  { re: /runDecisionIntelligenceOrchestrator/, msg: 'UI não executa orquestrador' },
  { re: /runStoreCycle/, msg: 'UI não executa ciclo DI' },
  { re: /runEngineLoop/, msg: 'UI não executa Engine Loop' },
  { re: /orchestrator\//, msg: 'UI não importa orquestrador' },
]

if (!existsSync(ORCH)) {
  console.error('check-decision-intelligence-orchestrator: FAIL — pasta orchestrator ausente')
  process.exit(1)
}

const violations = []

for (const file of walk(ORCH)) {
  const src = readFileSync(file, 'utf8')
  if (!src.includes('runEngineLoop') && file.endsWith('run-store-cycle.ts')) {
    violations.push(`${rel(file)}: deve coordenar via runEngineLoop`)
  }
  for (const rule of ORCH_FORBIDDEN) {
    if (rule.re.test(src)) violations.push(`${rel(file)}: ${rule.msg}`)
  }
}

if (existsSync(UI)) {
  for (const file of walk(UI)) {
    const src = readFileSync(file, 'utf8')
    for (const rule of UI_FORBIDDEN) {
      if (rule.re.test(src)) violations.push(`${rel(file)}: ${rule.msg}`)
    }
  }
}

const storeCycle = join(ORCH, 'run-store-cycle.ts')
if (existsSync(storeCycle)) {
  const src = readFileSync(storeCycle, 'utf8')
  if (!src.includes('computeSnapshotContentFingerprint')) {
    violations.push('run-store-cycle.ts: deve aplicar idempotência por content fingerprint')
  }
  if (!src.includes('persistDecisionSnapshot')) {
    violations.push('run-store-cycle.ts: deve persistir via persistDecisionSnapshot')
  }
}

if (violations.length > 0) {
  console.error('check-decision-intelligence-orchestrator: FAIL\n')
  for (const v of violations) console.error(`  - ${v}`)
  process.exit(1)
}

console.log(
  `check-decision-intelligence-orchestrator: OK (${walk(ORCH).length} arquivo(s))`,
)
