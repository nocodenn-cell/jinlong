/**
 * ci-failure-classifier — executa checks locais e classifica falhas de CI
 *
 * Roda comandos críticos do pipeline localmente, captura saída/exit code
 * e classifica cada falha em uma das 4 categorias:
 *
 *   PASS              — sem falha
 *   REAL_CODE_BUG     — erro de lint/typecheck/test determinístico
 *   DEPENDENCY_FAILURE — npm ci / postinstall / lockfile
 *   ENVIRONMENT_FAILURE — binário ausente, node version, permissão
 *   PIPELINE_ABORT    — cancelamento / SIGTERM / timeout
 *
 * Saída: JSON estruturado por check, com evidência da classificação.
 *
 * Se CI_LOG_FILE env var apontar para um log de CI capturado, classifica
 * a partir desse log em vez de rodar os comandos novamente.
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CIFailureClassifierResult, CICheckReport, CIFailureCategory } from './types.js'

// ── Padrões de classificação ─────────────────────────────────────────────────

const PATTERNS: Array<{ pattern: RegExp; category: CIFailureCategory; label: string }> = [
  // Environment failures
  { pattern: /command not found|ENOENT.*node|No such file.*node/i,    category: 'ENVIRONMENT_FAILURE', label: 'node não encontrado' },
  { pattern: /EACCES|permission denied/i,                              category: 'ENVIRONMENT_FAILURE', label: 'permissão negada' },
  { pattern: /ENOENT.*\.node$/i,                                       category: 'ENVIRONMENT_FAILURE', label: 'binário nativo ausente' },
  { pattern: /Engines.*node.*required|requires node/i,                 category: 'ENVIRONMENT_FAILURE', label: 'versão node incompatível' },

  // Dependency failures
  { pattern: /npm ERR! code (E404|E403|ENOTFOUND|ETIMEDOUT|ERESOLVE)/i, category: 'DEPENDENCY_FAILURE', label: 'npm registry/network error' },
  { pattern: /postinstall.*failed|install script.*failed/i,            category: 'DEPENDENCY_FAILURE', label: 'postinstall falhou' },
  { pattern: /integrity check failed|EINTEGRITY/i,                     category: 'DEPENDENCY_FAILURE', label: 'lockfile integridade' },
  { pattern: /downloads\.sentry-cdn\.com.*403|403.*sentry-cdn/i,      category: 'DEPENDENCY_FAILURE', label: 'sentry CDN bloqueado (SENTRYCLI_SKIP_DOWNLOAD?)' },

  // Pipeline aborts
  { pattern: /Process killed|SIGTERM|SIGKILL/i,                        category: 'PIPELINE_ABORT', label: 'processo terminado (SIGTERM/SIGKILL)' },
  { pattern: /Cancelled|workflow.*cancel/i,                            category: 'PIPELINE_ABORT', label: 'workflow cancelado' },
  { pattern: /timed out|timeout exceeded/i,                            category: 'PIPELINE_ABORT', label: 'timeout' },

  // Real code bugs
  { pattern: /error TS\d+:/i,                                          category: 'REAL_CODE_BUG', label: 'erro TypeScript' },
  { pattern: /\d+ error[s]?\s*$/m,                                     category: 'REAL_CODE_BUG', label: 'erros ESLint' },
  { pattern: /AssertionError|FAIL\s+\w|× \w|✗ \w|Test failed/i,      category: 'REAL_CODE_BUG', label: 'teste falhando' },
  { pattern: /\[guard\].*ERRO|guard.*failed/i,                         category: 'REAL_CODE_BUG', label: 'guard de arquitetura' },
]

function classify(stdout: string, stderr: string, exitCode: number, signo: string | null): { category: CIFailureCategory; evidence: string } {
  if (exitCode === 0) return { category: 'PASS', evidence: 'exit 0' }

  // Exit 130=SIGINT, 143=SIGTERM, 137=SIGKILL
  if (exitCode === 130 || exitCode === 143 || exitCode === 137 || signo === 'SIGTERM' || signo === 'SIGKILL') {
    return { category: 'PIPELINE_ABORT', evidence: `exit ${exitCode}${signo ? ' (' + signo + ')' : ''}` }
  }

  const combined = stdout + '\n' + stderr

  for (const { pattern, category, label } of PATTERNS) {
    const match = combined.match(pattern)
    if (match) {
      return { category, evidence: `${label}: "${match[0].slice(0, 120)}"` }
    }
  }

  // Default: if exit non-zero and we can't classify → assume code bug
  const lastLines = combined.split('\n').filter(Boolean).slice(-5).join(' | ')
  return { category: 'REAL_CODE_BUG', evidence: `exit ${exitCode}: ${lastLines.slice(0, 200)}` }
}

function runCheck(cmd: string[], cwd: string, timeoutMs = 120_000): CICheckReport {
  const t0 = Date.now()
  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd,
    timeout: timeoutMs,
    encoding: 'utf8',
    env: { ...process.env, SENTRYCLI_SKIP_DOWNLOAD: '1', NPM_CONFIG_FUND: 'false', FORCE_COLOR: '0' },
  })
  const durationMs = Date.now() - t0
  const exitCode = result.status ?? 1
  const signo = result.signal ?? null
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''

  const { category, evidence } = classify(stdout, stderr, exitCode, signo)

  return {
    command: cmd.join(' '),
    category,
    exitCode,
    durationMs,
    evidence,
  }
}

function classifyFromLog(logContent: string): CICheckReport[] {
  const checks: CICheckReport[] = []
  // Split log by step markers (TRACE_ annotations or step names)
  const steps = logContent.split(/^##\[group\]|^::group::/m).filter(Boolean)

  for (const step of steps) {
    const stepName = step.split('\n')[0].trim().slice(0, 80)
    const exitMatch = step.match(/exit[:=](\d+)/i)
    const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : -1
    if (exitCode < 0) continue // can't classify without exit code

    const { category, evidence } = classify(step, '', exitCode, null)
    const durMatch = step.match(/dur[:=](\d+)/i)
    checks.push({
      command: stepName,
      category,
      exitCode,
      durationMs: durMatch ? parseInt(durMatch[1], 10) * 1000 : 0,
      evidence,
    })
  }
  return checks
}

export function run(rootDir: string): CIFailureClassifierResult {
  const timestamp = new Date().toISOString()
  const pdvRoot = join(rootDir, 'pdv-importados')

  let sha = 'unknown'
  try { sha = execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8' }).trim() } catch { /* ok */ }

  let checks: CICheckReport[] = []

  // Se um log de CI foi capturado, classificar a partir dele
  const ciLogFile = process.env.CI_LOG_FILE
  if (ciLogFile && existsSync(ciLogFile)) {
    const logContent = readFileSync(ciLogFile, 'utf8')
    checks = classifyFromLog(logContent)
  } else {
    // Rodar checks localmente — modo local/dry-run
    checks = [
      // 1. Node version check
      runCheck(['node', '--version'], rootDir, 5_000),

      // 2. Lockfile integrity (npm ci --dry-run)
      runCheck(['npm', 'ci', '--dry-run', '--no-audit'], rootDir, 60_000),

      // 3. Architecture guard (rápido)
      runCheck(['npm', 'run', 'guard:all'], rootDir, 30_000),

      // 4. TypeScript (sem emit — rápido)
      runCheck(
        ['npx', 'tsc', '--noEmit', '--skipLibCheck', '-p', 'pdv-importados/tsconfig.typecheck.json'],
        rootDir,
        120_000
      ),

      // 5. ESLint — arquivo único no workspace correto
      runCheck(
        ['npx', 'eslint', 'app/page.tsx', '--ext', '.tsx', '--no-eslintrc', '--parser-options', 'ecmaVersion:2022'],
        pdvRoot,
        30_000
      ),
    ]

    // Renomear commands para clareza
    const labels = ['node --version', 'npm ci --dry-run', 'guard:all', 'tsc --noEmit', 'eslint (sample)']
    checks.forEach((c, i) => { c.command = labels[i] ?? c.command })
  }

  // Calcular sumário
  const categorySummary: Record<CIFailureCategory, number> = {
    PASS: 0, REAL_CODE_BUG: 0, DEPENDENCY_FAILURE: 0, ENVIRONMENT_FAILURE: 0, PIPELINE_ABORT: 0,
  }
  for (const c of checks) { categorySummary[c.category]++ }

  const canMerge = categorySummary.REAL_CODE_BUG === 0 && categorySummary.PIPELINE_ABORT === 0

  return {
    agent: 'ci-failure-classifier',
    timestamp,
    sha,
    checks,
    categorySummary,
    canMerge,
  }
}
