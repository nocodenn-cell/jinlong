#!/usr/bin/env node
/**
 * Bloqueia commit de arquivos de ambiente sensíveis (alinhado ao .gitignore do monorepo).
 * Instalação: git config core.hooksPath .githooks
 */
import { execSync } from 'node:child_process'
import process from 'node:process'

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
process.chdir(root)

const staged = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean)

function isBlockedEnvPath(rel) {
  const norm = rel.replace(/\\/g, '/')
  const base = norm.split('/').pop() ?? ''
  if (base === '.env.example' || base.endsWith('.env.example')) return false
  if (base === '.env.sample' || base.endsWith('.env.sample')) return false
  if (base === '.env' || norm.endsWith('/.env')) return true
  if (base === '.env.local' || /\.env\.[^/]+\.local$/.test(base)) return true
  if (base.startsWith('.env.')) return true
  return false
}

const bad = staged.filter(isBlockedEnvPath)
if (bad.length > 0) {
  console.error('Commit recusado: não versionar arquivos de credenciais / ambiente:')
  for (const p of bad) console.error(`  - ${p}`)
  console.error('Use apenas .env.example (placeholders). Ver .gitignore na raiz do monorepo.')
  process.exit(1)
}
