#!/usr/bin/env node
/**
 * MIGRATION CHECKLIST GATE — enforcement de PROCESSO de migração (não só de código).
 *
 * Fecha o último gap da Fase 2: toda PR que altera a UID (pdv-importados/app/**
 * ou pdv-importados/components/**) precisa de um artefato de migração válido e
 * atualizado. A validação é 100% determinística (sem depender de review humano).
 *
 * REGRAS (qualquer falha ⇒ exit 1, bloqueia o CI):
 *   1. Se a PR toca pdv-importados/app/** ou pdv-importados/components/**:
 *        a) `migration-checklist.json` DEVE existir;
 *        b) DEVE ter schema válido (JSON + campos obrigatórios);
 *        c) todos os campos booleanos obrigatórios DEVEM ser `true`;
 *        d) o arquivo DEVE ter sido atualizado NESTA PR (presente no diff) —
 *           caso contrário o gate seria trivialmente satisfeito por um commit antigo.
 *   2. Se a PR não toca a UI, o gate passa (checklist não é exigido).
 *
 * SCHEMA mínimo obrigatório (migration-checklist.json):
 *   {
 *     "migration": "<string não-vazia>",
 *     "routeAdded": true,
 *     "themeScopeApplied": true,
 *     "tokensOnly": true,
 *     "noHardcodedColors": true,
 *     "visualValidated": true
 *   }
 *
 * Diff: usa `CHECKLIST_BASE` (sha base da PR, fornecido pelo CI) quando presente;
 * senão tenta `HEAD~1`. Se o diff não puder ser computado, o gate não bloqueia
 * (indeterminado) — no CI o base é sempre fornecido, tornando-o determinístico.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECKLIST = 'migration-checklist.json'
const UI_PREFIXES = ['pdv-importados/app/', 'pdv-importados/components/']
const REQUIRED_BOOLS = [
  'routeAdded',
  'themeScopeApplied',
  'tokensOnly',
  'noHardcodedColors',
  'visualValidated',
]

function git(args) {
  return execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

/** Lista de arquivos alterados na PR; `null` se o diff não puder ser computado. */
function changedFiles() {
  const base = (process.env.CHECKLIST_BASE || '').trim()
  const ranges = []
  if (base) ranges.push(`${base} HEAD`)
  ranges.push('HEAD~1 HEAD')
  for (const range of ranges) {
    try {
      const out = git(`diff --name-only ${range}`)
      return out ? out.split('\n').filter(Boolean) : []
    } catch {
      /* tenta o próximo range */
    }
  }
  return null
}

function touchesUI(files) {
  return files.some((f) => UI_PREFIXES.some((p) => f.startsWith(p)))
}

function validateChecklist(absPath) {
  const errors = []
  let raw
  try {
    raw = fs.readFileSync(absPath, 'utf8')
  } catch {
    return [`arquivo "${CHECKLIST}" não encontrado na raiz do repositório`]
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    return [`JSON inválido em "${CHECKLIST}": ${e.message}`]
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return [`"${CHECKLIST}" deve ser um objeto JSON`]
  }
  if (typeof data.migration !== 'string' || data.migration.trim().length === 0) {
    errors.push('campo "migration" ausente ou vazio (string não-vazia obrigatória)')
  }
  for (const key of REQUIRED_BOOLS) {
    if (!(key in data)) {
      errors.push(`campo obrigatório "${key}" ausente`)
    } else if (data[key] !== true) {
      errors.push(`campo "${key}" deve ser true (valor atual: ${JSON.stringify(data[key])})`)
    }
  }
  return errors
}

function fail(lines) {
  console.error('[migration-checklist-guard] FAIL — gate de migração não satisfeito:\n')
  for (const l of lines) console.error(`  - ${l}`)
  console.error('\n  Atualize/inclua "migration-checklist.json" (schema em pdv-importados/docs/THEME_SYSTEM.md §7).')
  process.exit(1)
}

// ── Execução ─────────────────────────────────────────────────────────────────
const files = changedFiles()

if (files === null) {
  console.log('[migration-checklist-guard] SKIP — diff indeterminado (sem base); gate ativo no CI com CHECKLIST_BASE.')
  process.exit(0)
}

if (!touchesUI(files)) {
  console.log('[migration-checklist-guard] OK — PR não altera pdv-importados/app|components; checklist não exigido.')
  process.exit(0)
}

const errors = validateChecklist(path.join(root, CHECKLIST))
if (errors.length > 0) fail(errors)

if (!files.includes(CHECKLIST)) {
  fail([
    `"${CHECKLIST}" não foi atualizado nesta PR, mas a UI foi alterada.`,
    'Toda PR de migração deve refletir o estado no checklist (evita gate satisfeito por commit antigo).',
  ])
}

console.log(`[migration-checklist-guard] OK — UI alterada e "${CHECKLIST}" presente, válido e atualizado nesta PR.`)
