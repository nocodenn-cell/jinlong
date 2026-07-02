#!/usr/bin/env node
/**
 * DESKTOP FREEZE GUARD — enforcement do ADR-PDV-001 §1 (desktop congelado).
 *
 * O `pdv-local` está congelado por decisão de arquitetura (2026-07-02):
 * web é o PDV canónico; o desktop fica fora do caminho comercial e SEM
 * obrigação de paridade de contrato. Este guard torna a decisão executável:
 *
 * 1. Nenhum pacote ativo (pdv-importados, shared-core, shared, backend)
 *    pode IMPORTAR código de `pdv-local` — o congelado consome os ativos,
 *    nunca o contrário. Import reverso recriaria acoplamento com módulo
 *    sem manutenção.
 * 2. O marcador de congelamento deve existir em `pdv-local/README.md` —
 *    remover o aviso sem descongelar formalmente (fase R7 do roadmap)
 *    também falha o guard.
 *
 * Mudanças funcionais em pdv-local/src(-tauri) são bloqueadas no CI pelo
 * workflow `.github/workflows/desktop-freeze.yml` (label `unfreeze-pdv-local`
 * para exceções conscientes). Ver docs/adr/ADR-PDV-centro-de-gravidade.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const ACTIVE_PACKAGES = ['pdv-importados', 'shared-core', 'shared', 'backend']
const CODE_EXT = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'])
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'test-results', 'playwright-report'])

// Import/require real de pdv-local (não comentário/menção em texto).
const REVERSE_IMPORT = /(?:from\s+|require\(\s*|import\(\s*)['"][^'"]*pdv-local\//

const failures = []

function walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name))
      continue
    }
    if (!CODE_EXT.has(path.extname(e.name))) continue
    const file = path.join(dir, e.name)
    const src = fs.readFileSync(file, 'utf8')
    if (REVERSE_IMPORT.test(src)) {
      failures.push(`import reverso de pdv-local em: ${path.relative(root, file)}`)
    }
  }
}

for (const pkg of ACTIVE_PACKAGES) {
  walk(path.join(root, pkg))
}

const readmePath = path.join(root, 'pdv-local', 'README.md')
const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : ''
if (!/Status:\s*CONGELADO/i.test(readme)) {
  failures.push(
    'pdv-local/README.md sem o marcador "Status: CONGELADO" — descongelar exige a fase R7 do roadmap (ver docs/ROADMAP.md), não a remoção do aviso.',
  )
}

if (failures.length > 0) {
  console.error('[desktop-freeze-guard] FAIL — ADR-PDV-001 §1 (desktop congelado):\n')
  for (const f of failures) console.error(`  - ${f}`)
  console.error('\n  → Pacotes ativos não importam de pdv-local; o freeze só sai via fase R7.')
  process.exit(1)
}

console.log('[desktop-freeze-guard] OK — sem import reverso de pdv-local; marcador de freeze presente.')
