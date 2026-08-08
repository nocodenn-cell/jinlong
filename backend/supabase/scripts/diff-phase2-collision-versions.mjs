#!/usr/bin/env node
/**
 * Fase 3 — diff mecânico de versões listadas em phase2-collisions.json.
 * Read-only: não altera migrations nem produção.
 *
 * Uso: node backend/supabase/scripts/diff-phase2-collision-versions.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const MIG = join(ROOT, 'migrations')
const COLLISIONS = join(ROOT, 'reports', 'phase2-collisions.json')
const OUT = join(ROOT, 'reports', 'phase3-collision-diff-summary.json')

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function fileForVersion(version) {
  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql'))
  const exact = files.find((f) => f.startsWith(`${version}_`))
  return exact ? join(MIG, exact) : null
}

const raw = JSON.parse(readFileSync(COLLISIONS, 'utf8'))
const pairs = raw.collisions ?? []

const summaries = []
for (const entry of pairs) {
  const repoVer = String(entry.versaoRepo ?? entry.repoVersion ?? entry.versao ?? '')
  const path = repoVer ? fileForVersion(repoVer) : null
  let repoSha = null
  let repoFile = null
  if (path) {
    repoFile = path.split('/migrations/')[1]
    repoSha = sha256(readFileSync(path, 'utf8'))
  }
  summaries.push({
    versaoRepo: repoVer,
    arquivoRepo: repoFile,
    versaoProd: entry.versaoProd ?? entry.prodVersion ?? null,
    trackingProd: entry.tracking ?? entry.trackingProd ?? null,
    recomendacao: entry.recomendacao ?? null,
    repoSha256: repoSha,
    sqlEquivalente: entry.sqlEquivalente ?? null,
  })
}

writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), count: summaries.length, summaries }, null, 2),
)
console.log(`Wrote ${OUT} (${summaries.length} entries)`)
