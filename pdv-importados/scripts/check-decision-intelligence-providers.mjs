#!/usr/bin/env node
/**
 * Guarda — FactProviders não importam engines/UI/Read Model rules.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const DIR = join(ROOT, 'lib', 'decision-intelligence', 'providers')

const FORBIDDEN = [
  /runAnalysisEngine/,
  /deriveKpis/,
  /runAlertEngine/,
  /runActionPlanEngine/,
  /createRecommendationEngine/,
  /buildDecisionIntelligenceReadModel/,
  /app\/admin/,
  /runEngineLoop/,
]

function walk(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, files)
    else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test|integration\.test)\./.test(name)) {
      files.push(p)
    }
  }
  return files
}

function rel(abs) {
  return normalize(abs).replace(/\\/g, '/').slice(normalize(ROOT).replace(/\\/g, '/').length)
}

if (!existsSync(DIR)) {
  console.error('check-decision-intelligence-providers: FAIL — pasta ausente')
  process.exit(1)
}

const violations = []
const files = walk(DIR)
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const re of FORBIDDEN) {
    if (re.test(src)) violations.push(`${rel(file)}: proibido ${re}`)
  }
}

const factory = join(DIR, 'create-wave-a-providers.ts')
if (!existsSync(factory) || !readFileSync(factory, 'utf8').includes('createSaleFactProvider')) {
  violations.push('create-wave-a-providers.ts deve montar providers reais')
}

if (violations.length > 0) {
  console.error('check-decision-intelligence-providers: FAIL\n')
  for (const v of violations) console.error(`  - ${v}`)
  process.exit(1)
}

console.log(`check-decision-intelligence-providers: OK (${files.length} arquivo(s))`)
