#!/usr/bin/env node
/**
 * DOMAIN BOUNDARY GUARD — Missão 5.1a (ADR-005)
 *
 * R1: proíbe modules/shared e segundo pacote shared-core
 * R2: pastas de domínio em shared-core não importam app/ UI (quando existirem)
 * R3: imports cruzados entre sales|inventory|cash|products só via barrel público
 * R4: shared-core não importa pdv-importados/app nem pdv-local
 *
 * Pastas de domínio ausentes → regras R2/R3 dormientes (OK).
 * Probe: DOMAIN_BOUNDARY_PROBE=1 ou --probe-forbidden força fail de R1.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOMAIN_DIRS = [
  'sales',
  'inventory',
  'cash',
  'products',
  'customers',
  'i18n',
  'locale',
  'formatting',
]
const SKIP = new Set(['node_modules', '.next', 'dist', 'coverage', '.git'])

const violations = []

function rel(p) {
  return path.relative(root, p).split(path.sep).join('/')
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) walkFiles(full, acc)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) acc.push(full)
  }
  return acc
}

function fail(rule, msg) {
  violations.push(`[${rule}] ${msg}`)
}

function checkForbiddenPaths(probe) {
  const forbidden = [
    path.join(root, 'modules', 'shared'),
    path.join(root, 'pdv-importados', 'modules', 'shared'),
    path.join(root, 'pdv-local', 'modules', 'shared'),
  ]
  if (probe) {
    fail('R1', 'probe: simulação de path proibido modules/shared')
  }
  for (const p of forbidden) {
    if (fs.existsSync(p)) {
      fail('R1', `path proibido presente: ${rel(p)}`)
    }
  }
  const altCore = path.join(root, 'shared-core-domain')
  if (fs.existsSync(altCore)) {
    fail('R1', `pacote/pasta de domínio paralelo: ${rel(altCore)}`)
  }
}

function checkWorkspaces() {
  const pkgPath = path.join(root, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const ws = pkg.workspaces ?? []
  const cores = ws.filter((w) => String(w).includes('shared-core'))
  if (cores.length !== 1 || cores[0] !== 'shared-core') {
    fail('R1', `workspaces shared-core inválidos: ${JSON.stringify(cores)}`)
  }
  for (const w of ws) {
    if (w === 'modules' || String(w).startsWith('modules/')) {
      fail('R1', `workspace modules/* proibido: ${w}`)
    }
  }
}

function importsAppOrDesktop(text) {
  return (
    /from\s+['"][^'"]*pdv-importados\//.test(text) ||
    /from\s+['"][^'"]*pdv-local\//.test(text) ||
    /from\s+['"][^'"]*\/app\//.test(text) ||
    /require\(\s*['"][^'"]*pdv-importados\//.test(text)
  )
}

function checkSharedCoreDoesNotImportApps() {
  const coreSrc = path.join(root, 'shared-core')
  for (const file of walkFiles(coreSrc)) {
    const text = fs.readFileSync(file, 'utf8')
    if (importsAppOrDesktop(text)) {
      fail('R4', `${rel(file)} importa app/pdv-local (núcleo não pode depender de apps)`)
    }
  }
}

function domainOf(filePath) {
  const marker = `${path.sep}shared-core${path.sep}src${path.sep}`
  const idx = filePath.indexOf(marker)
  if (idx < 0) return null
  const rest = filePath.slice(idx + marker.length)
  const top = rest.split(path.sep)[0]
  return DOMAIN_DIRS.includes(top) ? top : null
}

function crossDomainImport(text, selfDomain) {
  const re = /from\s+['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(text))) {
    const spec = m[1]
    for (const d of DOMAIN_DIRS) {
      if (d === selfDomain) continue
      const hit =
        spec.includes(`/src/${d}/`) ||
        spec.endsWith(`/${d}`) ||
        spec.includes(`shared-core/src/${d}/`) ||
        new RegExp(`(?:^|[./])${d}/(?!index\\.(?:ts|js))`).test(spec)
      if (hit && !spec.endsWith('/index') && !spec.endsWith(`/index.ts`)) {
        // allow only .../domain or .../domain/index (barrel público)
        const barrelOk =
          spec.endsWith(`/${d}`) ||
          spec.endsWith(`/${d}/index`) ||
          spec.endsWith(`/${d}/index.ts`) ||
          spec.endsWith(`/${d}/index.js`)
        if (!barrelOk) {
          return { from: d, spec }
        }
      }
    }
  }
  return null
}

function checkDomainFolders() {
  const src = path.join(root, 'shared-core', 'src')
  let any = false
  for (const d of DOMAIN_DIRS) {
    const dir = path.join(src, d)
    if (!fs.existsSync(dir)) continue
    any = true
    for (const file of walkFiles(dir)) {
      const text = fs.readFileSync(file, 'utf8')
      if (importsAppOrDesktop(text) || /from\s+['"][^'"]*\/components\//.test(text)) {
        fail('R2', `${rel(file)} (domínio ${d}) importa UI/app`)
      }
      const cross = crossDomainImport(text, d)
      if (cross) {
        fail(
          'R3',
          `${rel(file)} importa ${cross.from} via '${cross.spec}' (use barrel público /index)`,
        )
      }
    }
  }
  if (!any) {
    console.log('domain-boundary-guard: R2/R3 dormantes (pastas de domínio ainda ausentes)')
  }
}

function main() {
  const probe =
    process.env.DOMAIN_BOUNDARY_PROBE === '1' ||
    process.argv.includes('--probe-forbidden')

  checkForbiddenPaths(probe)
  checkWorkspaces()
  checkSharedCoreDoesNotImportApps()
  checkDomainFolders()

  if (violations.length > 0) {
    for (const v of violations) console.error(v)
    console.error(`domain-boundary-guard: FAIL (${violations.length})`)
    process.exit(1)
  }
  console.log('domain-boundary-guard: OK')
}

main()
