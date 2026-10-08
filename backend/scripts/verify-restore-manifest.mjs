#!/usr/bin/env node
// Compara o manifesto do backup (backup-manifest.mjs) com as contagens impressas
// por restore-drill.sh ("tabela=n,...|auth_users=n"). Sai com 1 se divergir.
//
// Uso: node verify-restore-manifest.mjs <manifest.json> <restored-counts.txt>
import { readFileSync } from 'node:fs'

const KEYS = ['vendas', 'caixas', 'produtos', 'usuarios', 'auth_users']

function parseCounts(text) {
  const line = text.trim().split('\n').filter((l) => l.includes('|auth_users=')).pop()
  if (!line) throw new Error('linha de contagens (…|auth_users=N) não encontrada')
  const [tables, auth] = line.split('|')
  const counts = Object.fromEntries(tables.split(',').map((p) => p.split('=')))
  counts.auth_users = auth.split('=')[1]
  return counts
}

const [manifestPath, countsPath] = process.argv.slice(2)
if (!manifestPath || !countsPath) {
  console.error('Uso: verify-restore-manifest.mjs <manifest.json> <restored-counts.txt>')
  process.exit(2)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const restored = parseCounts(readFileSync(countsPath, 'utf8'))
let ok = true
for (const key of KEYS) {
  const match = String(manifest[key]) === String(restored[key])
  ok &&= match
  console.log(`  ${key}: backup=${manifest[key]} restaurado=${restored[key]} [${match ? 'OK' : 'DIVERGE'}]`)
}
process.exit(ok ? 0 : 1)
