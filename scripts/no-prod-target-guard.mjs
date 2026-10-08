#!/usr/bin/env node
// Guard estático: nenhum teste/configuração de teste pode referenciar o projeto Supabase
// de PRODUÇÃO. Complementa o guard em runtime do E2E (ci-pdv-importados.yml) e as credenciais
// fixas do stack local nos testes de integração.
//
// Falha (exit 1) se um arquivo de teste ou de ambiente de teste citar o ref de produção ou
// qualquer host <ref de 20 letras>.supabase.co.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PROD_REF = 'kbabmewnahysfvlybiak'
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
  if (text.includes(PROD_REF)) found.push(`referencia o ref de produção (${PROD_REF})`)
  for (const match of text.matchAll(REAL_REF_HOST)) {
    if (match[1] !== PROD_REF) found.push(`host Supabase real: ${match[0]}`)
  }
  return found
}

const problems = trackedFiles().flatMap((file) => violationsIn(file).map((v) => `${file}: ${v}`))
if (problems.length > 0) {
  console.error('no-prod-target-guard: testes não podem apontar para produção:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('no-prod-target-guard: OK (nenhum teste referencia produção)')
