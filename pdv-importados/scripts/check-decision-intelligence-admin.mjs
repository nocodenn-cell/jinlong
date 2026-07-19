#!/usr/bin/env node
/**
 * Guarda — `/admin/intelligence` só consome o Read Model via serviço.
 *
 * Proíbe UI de acessar Snapshot/Record repos, Engine Loop ou builders.
 * Uso: node scripts/check-decision-intelligence-admin.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const UI_DIR = join(ROOT, 'app', 'admin', 'intelligence')

const FORBIDDEN = [
  { re: /createSupabaseDecisionSnapshotRepository/, msg: 'não acessar Snapshot repository' },
  { re: /createSupabaseDecisionRecordRepository/, msg: 'não acessar DecisionRecord repository' },
  { re: /createInMemoryDecisionSnapshotRepository/, msg: 'não acessar Snapshot repository' },
  { re: /createInMemoryDecisionRecordRepository/, msg: 'não acessar DecisionRecord repository' },
  { re: /DecisionSnapshotRepositoryPort/, msg: 'não tipar porta de Snapshot na UI' },
  { re: /DecisionRecordRepositoryPort/, msg: 'não tipar porta de DecisionRecord na UI' },
  { re: /persistDecisionSnapshot/, msg: 'UI não persiste snapshots' },
  { re: /buildDecisionIntelligenceReadModel/, msg: 'UI não reconstrói Read Model' },
  { re: /runEngineLoop/, msg: 'UI não executa Engine Loop' },
  { re: /@shared-core\/src\/intelligence/, msg: 'UI não importa Core de intelligence' },
  { re: /models\/decision-record/, msg: 'UI não acessa DecisionRecord diretamente' },
  { re: /encodeDecisionSnapshotPayload|decodeDecisionSnapshotPayload/, msg: 'UI não usa codec de snapshot' },
  { re: /runDecisionIntelligenceOrchestrator|runStoreCycle/, msg: 'UI não executa orquestrador' },
  { re: /orchestrator\//, msg: 'UI não importa orquestrador' },
]

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p, files)
      continue
    }
    if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.(ts|tsx)$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

function rel(abs) {
  return normalize(abs).replace(/\\/g, '/').slice(normalize(ROOT).replace(/\\/g, '/').length)
}

if (!existsSync(UI_DIR)) {
  console.error('check-decision-intelligence-admin: FAIL — pasta app/admin/intelligence ausente')
  process.exit(1)
}

const page = join(UI_DIR, 'page.tsx')
if (!existsSync(page)) {
  console.error('check-decision-intelligence-admin: FAIL — page.tsx ausente')
  process.exit(1)
}

const pageSrc = readFileSync(page, 'utf8')
if (!pageSrc.includes('loadIntelligenceReadModel')) {
  console.error(
    'check-decision-intelligence-admin: FAIL — page.tsx deve chamar loadIntelligenceReadModel',
  )
  process.exit(1)
}

const violations = []
for (const file of walk(UI_DIR)) {
  // Server actions podem orquestrar persistência; a UI de apresentação não.
  if (file.endsWith(`${normalize('/actions.ts')}`) || file.endsWith('actions.ts')) {
    continue
  }
  const src = readFileSync(file, 'utf8')
  for (const rule of FORBIDDEN) {
    if (rule.re.test(src)) {
      violations.push(`${rel(file)}: ${rule.msg}`)
    }
  }
}

if (violations.length > 0) {
  console.error('check-decision-intelligence-admin: FAIL\n')
  for (const v of violations) console.error(`  - ${v}`)
  process.exit(1)
}

console.log(
  `check-decision-intelligence-admin: OK (${walk(UI_DIR).length} arquivo(s) UI)`,
)
