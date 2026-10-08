#!/usr/bin/env node
/**
 * Gate estático: o workflow de backup Opção B deve sondar conexão DIRETA
 * Temporary Access antes do pooler (lacuna que deixava só o caminho PAM/Supavisor).
 * Sem rede, sem secrets, sem Postgres — só contrato do YAML.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workflowPath = resolve(root, '.github/workflows/backup-scheduled.yml')
const src = readFileSync(workflowPath, 'utf8')

const required = [
  {
    label: 'sonda host direto db.<ref>.supabase.co',
    re: /direct_host="db\.\$\{SUPABASE_PROJECT_REF\}\.supabase\.co"/,
  },
  {
    label: 'URI direta user=postgres (sem .ref) + sslmode=require',
    re: /postgres:\/\/postgres:\$\{JIT_PAT_ENC\}@\$\{direct_host\}:5432\/postgres\?sslmode=require/,
  },
  {
    label: 'modo direct registrado no output',
    re: /mode="direct"/,
  },
  {
    label: 'fallback pooler com jit=true',
    re: /options=-c%20jit%3dtrue/,
  },
  {
    label: 'step id discover-db',
    re: /id:\s*discover-db/,
  },
  {
    label: 'dump ramifica por CONN_MODE',
    re: /CONN_MODE:\s*\$\{\{\s*steps\.discover-db\.outputs\.conn_mode\s*\}\}/,
  },
  {
    label: 'mensagem de erro aponta Temporary Access (nao senha permanente)',
    re: /Temporary Access\/JIT recusado/,
  },
]

const failures = required.filter((item) => !item.re.test(src))
if (failures.length > 0) {
  console.error('assert-backup-jit-direct-probe: FAIL')
  for (const f of failures) {
    console.error(`  - ausente: ${f.label}`)
  }
  process.exit(1)
}

console.log('assert-backup-jit-direct-probe: PASS')
console.log(`  workflow=${workflowPath}`)
console.log(`  checks=${required.length}`)
