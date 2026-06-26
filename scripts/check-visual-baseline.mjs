#!/usr/bin/env node
/**
 * VALIDAÇÃO DE BASELINE VISUAL — auditoria de conformidade visual do Dashboard Clássico.
 *
 * Objetivo: criar uma camada de contrato visual que completa o ciclo:
 *   • guard:theme — regras técnicas (cor em código)
 *   • checklist — estado factual (rota, scope, tokens)
 *   • baseline visual — percepção humana (cores, espaçamento, tipografia)
 *
 * Este script é OBSERVACIONAL (não bloqueante). Lê a baseline oficial em
 * design-system/baseline/dashboard-classico.json, analisa os tokens CSS e
 * componentes-chave, e reporta conformidade visual.
 *
 * Saída: JSON com { matchesBaseline, diffDetected, details, violations }
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── Configuração de baseline ──────────────────────────────────────────────────
const BASELINE_FILE = path.join(root, 'design-system/baseline/dashboard-classico.json')
const TOKENS_DIR = path.join(root, 'pdv-importados/styles/tokens/classico')
const DASHBOARD_ROUTE = '/admin/dashboard'

// ── Utilidades ────────────────────────────────────────────────────────────────
function read(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function parseJSON(src, defaultValue = null) {
  try {
    return JSON.parse(src)
  } catch {
    return defaultValue
  }
}

function extractCSSVariables(src) {
  const vars = {}
  const regex = /--([a-z0-9-]+):\s*([^;]+);/g
  let match
  while ((match = regex.exec(src)) !== null) {
    vars[`--${match[1]}`] = match[2].trim()
  }
  return vars
}

function hashObject(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort())
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16)
}

// ── Extração de tokens do repositório ─────────────────────────────────────────
function analyzeCurrentTokens() {
  const violations = []
  const tokens = {}

  if (!fs.existsSync(TOKENS_DIR)) {
    violations.push(`Diretório de tokens não encontrado: ${TOKENS_DIR}`)
    return { tokens, violations, filesScanned: 0 }
  }

  const files = fs.readdirSync(TOKENS_DIR).filter((f) => f.endsWith('.css'))
  let filesScanned = 0

  for (const file of files) {
    const src = read(path.join(TOKENS_DIR, file))
    if (!src) continue
    filesScanned++

    const extracted = extractCSSVariables(src)
    Object.assign(tokens, extracted)

    // Validar cores críticas (baselines esperadas)
    const criticalColors = {
      '--cl-blue-600': '#2563eb',
      '--color-background': '#ffffff',
      '--color-border': '#e5e7eb',
    }

    for (const [varName, expectedValue] of Object.entries(criticalColors)) {
      if (extracted[varName] && !extracted[varName].includes(expectedValue.replace('#', ''))) {
        violations.push(`${file}: ${varName} diverge do esperado (${expectedValue})`)
      }
    }
  }

  return { tokens, violations, filesScanned }
}

// ── Validação contra baseline ─────────────────────────────────────────────────
function validateAgainstBaseline(baseline, current) {
  const issues = []

  if (!baseline.baseline) {
    return { isValid: false, issues: ['Baseline está vazia ou malformada'] }
  }

  const baselineTokens = baseline.baseline.tokenSignatures || {}
  const baselineColors = baseline.baseline.keyColors || {}

  // Verificar presença de tokens críticos
  for (const [name, tokenVar] of Object.entries(baselineTokens)) {
    if (!current.tokens[tokenVar]) {
      issues.push(`Token crítico ausente: ${tokenVar} (${name})`)
    }
  }

  // Verificar integridade de cores
  for (const [name, expectedColor] of Object.entries(baselineColors)) {
    const found = Object.values(current.tokens).some((v) =>
      v.includes(expectedColor.replace('#', ''))
    )
    if (!found) {
      issues.push(`Cor crítica não encontrada nos tokens: ${name} (${expectedColor})`)
    }
  }

  return { isValid: issues.length === 0, issues }
}

// ── Processamento principal ──────────────────────────────────────────────────
function main() {
  const baselineSrc = read(BASELINE_FILE)
  if (!baselineSrc) {
    const error = { error: `Baseline não encontrada: ${BASELINE_FILE}` }
    console.log(JSON.stringify(error, null, 2))
    return error
  }

  const baseline = parseJSON(baselineSrc)
  if (!baseline || !baseline.contract) {
    const error = { error: 'Baseline malformada ou inválida' }
    console.log(JSON.stringify(error, null, 2))
    return error
  }

  const current = analyzeCurrentTokens()
  const validation = validateAgainstBaseline(baseline, current)

  // Gerar hash da baseline atual
  const baselineHash = hashObject({
    tokens: current.tokens,
    timestamp: new Date().toISOString(),
  })

  // Estrutura de saída
  const report = {
    contract: 'visual-baseline-check',
    version: '1.0',
    route: DASHBOARD_ROUTE,
    theme: 'classico',
    checkDate: new Date().toISOString(),
    matchesBaseline: validation.isValid && current.violations.length === 0,
    diffDetected: validation.issues.length + current.violations.length,
    details: {
      baselineValidated: baseline.baseline.lastValidated,
      tokensScanned: current.filesScanned,
      criticalTokensFound: Object.keys(current.tokens).length,
      validationIssues: validation.issues.length,
      tokenViolations: current.violations.length,
    },
    violations: {
      baseline: validation.issues.slice(0, 5),
      tokens: current.violations.slice(0, 5),
    },
    currentHash: baselineHash,
    purpose: 'Observabilidade visual — não bloqueante no CI',
  }

  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

main()
