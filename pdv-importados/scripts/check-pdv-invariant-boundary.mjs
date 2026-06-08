#!/usr/bin/env node
/**
 * Garante boundary do motor de consistência PDV:
 * - validatePdvState só importado em runPdvEvaluation.ts
 * - fetchPdvStateSnapshot só importado em runPdvEvaluation.ts
 * - detectInvariants não importado em pdv-importados
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PDV_LIB = join(ROOT, 'lib', 'pdv')
const APP = join(ROOT, 'app')

const FORBIDDEN_IN_CALLERS = [
  'validatePdvState',
  'detectInvariants',
  'fetchPdvStateSnapshot',
]

const ALLOWED_FILE = join(PDV_LIB, 'runPdvEvaluation.ts')

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(p, files)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.(ts|tsx)$/.test(name)) {
      files.push(p)
    }
  }
  return files
}

const files = [...walk(PDV_LIB), ...walk(join(APP, 'demo-fluxo'))]
let failed = false

for (const file of files) {
  if (file === ALLOWED_FILE) continue
  if (file.endsWith('fetchPdvStateSnapshot.internal.ts')) continue

  const content = readFileSync(file, 'utf8')
  for (const sym of FORBIDDEN_IN_CALLERS) {
    if (content.includes(sym)) {
      console.error(`[boundary] ${relative(ROOT, file)} referencia ${sym}`)
      failed = true
    }
  }
}

if (failed) {
  process.exit(1)
}

console.log('check-pdv-invariant-boundary: OK')
