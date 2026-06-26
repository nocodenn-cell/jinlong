import { execSync } from 'node:child_process'
import type { BaselineDivergence, DesignBaselineResult, RiskLevel } from './types.js'

function classifyDivergence(item: string): BaselineDivergence {
  if (item.startsWith('css token changed:')) {
    return { type: 'token-changed', description: item, severity: 'high' }
  }
  if (item.startsWith('missing css token:')) {
    return { type: 'missing-token', description: item, severity: 'high' }
  }
  if (item.startsWith('missing layout class:') || item.startsWith('missing root class:')) {
    return { type: 'missing-class', description: item, severity: 'medium' }
  }
  if (item.startsWith('missing component:')) {
    return { type: 'missing-component', description: item, severity: 'low' }
  }
  return { type: 'missing-class', description: item, severity: 'medium' }
}

export function run(rootDir: string): DesignBaselineResult {
  const timestamp = new Date().toISOString()

  let match = false
  let diff: string[] = []

  try {
    const output = execSync('node scripts/check-visual-baseline.mjs', {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 15_000,
    })
    const parsed = JSON.parse(output.trim()) as { match: boolean; diff: string[] }
    match = parsed.match
    diff = parsed.diff
  } catch (err) {
    diff = ['erro ao executar check-visual-baseline.mjs: ' + String(err)]
  }

  return {
    agent: 'design-baseline',
    timestamp,
    match,
    diff,
    divergences: diff.map(classifyDivergence),
  }
}
