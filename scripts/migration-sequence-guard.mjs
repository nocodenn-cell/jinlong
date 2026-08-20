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
 *   2. Migrations com prefixo timestamp (>= 8 dígitos) são fora da sequência
 *      numérica curta — relatadas à parte, nunca colidem por design.
 *
 * `*_rollback_*` DENTRO de supabase/migrations/ NÃO é mais tolerado por design
 * (2026-07-03): o Supabase CLI extrai a versão do prefixo numérico do nome do
 * arquivo — um rollback com o MESMO prefixo da migration que reverte reivindica
 * a mesma versão e quebra `db reset`/replay com duplicate key em
 * schema_migrations_pkey (reproduzido no CI do PR #132 para 224/225/226). Um
 * arquivo de referência de rollback deve viver fora de supabase/migrations/
 * (ver backend/supabase/README_<N>_rollback_reference.sql.txt) — por isso este
 * guard agora trata qualquer `*_rollback_*.sql` remanescente na pasta como uma
 * colisão de verdade, não como par legítimo.
 *
 * Saída: além de PASS/FAIL, sempre imprime um RELATÓRIO de ordem e gaps da
 * sequência (informativo — gaps NÃO falham; só colisões falham).
 *
 *   3. FALHA se existir um SEGUNDO diretório de migrations fora do SSOT canônico.
 *      Motivo (2026-08-13): `pdv-importados/supabase/migrations/` existia como SSOT
 *      paralelo, aplicado por scripts `EXECUTAR_MIGRATIONS*.sh` via `psql $DATABASE_URL`.
 *      Um deles recriava `finalizar_venda_transacional_canonica_v3` (18 args) e dropava
 *      a v2, enquanto produção roda a v4 (22 args) com scope-guard — regressão silenciosa
 *      do núcleo transacional a um comando de distância. Arquivado em
 *      `docs/archive/legacy-pdv-importados-supabase/` (ver README de lá e ADR-011).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = path.join(root, 'backend/supabase/migrations')

// SSOT único de schema. Qualquer outro diretório de migrations no monorepo é proibido.
const CANONICAL_REL = 'backend/supabase/migrations'
// Caminhos onde SQL histórico pode residir sem ser um SSOT (inerte: nenhum tooling lê).
const ARCHIVE_PREFIXES = ['docs/archive/']
// Diretórios que nunca são varridos.
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'target', 'coverage'])

/** Procura diretórios chamados `migrations` fora do SSOT canônico. */
function findRogueMigrationDirs(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
    const abs = path.join(dir, entry.name)
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (rel === CANONICAL_REL) continue
    if (ARCHIVE_PREFIXES.some((p) => rel.startsWith(p))) continue
    if (entry.name === 'migrations') {
      // Só conta como SSOT rival se realmente contiver .sql.
      const hasSql = fs
        .readdirSync(abs, { withFileTypes: true })
        .some((f) => f.isFile() && f.name.endsWith('.sql'))
      if (hasSql) acc.push(rel)
      continue
    }
    findRogueMigrationDirs(abs, acc)
  }
  return acc
}

const rogueDirs = findRogueMigrationDirs(root)
if (rogueDirs.length > 0) {
  console.error('\n[migration-sequence-guard] FAIL — SSOT paralelo de migrations detectado:\n')
  for (const d of rogueDirs) console.error(`  • ${d}`)
  console.error(
    `\n  → O único SSOT de schema é ${CANONICAL_REL}/.` +
    '\n  → Migrations aplicáveis vivem lá; SQL histórico vai para docs/archive/.' +
    '\n  → Ver docs/adr/ADR-011-ssot-unico-migrations.md',
  )
  process.exit(1)
}

// Colisões herdadas — já aplicadas em produção, não renumeráveis. Dívida explícita.
// Qualquer colisão NOVA (fora desta lista) falha o guard.
//
// 225/235/245/250 estiveram aqui (adicionadas em 2026-07-03) até serem
// verificadas e renumeradas no mesmo dia: `npx supabase migration list`
// contra produção confirmou que NENHUM dos 8 arquivos colidentes tinha
// entrada em Remote — os quatro pares eram debt de merge (PRs paralelos
// mergeados em momentos distintos), não migrations já aplicadas. Renumerados
// para 251/252/253/254 (ver header de cada arquivo renomeado). Allowlist
// vazio agora — qualquer colisão nova volta a falhar o guard.
const INHERITED_COLLISIONS = new Set([])

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.error(`[migration-sequence-guard] FAIL — diretório não encontrado: ${MIGRATIONS_DIR}`)
  process.exit(1)
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

// number → lista de arquivos com aquele número (rollback conta como qualquer outro —
// ver nota acima: um rollback dentro da pasta reivindica versão real no CLI)
const byNumber = new Map()
const timestampMigrations = []

for (const f of files) {
  const m = f.match(/^(\d+)_/)
  if (!m) continue
  const num = m[1]
  if (num.length >= 8) {
    timestampMigrations.push(f)
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

const allowlistMsg = INHERITED_COLLISIONS.size
  ? ` (herdadas ${[...INHERITED_COLLISIONS].join('/')} em allowlist)`
  : ' (allowlist vazio)'
console.log(`\n[migration-sequence-guard] OK — nenhuma colisão${allowlistMsg}`)
