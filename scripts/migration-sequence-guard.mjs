#!/usr/bin/env node
/**
 * MIGRATION SEQUENCE GUARD — sequência de migrations sem colisão de número.
 *
 * Por que: múltiplos PRs paralelos criaram migrations com o mesmo número
 * (já ocorreu em 225 e 235 no histórico). Colisão = ordem de aplicação ambígua
 * entre ambientes → risco de corrupção silenciosa de schema.
 *
 * Regras:
 *   1. FALHA se dois arquivos NÃO-rollback compartilham o mesmo número de prefixo,
 *      exceto colisões herdadas e já aplicadas em produção (INHERITED_COLLISIONS).
 *   2. Arquivos `*_rollback_*` são pares legítimos do mesmo número — ignorados.
 *   3. Migrations com prefixo timestamp (>= 8 dígitos) são fora da sequência
 *      numérica curta — relatadas à parte, nunca colidem por design.
 *
 * Saída: além de PASS/FAIL, sempre imprime um RELATÓRIO de ordem e gaps da
 * sequência (informativo — gaps NÃO falham; só colisões falham).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = path.join(root, 'backend/supabase/migrations')

// Colisões herdadas — já aplicadas em produção, não renumeráveis. Dívida explícita.
// Qualquer colisão NOVA (fora desta lista) falha o guard.
const INHERITED_COLLISIONS = new Set(['225', '235', '245'])

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.error(`[migration-sequence-guard] FAIL — diretório não encontrado: ${MIGRATIONS_DIR}`)
  process.exit(1)
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

// number → lista de arquivos não-rollback com aquele número
const byNumber = new Map()
const timestampMigrations = []
const rollbacks = []

for (const f of files) {
  const isRollback = /_rollback_/.test(f)
  const m = f.match(/^(\d+)_/)
  if (!m) continue
  const num = m[1]
  if (num.length >= 8) {
    timestampMigrations.push(f)
    continue
  }
  if (isRollback) {
    rollbacks.push(f)
    continue
  }
  if (!byNumber.has(num)) byNumber.set(num, [])
  byNumber.get(num).push(f)
}

// ─── Detecção de colisões ─────────────────────────────────────────────────────
const collisions = []
for (const [num, group] of byNumber) {
  if (group.length > 1) {
    collisions.push({ num, group, inherited: INHERITED_COLLISIONS.has(num) })
  }
}

// ─── Relatório de ordem e gaps (informativo) ──────────────────────────────────
const nums = [...byNumber.keys()].map(Number).sort((a, b) => a - b)
const gaps = []
if (nums.length > 1) {
  for (let i = 1; i < nums.length; i++) {
    const prev = nums[i - 1]
    const cur = nums[i]
    if (cur - prev > 1) gaps.push(`${prev + 1}–${cur - 1}`)
  }
}

console.log('[migration-sequence-guard] RELATÓRIO de sequência:')
console.log(`  • migrations numeradas: ${nums.length}  (de ${String(nums[0]).padStart(3, '0')} a ${nums[nums.length - 1]})`)
console.log(`  • migrations timestamp: ${timestampMigrations.length}`)
console.log(`  • rollbacks (pares):    ${rollbacks.length}`)
console.log(`  • gaps de numeração:    ${gaps.length ? gaps.join(', ') : 'nenhum'}  (informativo, não bloqueia)`)
console.log(`  • próximo número livre: ${nums[nums.length - 1] + 1}`)

// ─── Veredicto ────────────────────────────────────────────────────────────────
const newCollisions = collisions.filter((c) => !c.inherited)
const inherited = collisions.filter((c) => c.inherited)

if (inherited.length > 0) {
  console.log('\n  Colisões herdadas (allowlist — dívida conhecida, já em produção):')
  for (const c of inherited) {
    console.log(`    - ${c.num}: ${c.group.join(' , ')}`)
  }
}

if (newCollisions.length > 0) {
  console.error('\n[migration-sequence-guard] FAIL — colisão de número NOVA detectada:\n')
  for (const c of newCollisions) {
    console.error(`  - número ${c.num} usado por ${c.group.length} migrations:`)
    for (const f of c.group) console.error(`      • ${f}`)
  }
  console.error(
    `\n  → Renumere a migration mais nova para o próximo número livre (${nums[nums.length - 1] + 1}+).` +
    '\n  → Números são sequenciais e únicos. Ver scripts/migration-sequence-guard.mjs',
  )
  process.exit(1)
}

console.log('\n[migration-sequence-guard] OK — nenhuma colisão nova (herdadas 225/235 em allowlist)')
