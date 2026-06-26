import fs from 'node:fs'
import path from 'node:path'
import type { MigrationCheckResult, ModuleStatus } from './types.js'

const HEX_RE = /(?<![a-zA-Z0-9-])#[0-9a-fA-F]{3,8}\b/
const TAILWIND_COLOR_RE = /(?:text|bg|border)-(?:amber|red|green|emerald|slate|gray|yellow|rose)-\d+/
const THEME_SCOPE_RE = /data-admin-v2|data-app-theme|admin-v2-page|class="app-/

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '__tests__'])

function readFilesRecursive(dir: string, exts: string[]): string[] {
  const out: string[] = []
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) {
      out.push(...readFilesRecursive(p, exts))
    } else if (e.isFile() && exts.some(x => e.name.endsWith(x))) {
      out.push(p)
    }
  }
  return out
}

function readContent(p: string): string {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

function checkModule(pdvRoot: string, name: string, relPath: string): ModuleStatus {
  const modulePath = path.join(pdvRoot, relPath)
  const files = readFilesRecursive(modulePath, ['.tsx', '.ts', '.css'])
  const tsxFiles = files.filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))

  const routeAdded = files.some(f => path.basename(f) === 'page.tsx')

  const themeScopeApplied = tsxFiles.some(f => THEME_SCOPE_RE.test(readContent(f)))

  const noHardcodedColors = tsxFiles.every(f => !HEX_RE.test(readContent(f)))

  const tokensOnly = tsxFiles.every(f => !TAILWIND_COLOR_RE.test(readContent(f)))

  const visualValidated = tsxFiles.some(f => {
    const c = readContent(f)
    return c.includes('admin-v2-page') || c.includes('[data-admin-v2]')
  })

  const checks = [routeAdded, themeScopeApplied, tokensOnly, noHardcodedColors, visualValidated]
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100)

  return { module: name, path: relPath, routeAdded, themeScopeApplied, tokensOnly, noHardcodedColors, visualValidated, score }
}

function discoverModules(pdvRoot: string): Array<{ name: string; rel: string }> {
  const bases = ['app/admin', 'app/gerente', 'app/caixa']
  const modules: Array<{ name: string; rel: string }> = []

  for (const base of bases) {
    const absBase = path.join(pdvRoot, base)
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(absBase, { withFileTypes: true }) } catch { continue }

    if (base === 'app/caixa') {
      if (fs.existsSync(absBase)) modules.push({ name: 'caixa', rel: base })
      continue
    }

    for (const e of entries) {
      if (e.isDirectory() && !['[...path]', 'shared', 'features'].includes(e.name)) {
        modules.push({ name: e.name, rel: `${base}/${e.name}` })
      }
    }
  }
  return modules
}

export function run(rootDir: string): MigrationCheckResult {
  const pdvRoot = path.join(rootDir, 'pdv-importados')
  const discovered = discoverModules(pdvRoot)
  const modules = discovered.map(m => checkModule(pdvRoot, m.name, m.rel))
  const compliantCount = modules.filter(m => m.score === 100).length

  return {
    agent: 'migration-check',
    timestamp: new Date().toISOString(),
    modules,
    compliantCount,
    totalCount: modules.length,
  }
}
