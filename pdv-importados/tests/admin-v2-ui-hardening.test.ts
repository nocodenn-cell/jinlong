import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_IGNORE = new Set(['node_modules', '.next', 'dist', 'coverage', '.git'])

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SCAN_IGNORE.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, acc)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

function rel(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: '--fp-', re: /--fp-/ },
  { name: 'fp-btn', re: /\bfp-btn\b/ },
  { name: 'zinc layout', re: /\bzinc-\d/ },
  { name: 'bg-slate', re: /\bbg-slate-/ },
  { name: 'bg-white solid', re: /\bbg-white(?![/\[])/ },
]

const ALLOWED_HOVER_WHITE = /bg-white\/\[/

describe('admin v2 ui hardening', () => {
  it('layout uses AdminV2Shell only', () => {
    const layoutSrc = fs.readFileSync(path.join(ROOT, 'app', 'admin', 'layout.tsx'), 'utf8')
    expect(layoutSrc).toContain('AdminV2Shell')
    expect(layoutSrc).not.toMatch(/\bAdminShell\b/)
  })

  it('legacy shell foi removido (não pode voltar em legacy/ nem em app/admin)', () => {
    // A quarentena legacy/admin foi eliminada: os arquivos tinham zero
    // consumidores (o import já era proibido por no-restricted-imports) e o
    // AdminShell legado violava a regra Fase 0 de fundo escuro, bloqueando o
    // gate de lint. Histórico preservado no git.
    expect(fs.existsSync(path.join(ROOT, 'legacy', 'admin', 'AdminShell.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'legacy', 'admin', 'AdminSidebar.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'app', 'admin', '_components', 'AdminShell.tsx'))).toBe(
      false,
    )
  })

  it('AdminV2Shell is the single admin shell entry', () => {
    const shellSrc = fs.readFileSync(
      path.join(ROOT, 'components', 'ui', 'admin-v2', 'AdminV2Shell.tsx'),
      'utf8',
    )
    expect(shellSrc).toContain('data-admin-v2')
    expect(shellSrc).toContain("import '@/styles/admin-v2.css'")
  })

  it('app/admin has no forbidden legacy UI patterns', () => {
    const adminDir = path.join(ROOT, 'app', 'admin')
    const files = walkFiles(adminDir)
    const violations: string[] = []

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        const lines = src.split('\n')
        lines.forEach((line, i) => {
          if (!re.test(line)) return
          if (name === 'bg-white solid' && ALLOWED_HOVER_WHITE.test(line)) return
          violations.push(`${rel(file)}:${i + 1} (${name})`)
        })
      }
      if (/\bAdminShell\b/.test(src) || /\bAdminSidebar\b/.test(src)) {
        violations.push(`${rel(file)} (imports legacy shell)`)
      }
      if (/@\/components\/ui\/StatCard/.test(src)) {
        violations.push(`${rel(file)} (imports StatCard)`)
      }
      if (/legacy\/admin/.test(src)) {
        violations.push(`${rel(file)} (imports legacy/admin)`)
      }
    }

    expect(violations).toEqual([])
  })

  it('FilterBar and DataTable have no phantom fp tokens', () => {
    for (const file of ['components/ui/FilterBar.tsx', 'components/ui/DataTable.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      expect(src).not.toMatch(/--fp-/)
      expect(src).not.toMatch(/\bfp-btn\b/)
    }
  })

  it('admin loading route usa token de superfície (tema claro único, Fase 0)', () => {
    // Antes exigia '#0a0a0a' (era dark). Após a migração Layout Compiler Fase 0
    // (tema claro único), fundo escuro hardcoded é PROIBIDO — inclusive por
    // lint (no-restricted-syntax). O loading usa token de superfície.
    const src = fs.readFileSync(path.join(ROOT, 'app', 'admin', 'loading.tsx'), 'utf8')
    expect(src).toContain('bg-jl-surface-soft')
    expect(src).not.toContain('#0a0a0a')
  })
})
