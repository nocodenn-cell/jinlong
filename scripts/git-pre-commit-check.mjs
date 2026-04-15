#!/usr/bin/env node
/**
 * Bloqueia commit de arquivos de ambiente sensíveis (alinhado ao .gitignore do monorepo).
 * Instalação: git config core.hooksPath .githooks
 *
 * Usa execFile com caminho explícito ao git (evita depender do PATH — Sonar security hotspots).
 * Opcional: GIT_EXE=/caminho/completo/para/git
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

function resolveGitExecutable() {
  if (process.env.GIT_EXE && existsSync(process.env.GIT_EXE)) {
    return process.env.GIT_EXE
  }
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const candidates = [
      join(pf, 'Git', 'cmd', 'git.exe'),
      join(pf, 'Git', 'mingw64', 'bin', 'git.exe'),
      join(pf86, 'Git', 'cmd', 'git.exe'),
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
  } else {
    for (const p of ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git']) {
      if (existsSync(p)) return p
    }
  }
  throw new Error(
    '[git-pre-commit-check] git não encontrado. Instale o Git ou defina GIT_EXE com o caminho completo do executável.',
  )
}

const gitExe = resolveGitExecutable()

const root = execFileSync(gitExe, ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
process.chdir(root)

const staged = execFileSync(gitExe, ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
  encoding: 'utf8',
})
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
