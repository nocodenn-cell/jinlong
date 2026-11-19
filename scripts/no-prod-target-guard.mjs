#!/usr/bin/env node
// Guard estático: nenhum teste/configuração de teste pode referenciar o projeto Supabase
// de PRODUÇÃO. Complementa o guard em runtime do E2E (ci-pdv-importados.yml) e as credenciais
// fixas do stack local nos testes de integração.
//
// Falha (exit 1) se um arquivo de teste ou de ambiente de teste citar o ref de produção ou
// qualquer host <ref de 20 letras>.supabase.co.
//
// SSoT dos refs de produção: docs/capacity/staging/prod-denylist.json (STG-01).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DENYLIST = JSON.parse(
  readFileSync(
    join(__dirname, '..', 'docs', 'capacity', 'staging', 'prod-denylist.json'),
    'utf8',
  ),
)
/** Refs de produção conhecidos. */
const PROD_REFS = new Set(
  (DENYLIST.project_refs || []).map((r) => String(r).toLowerCase()),
)
// Ref real de projeto Supabase = 20 letras minúsculas. Hosts fictícios (test, xyz, example) não contam.
const REAL_REF_HOST = /\b([a-z]{20})\.supabase\.co\b/g

const TEST_FILE =
  /(\.(test|spec)\.(ts|tsx|mjs|js)$)|(^pdv-importados\/(e2e|tests)\/)|(^pdv-importados\/\.env\.test$)|(^pdv-importados\/(vitest|playwright)\.config\.)|(^pdv-local\/(src|scripts)\/.*test)|(\.test\.sql$)/

function trackedFiles() {
  const out = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out.split('\n').filter((f) => f && TEST_FILE.test(f))
}

function violationsIn(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const found = []
  for (const ref of PROD_REFS) {
    if (text.includes(ref)) found.push(`referencia o ref de produção (${ref})`)
  }
  for (const match of text.matchAll(REAL_REF_HOST)) {
    const ref = match[1].toLowerCase()
    if (PROD_REFS.has(ref)) {
      found.push(`host Supabase de produção: ${match[0]}`)
    } else {
      found.push(`host Supabase real: ${match[0]}`)
    }
  }
  return found
}

const problems = trackedFiles().flatMap((file) => violationsIn(file).map((v) => `${file}: ${v}`))
if (problems.length > 0) {
  console.error('no-prod-target-guard: testes não podem apontar para produção:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('no-prod-target-guard: OK (nenhum teste referencia produção)')
