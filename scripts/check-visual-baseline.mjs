#!/usr/bin/env node
/**
 * check-visual-baseline — diff tool puro.
 *
 * Compara o baseline visual estático com o estado atual dos arquivos fonte.
 * Retorna somente: { match: boolean, diff: string[] }
 *
 * NÃO interpreta conformidade.
 * NÃO emite julgamento de "correto/incorreto".
 * NÃO sugere prontidão ou bloqueio.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = path.join(root, 'design-system/baseline/dashboard-classico.json')
const CSS_PATH = path.join(root, 'pdv-importados/styles/admin-v2.css')
const PAGE_PATH = path.join(root, 'pdv-importados/app/admin/dashboard/page.tsx')

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function extractCssTokens(css) {
  const tokens = {}
  const re = /--(admin-v2-[\w-]+):\s*([^;]+);/g
  let m
  while ((m = re.exec(css)) !== null) {
    tokens[m[1]] = m[2].trim()
  }
  return tokens
}

function extractPageClasses(tsx) {
  const classes = new Set()
  const re = /className="([^"]+)"/g
  let m
  while ((m = re.exec(tsx)) !== null) {
    for (const cls of m[1].split(/\s+/)) {
      if (cls.startsWith('admin-v2-')) classes.add(cls)
    }
  }
  return classes
}

function extractComponents(tsx) {
  const comps = new Set()
  const re = /<([A-Z][A-Za-z]+)/g
  let m
  while ((m = re.exec(tsx)) !== null) {
    comps.add(m[1])
  }
  return comps
}

function run() {
  const baselineRaw = readFile(BASELINE_PATH)
  if (!baselineRaw) {
    process.stdout.write(JSON.stringify({ match: false, diff: ['baseline file not found: ' + BASELINE_PATH] }) + '\n')
    process.exit(0)
  }

  const baseline = JSON.parse(baselineRaw)
  const diff = []

  const css = readFile(CSS_PATH)
  if (!css) {
    diff.push('source not found: ' + CSS_PATH)
  } else {
    const currentTokens = extractCssTokens(css)
    for (const [token, expectedValue] of Object.entries(baseline.cssTokens ?? {})) {
      const actualValue = currentTokens[token]
      if (actualValue === undefined) {
        diff.push('missing css token: ' + token)
      } else if (actualValue !== expectedValue) {
        diff.push('css token changed: ' + token + ' | expected: ' + expectedValue + ' | actual: ' + actualValue)
      }
    }
  }

  const tsx = readFile(PAGE_PATH)
  if (!tsx) {
    diff.push('source not found: ' + PAGE_PATH)
  } else {
    const currentClasses = extractPageClasses(tsx)
    const baselineSections = baseline.layout?.sections ?? []
    for (const cls of baselineSections) {
      if (!currentClasses.has(cls)) {
        diff.push('missing layout class: ' + cls)
      }
    }

    if (baseline.layout?.rootClass) {
      for (const cls of baseline.layout.rootClass.split(/\s+/)) {
        if (cls.startsWith('admin-v2-') && !currentClasses.has(cls)) {
          diff.push('missing root class: ' + cls)
        }
      }
    }

    const currentComponents = extractComponents(tsx)
    for (const comp of baseline.components ?? []) {
      if (!currentComponents.has(comp)) {
        diff.push('missing component: ' + comp)
      }
    }

    const expectedPeriods = baseline.periodFilters ?? []
    for (const period of expectedPeriods) {
      if (!tsx.includes("'" + period + "'") && !tsx.includes('"' + period + '"')) {
        diff.push('missing period filter: ' + period)
      }
    }

    const expectedCols = baseline.tableColumns ?? []
    for (const col of expectedCols) {
      if (!tsx.includes(col)) {
        diff.push('missing table column reference: ' + col)
      }
    }
  }

  const result = { match: diff.length === 0, diff }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

run()
