#!/usr/bin/env node
/**
 * Gate de navegação — fonte única ROUTES em pdv-importados/lib/navigation/routes.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pdv = path.join(root, 'pdv-importados')

const ROUTES_SOURCE = path.normalize(path.join(pdv, 'lib', 'navigation', 'routes.ts'))

const BANNED_IMPORTS = [
  '@/lib/navigation/appRoutes',
  '@/lib/navigation/appFlow',
  '@/lib/navigation/painelGerencialNav',
  './appRoutes',
  './appFlow',
  './painelGerencialNav',
]

const BANNED_SYMBOLS = ['APP_ROUTES', 'painelGerencialHref', 'OPERATIONAL_FLOW_STEPS']

const ALLOWED_ROUTE_STRING_FILES = new Set([
  ROUTES_SOURCE,
  path.normalize(path.join(pdv, 'middleware.ts')),
])

const SCAN_DIRS = [
  path.join(pdv, 'app', 'admin'),
  path.join(pdv, 'components', 'ui', 'admin-v2'),
  path.join(pdv, 'lib', 'navigation'),
]

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'reports'])

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      out.push(...walk(path.join(dir, ent.name)))
      continue
    }
    const p = path.join(dir, ent.name)
    if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

const violations = []

for (const file of walk(pdv)) {
  const norm = path.normalize(file)
  if (norm.includes(`${path.sep}e2e${path.sep}`) || norm.includes(`${path.sep}tests${path.sep}`)) continue
  const text = fs.readFileSync(file, 'utf8')

  for (const banned of BANNED_IMPORTS) {
    if (text.includes(banned)) {
      violations.push(`${path.relative(root, file)}: import proibido ${banned}`)
    }
  }
  for (const sym of BANNED_SYMBOLS) {
    if (text.includes(sym)) {
      violations.push(`${path.relative(root, file)}: símbolo proibido ${sym}`)
    }
  }
}

for (const file of SCAN_DIRS.flatMap(walk)) {
  const norm = path.normalize(file)
  if (ALLOWED_ROUTE_STRING_FILES.has(norm)) continue
  const text = fs.readFileSync(file, 'utf8')
  const hardcoded = text.match(/['"`]\/(admin|caixa|gerente)\/[^'"`]*['"`]/g)
  if (hardcoded?.length) {
    violations.push(
      `${path.relative(root, file)}: string de rota hardcoded (${hardcoded.slice(0, 3).join(', ')}…)`,
    )
  }
}

for (const legacy of ['appRoutes.ts', 'appFlow.ts', 'painelGerencialNav.ts']) {
  if (fs.existsSync(path.join(pdv, 'lib', 'navigation', legacy))) {
    violations.push(`lib/navigation/${legacy}: arquivo legado deve ser removido`)
  }
}

if (!fs.existsSync(ROUTES_SOURCE)) {
  violations.push('pdv-importados/lib/navigation/routes.ts: arquivo canônico ausente')
}

if (violations.length > 0) {
  console.error('[check:routes] FAIL — navegação não consolidada:\n')
  for (const v of violations) console.error(`  - ${v}`)
  process.exit(1)
}

console.log('[check:routes] OK — ROUTES é a única fonte de rotas (admin/navigation)')
