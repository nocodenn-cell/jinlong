#!/usr/bin/env tsx
/**
 * runner — orquestra todos os agentes em paralelo e posta resultado no PR.
 *
 * Todos os agentes são observacionais: não bloqueiam, não alteram código.
 *
 * Uso:
 *   npm run agents:run                     # local (sem post no GitHub)
 *   PR_NUMBER=123 npm run agents:run       # posta comentário no PR
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as themeAudit from './theme-audit-agent.js'
import * as tokenMigration from './token-migration-agent.js'
import * as migrationCheck from './migration-check-agent.js'
import * as designBaseline from './design-baseline-agent.js'
import * as ciTracer from './ci-execution-tracer.js'
import * as ciClassifier from './ci-failure-classifier.js'
import type { AgentReport, RiskLevel } from './types.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.git'])

function readDirRecursive(dir: string, exts: string[]): string[] {
  const out: string[] = []
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) out.push(...readDirRecursive(p, exts))
    else if (e.isFile() && exts.some(x => e.name.endsWith(x))) out.push(p)
  }
  return out
}

function getChangedFiles(): string[] {
  try {
    const out = execSync('git diff --name-only origin/main...HEAD', {
      cwd: root, encoding: 'utf8',
    }).trim()
    if (!out) return []
    return out.split('\n').filter(Boolean).map(f => path.join(root, f))
  } catch {
    return []
  }
}

function resolveFilesToScan(): string[] {
  const changed = getChangedFiles()
  if (changed.length > 0) return changed
  return readDirRecursive(path.join(root, 'pdv-importados'), ['.tsx', '.ts', '.css'])
}

const RISK_EMOJI: Record<RiskLevel, string> = { low: '🟢', medium: '🟡', high: '🔴' }
const CHECK = '✅'
const FAIL = '❌'

function formatComment(report: AgentReport): string {
  const { themeAudit: ta, tokenMigration: tm, migrationCheck: mc, designBaseline: db, ciTracer: ct, ciClassifier: cc } = report

  const lines: string[] = [
    '## 🤖 Agent Analysis Report',
    `> Gerado em: ${report.generated} | Observacional — não bloqueia merge`,
    '',
  ]

  // CI Failure Classifier
  const classifier_emoji = cc.canMerge ? '🟢' : '🔴'
  lines.push(`### ${classifier_emoji} \`ci-failure-classifier\``)
  lines.push(`**Diagnóstico**: ${cc.canMerge ? 'Pode mergear (código OK)' : 'Bloqueado (bug ou pipeline abort)'}`)
  lines.push(`SHA: \`${cc.sha.slice(0, 12)}\` | Checks: ${cc.checks.length}`)
  lines.push('')
  lines.push('| Check | Categoria | Exit | Duração | Evidência |')
  lines.push('|-------|-----------|------|---------|-----------|')
  for (const chk of cc.checks) {
    const icon = chk.category === 'PASS' ? '✅' : chk.category === 'REAL_CODE_BUG' ? '🔴' : chk.category === 'ENVIRONMENT_FAILURE' ? '⚠️' : '❌'
    const dur = chk.durationMs > 0 ? `${(chk.durationMs / 1000).toFixed(1)}s` : '—'
    lines.push(`| ${chk.command.slice(0, 30)} | ${icon} ${chk.category} | ${chk.exitCode} | ${dur} | ${chk.evidence.slice(0, 50)} |`)
  }
  lines.push('')

  // CI Execution Tracer
  const tracer_emoji = ct.score === 100 ? '🟢' : ct.score >= 50 ? '🟡' : '🔴'
  lines.push(`### ${tracer_emoji} \`ci-execution-tracer\``)
  lines.push(`Instrumentação: **${ct.instrumentedCount}/${ct.totalCritical}** steps (${ct.score}%)`)
  lines.push(`Marker completo: ${ct.hasCompletionMarker ? '✅' : '❌'} CI_EXECUTION_COMPLETE`)
  lines.push('')
  if (ct.criticalSteps.filter(s => !s.instrumented).length > 0) {
    lines.push('<details><summary>Steps faltando instrumentação</summary>')
    lines.push('')
    for (const step of ct.criticalSteps.filter(s => !s.instrumented)) {
      lines.push(`- \`${step.name}\`: ${step.hasTimestamp ? '✅ timestamp' : '❌ timestamp'} ${step.hasExitCapture ? '✅ exit' : '❌ exit'} ${step.hasOutputSample ? '✅ output' : '❌ output'}`)
    }
    lines.push('')
    lines.push('</details>')
  }
  lines.push('')

  // Theme Audit
  lines.push(`### ${RISK_EMOJI[ta.risk]} \`theme-audit-agent\``)
  lines.push(`Risco: **${ta.risk.toUpperCase()}** · Findings: **${ta.totalFindings}** · Arquivos: **${ta.affectedFiles.length}**`)
  if (ta.findings.length > 0) {
    lines.push('')
    lines.push('<details><summary>Ver findings de cor</summary>')
    lines.push('')
    lines.push('| Arquivo | Linha | Tipo | Valor | Token sugerido |')
    lines.push('|---------|-------|------|-------|----------------|')
    for (const f of ta.findings.slice(0, 15)) {
      const short = f.file.replace(root + '/', '')
      lines.push(`| \`${short}\` | ${f.line} | \`${f.type}\` | \`${f.value}\` | ${f.suggestion ? `\`${f.suggestion}\`` : '—'} |`)
    }
    if (ta.findings.length > 15) lines.push(`| *(+${ta.findings.length - 15} mais)* | | | | |`)
    lines.push('')
    lines.push('</details>')
  }
  lines.push('')

  // Token Migration
  lines.push(`### 🔄 \`token-migration-agent\``)
  lines.push(`Migrações com token sugerido: **${tm.totalMigrations}**`)
  if (tm.patchPreview) {
    lines.push('')
    lines.push('<details><summary>Ver patch preview (somente leitura — não aplicar automaticamente)</summary>')
    lines.push('')
    lines.push('```diff')
    lines.push(tm.patchPreview.slice(0, 2500))
    if (tm.patchPreview.length > 2500) lines.push('... (truncado)')
    lines.push('```')
    lines.push('')
    lines.push('</details>')
  }
  lines.push('')

  // Migration Check
  lines.push(`### 📋 \`migration-check-agent\``)
  lines.push(`Módulos conformes: **${mc.compliantCount}/${mc.totalCount}**`)
  lines.push('')
  lines.push('| Módulo | Rota | Tema | Tokens | Sem hex | Visual | Score |')
  lines.push('|--------|:----:|:----:|:------:|:-------:|:------:|------:|')
  for (const m of mc.modules) {
    lines.push(
      `| \`${m.module}\` | ${m.routeAdded ? CHECK : FAIL} | ${m.themeScopeApplied ? CHECK : FAIL} | ${m.tokensOnly ? CHECK : FAIL} | ${m.noHardcodedColors ? CHECK : FAIL} | ${m.visualValidated ? CHECK : FAIL} | **${m.score}%** |`
    )
  }
  lines.push('')

  // Design Baseline
  const baselineIcon = db.match ? CHECK : '⚠️'
  lines.push(`### 🎨 \`design-baseline-agent\``)
  lines.push(`Status: ${baselineIcon} ${db.match ? 'Match com baseline' : `${db.diff.length} divergência(s)`}`)
  if (db.divergences.length > 0) {
    lines.push('')
    lines.push('<details><summary>Ver divergências vs dashboard-classico</summary>')
    lines.push('')
    for (const d of db.divergences) {
      lines.push(`- ${RISK_EMOJI[d.severity]} \`${d.type}\`: ${d.description}`)
    }
    lines.push('')
    lines.push('</details>')
  }
  lines.push('')
  lines.push('---')
  lines.push('> 🚫 **Estes agentes são observacionais.** Não bloqueiam CI, não alteram código, não substituem guard:theme.')

  return lines.join('\n')
}

async function postGitHubComment(body: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const pr = process.env.PR_NUMBER

  if (!token || !repo || !pr) {
    console.log('[runner] Sem credenciais GitHub — skipping post de comentário.')
    return
  }

  const url = `https://api.github.com/repos/${repo}/issues/${pr}/comments`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fastproduct-agents/1.0',
    },
    body: JSON.stringify({ body }),
  })

  if (res.ok) {
    console.log(`[runner] Comentário postado no PR #${pr}`)
  } else {
    console.error(`[runner] GitHub API ${res.status}: ${await res.text()}`)
  }
}

async function main(): Promise<void> {
  console.log('[runner] Iniciando agentes...')

  const files = resolveFilesToScan()
  console.log(`[runner] Arquivos para análise: ${files.length}`)

  const [ta, mc, db, ct, cc] = await Promise.all([
    Promise.resolve(themeAudit.run(files)),
    Promise.resolve(migrationCheck.run(root)),
    Promise.resolve(designBaseline.run(root)),
    Promise.resolve(ciTracer.run(root)),
    Promise.resolve(ciClassifier.run(root)),
  ])

  const tm = tokenMigration.run(ta.findings)

  const report: AgentReport = {
    generated: new Date().toISOString(),
    themeAudit: ta,
    tokenMigration: tm,
    migrationCheck: mc,
    designBaseline: db,
    ciTracer: ct,
    ciClassifier: cc,
  }

  console.log('\n=== AGENT REPORT (JSON) ===')
  console.log(JSON.stringify(report, null, 2))
  console.log('===========================\n')

  const comment = formatComment(report)
  console.log('=== GITHUB COMMENT PREVIEW ===')
  console.log(comment)
  console.log('==============================\n')

  await postGitHubComment(comment)
}

main().catch(err => {
  console.error('[runner] Fatal:', err)
  process.exit(1)
})
