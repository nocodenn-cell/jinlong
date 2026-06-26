import fs from 'node:fs'
import type { RiskLevel, ThemeAuditResult, ThemeFinding } from './types.js'

const HEX_RE = /(?<![a-zA-Z0-9-])#([0-9a-fA-F]{3,8})\b/g

const TAILWIND_COLOR_NAMES = [
  'amber','yellow','orange','red','rose','pink','purple','violet',
  'indigo','blue','sky','cyan','teal','green','emerald','lime',
  'slate','gray','zinc','neutral','stone',
].join('|')

const TAILWIND_RE = new RegExp(
  `(?:text|bg|border|ring|fill|stroke|from|to|via|decoration|caret|accent|divide|placeholder)-(?:${TAILWIND_COLOR_NAMES})-\\d{2,3}`,
  'g'
)

const HEX_TOKEN_MAP: Record<string, string> = {
  '#c9a227': 'var(--color-chart-gold)',
  '#d4af37': 'var(--color-dragon-gold-luxury)',
  '#bfa76a': 'var(--color-dragon-gold-cinzel)',
  '#fbbf24': 'var(--color-warning-400)',
  '#f59e0b': 'var(--color-warning-500)',
  '#d97706': 'var(--color-warning-600)',
  '#10b981': 'var(--color-success-500)',
  '#059669': 'var(--color-success-600)',
  '#ef4444': 'var(--color-danger-500)',
  '#dc2626': 'var(--color-danger-600)',
  '#0f172a': 'var(--color-background-primary)',
  '#1e293b': 'var(--color-background-secondary)',
  '#334155': 'var(--color-background-tertiary)',
  '#020617': 'var(--color-night-950)',
  '#242424': 'var(--admin-v2-border)',
}

const TAILWIND_TOKEN_MAP: Record<string, string> = {
  'text-amber-400': 'var(--color-warning-400)',
  'text-amber-500': 'var(--color-warning-500)',
  'text-amber-600': 'var(--color-warning-600)',
  'bg-amber-400': 'var(--color-warning-400)',
  'bg-amber-500': 'var(--color-warning-500)',
  'border-amber-400': 'var(--color-warning-400)',
  'text-yellow-400': 'var(--color-warning-400)',
  'text-yellow-500': 'var(--color-warning-500)',
  'text-green-500': 'var(--color-success-500)',
  'text-green-600': 'var(--color-success-600)',
  'text-emerald-500': 'var(--color-success-500)',
  'bg-green-500': 'var(--color-success-500)',
  'bg-emerald-500': 'var(--color-success-500)',
  'border-green-500': 'var(--color-success-500)',
  'text-red-500': 'var(--color-danger-500)',
  'text-red-600': 'var(--color-danger-600)',
  'bg-red-500': 'var(--color-danger-500)',
  'bg-red-600': 'var(--color-danger-600)',
  'border-red-500': 'var(--color-danger-500)',
  'text-rose-500': 'var(--color-danger-500)',
  'bg-slate-900': 'var(--color-background-primary)',
  'bg-slate-800': 'var(--color-background-secondary)',
  'bg-slate-700': 'var(--color-background-tertiary)',
  'text-slate-200': 'var(--color-text-primary)',
  'text-slate-300': 'var(--color-text-secondary)',
  'text-slate-400': 'var(--color-text-tertiary)',
  'text-slate-500': 'var(--color-text-disabled)',
  'text-gray-200': 'var(--color-text-primary)',
  'text-gray-300': 'var(--color-text-secondary)',
  'text-gray-400': 'var(--color-text-tertiary)',
  'text-gray-500': 'var(--color-text-disabled)',
  'border-slate-600': 'var(--color-border-secondary)',
  'border-slate-700': 'var(--color-border-secondary)',
  'border-gray-600': 'var(--color-border-secondary)',
}

const SKIP_PATHS = [
  'node_modules', '.next', 'dist', 'coverage',
  'globals.css', '/tokens/', 'theme-oriental', 'chinese-theme',
  'theme-fix', 'unstick-gerente',
]

function shouldSkip(filePath: string): boolean {
  return SKIP_PATHS.some(s => filePath.includes(s))
}

function scanFile(filePath: string): ThemeFinding[] {
  let content: string
  try { content = fs.readFileSync(filePath, 'utf8') } catch { return [] }

  const findings: ThemeFinding[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    HEX_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = HEX_RE.exec(line)) !== null) {
      if (m[1].length < 3) continue
      const value = m[0].toLowerCase()
      findings.push({
        file: filePath,
        line: lineNum,
        col: m.index + 1,
        type: 'hex-color',
        value,
        suggestion: HEX_TOKEN_MAP[value] ?? null,
      })
    }

    TAILWIND_RE.lastIndex = 0
    while ((m = TAILWIND_RE.exec(line)) !== null) {
      const value = m[0]
      findings.push({
        file: filePath,
        line: lineNum,
        col: m.index + 1,
        type: 'tailwind-color',
        value,
        suggestion: TAILWIND_TOKEN_MAP[value] ?? null,
      })
    }

    if (
      line.includes(':root') &&
      !filePath.endsWith('globals.css') &&
      !filePath.includes('/tokens/')
    ) {
      findings.push({
        file: filePath,
        line: lineNum,
        col: line.indexOf(':root') + 1,
        type: 'root-scope',
        value: ':root',
        suggestion: 'Use [data-app-theme] ou [data-admin-v2] em vez de :root',
      })
    }
  }

  return findings
}

function riskLevel(findings: ThemeFinding[]): RiskLevel {
  const hasRootScope = findings.some(f => f.type === 'root-scope')
  if (hasRootScope || findings.length > 20) return 'high'
  if (findings.length > 5) return 'medium'
  return 'low'
}

export function run(files: string[]): ThemeAuditResult {
  const scannable = files.filter(
    f => /\.(tsx?|css)$/.test(f) && !shouldSkip(f)
  )

  const findings: ThemeFinding[] = []
  for (const f of scannable) findings.push(...scanFile(f))

  return {
    agent: 'theme-audit',
    timestamp: new Date().toISOString(),
    risk: riskLevel(findings),
    totalFindings: findings.length,
    findings,
    affectedFiles: [...new Set(findings.map(f => f.file))],
  }
}
