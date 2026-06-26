/**
 * ci-execution-tracer — validador estático de instrumentação do ci-core.yml
 *
 * Lê .github/workflows/ci-core.yml e verifica se cada step crítico tem:
 *   - timestamp (date +%s)
 *   - captura de exit code (PIPESTATUS | EXIT=$?)
 *   - amostragem de stdout (tail -)
 *   - marcador CI_EXECUTION_COMPLETE no final
 *
 * Se algum step crítico estiver sem instrumentação, reporta o que falta.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { CIExecutionTracerResult, CIStepTrace } from './types.js'

const WORKFLOW_FILE = '.github/workflows/ci-core.yml'

// Nomes dos steps críticos para rastrear (substring match)
// Busca por: "TRACE: <comando>" nos step names (novo formato) OU comando direto
const CRITICAL_STEP_PATTERNS: Record<string, string> = {
  'checkout':      'actions/checkout',
  'node-version':  'node --version',
  'npm ci':        "TRACE: npm ci",
  'lint':          'turbo run lint',
  'typecheck':     "TRACE: lint + typecheck + test",
  'test':          "TRACE: lint + typecheck + test",
  'build':         'turbo run build',
  'guard:all':     "TRACE: guard:all",
}

function detectStep(yaml: string, pattern: string): boolean {
  return yaml.includes(pattern)
}

function hasTimestamp(yaml: string, stepContext: string): boolean {
  // Find the section of yaml around the step and check for timing
  const idx = yaml.indexOf(stepContext)
  if (idx < 0) return false
  // Look in a 1500-char window around the pattern
  const window = yaml.slice(Math.max(0, idx - 300), idx + 1700)
  return window.includes('date +%s') || window.includes('TRACE_START') || window.includes('$SECONDS') || window.includes('TRACE_')
}

function hasExitCapture(yaml: string, stepContext: string): boolean {
  const idx = yaml.indexOf(stepContext)
  if (idx < 0) return false
  const window = yaml.slice(Math.max(0, idx - 300), idx + 1700)
  return window.includes('PIPESTATUS') || window.includes('TRACE_EXIT') || window.includes('EXIT=$?') || window.includes('EXIT=${')
}

function hasOutputSample(yaml: string, stepContext: string): boolean {
  const idx = yaml.indexOf(stepContext)
  if (idx < 0) return false
  const window = yaml.slice(Math.max(0, idx - 300), idx + 1700)
  return window.includes('tail -') || window.includes('head -') || window.includes('tee ')
}

export function run(rootDir: string): CIExecutionTracerResult {
  const workflowPath = path.join(rootDir, WORKFLOW_FILE)
  const timestamp = new Date().toISOString()

  if (!fs.existsSync(workflowPath)) {
    return {
      agent: 'ci-execution-tracer',
      timestamp,
      workflowFile: WORKFLOW_FILE,
      jobs: [],
      hasCompletionMarker: false,
      criticalSteps: [],
      instrumentedCount: 0,
      totalCritical: Object.keys(CRITICAL_STEP_PATTERNS).length,
      score: 0,
    }
  }

  const yaml = fs.readFileSync(workflowPath, 'utf8')

  // Extract job names from yaml
  const jobMatches = yaml.match(/^\s{2}(\w[\w-]*):\s*$/gm) ?? []
  const jobs = jobMatches
    .map(m => m.trim().replace(':', ''))
    .filter(j => !['on', 'name', 'env', 'with', 'steps', 'inputs', 'push', 'pull_request', 'workflow_dispatch'].includes(j))

  const hasCompletionMarker = yaml.includes('CI_EXECUTION_COMPLETE')

  const criticalSteps: CIStepTrace[] = []

  for (const [name, pattern] of Object.entries(CRITICAL_STEP_PATTERNS)) {
    const found = detectStep(yaml, pattern)
    if (!found) {
      criticalSteps.push({ name, hasTimestamp: false, hasExitCapture: false, hasOutputSample: false, instrumented: false })
      continue
    }

    const hasTs   = hasTimestamp(yaml, pattern)
    const hasExit = hasExitCapture(yaml, pattern)
    const hasOut  = hasOutputSample(yaml, pattern)
    const instrumented = hasTs && hasExit

    criticalSteps.push({ name, hasTimestamp: hasTs, hasExitCapture: hasExit, hasOutputSample: hasOut, instrumented })
  }

  const instrumentedCount = criticalSteps.filter(s => s.instrumented).length
  const totalCritical = criticalSteps.length
  const score = totalCritical > 0 ? Math.round((instrumentedCount / totalCritical) * 100) : 0

  return {
    agent: 'ci-execution-tracer',
    timestamp,
    workflowFile: WORKFLOW_FILE,
    jobs,
    hasCompletionMarker,
    criticalSteps,
    instrumentedCount,
    totalCritical,
    score,
  }
}
