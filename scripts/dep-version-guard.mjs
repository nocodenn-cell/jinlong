#!/usr/bin/env node
/**
 * DEP VERSION GUARD — toolchain único e imutável no monorepo.
 *
 * Regras:
 *   1. Todo @vitest/* resolvido no lockfile deve estar em VITEST_LOCKED.
 *   2. Nenhum workspace pode declarar uma versão que escape do range de VITEST_LOCKED.
 *   3. A presença de `overrides` no root package.json é obrigatória.
 *
 * Adicionar suporte a outro toolchain (ex: vite, eslint): basta adicionar
 * entradas em TOOLCHAIN_POLICY abaixo — o restante do mecanismo é genérico.
 *
 * Por que: o bug do @vitest/ui@4.1.9 vs vitest@3.x quebrou o deploy no Vercel.
 * Este guard torna esse drift detectável antes do commit.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ─── Política de toolchain ────────────────────────────────────────────────────
// Para cada package listado, a versão resolvida no lockfile DEVE começar com
// o prefix aqui definido. Workspaces também não podem declarar versão fora do range.
const TOOLCHAIN_POLICY = {
  vitest:                  { lockedMajorMinor: '3.2', scope: '@vitest' },
  '@vitest/ui':            { lockedMajorMinor: '3.2', scope: '@vitest' },
  '@vitest/coverage-v8':   { lockedMajorMinor: '3.2', scope: '@vitest' },
  '@vitest/expect':        { lockedMajorMinor: '3.2', scope: '@vitest' },
  '@vitest/runner':        { lockedMajorMinor: '3.2', scope: '@vitest' },
  '@vitest/spy':           { lockedMajorMinor: '3.2', scope: '@vitest' },
  '@vitest/snapshot':      { lockedMajorMinor: '3.2', scope: '@vitest' },
  '@vitest/utils':         { lockedMajorMinor: '3.2', scope: '@vitest' },
  '@vitest/mocker':        { lockedMajorMinor: '3.2', scope: '@vitest' },
  '@vitest/pretty-format': { lockedMajorMinor: '3.2', scope: '@vitest' },
}

const WORKSPACES = ['package.json', 'pdv-importados/package.json', 'pdv-local/package.json']

// ─── Ler lockfile ─────────────────────────────────────────────────────────────
const lockPath = path.join(root, 'package-lock.json')
if (!fs.existsSync(lockPath)) {
  console.error('[dep-version-guard] FAIL — package-lock.json não encontrado na raiz.')
  process.exit(1)
}
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
const lockPkgs = lock.packages ?? {}

const violations = []

// ─── Regra 1: versão resolvida no lockfile ────────────────────────────────────
for (const [pkg, { lockedMajorMinor }] of Object.entries(TOOLCHAIN_POLICY)) {
  const entry = lockPkgs[`node_modules/${pkg}`]
  if (!entry) continue // não instalado — OK (optional dep)
  const { version } = entry
  if (!version.startsWith(lockedMajorMinor + '.')) {
    violations.push(
      `[lockfile] ${pkg}@${version} — esperado ^${lockedMajorMinor}.x (toolchain locked)`,
    )
  }
}

// ─── Regra 2: declarações nos package.json dos workspaces ─────────────────────
for (const relPath of WORKSPACES) {
  const absPath = path.join(root, relPath)
  if (!fs.existsSync(absPath)) continue
  const pkg = JSON.parse(fs.readFileSync(absPath, 'utf8'))
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const [dep, policy] of Object.entries(TOOLCHAIN_POLICY)) {
    const declared = allDeps[dep]
    if (!declared) continue
    // Extrai major.minor da declaração (ex: "^3.2.4" → "3.2", "4.1.9" → "4.1")
    const match = declared.replace(/^[\^~>=<]/, '').match(/^(\d+\.\d+)/)
    if (!match) continue
    const declaredMM = match[1]
    if (declaredMM !== policy.lockedMajorMinor) {
      violations.push(
        `[${relPath}] ${dep}: "${declared}" — esperado ^${policy.lockedMajorMinor}.x`,
      )
    }
  }
}

// ─── Regra 3: overrides obrigatórios no root ──────────────────────────────────
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const overrides = rootPkg.overrides ?? {}
const requiredOverrides = ['vitest', '@vitest/ui', '@vitest/coverage-v8']
for (const dep of requiredOverrides) {
  if (!overrides[dep]) {
    violations.push(
      `[package.json] overrides.${dep} ausente — adicione para prevenir drift de versão entre workspaces`,
    )
  }
}

// ─── Resultado ────────────────────────────────────────────────────────────────
if (violations.length > 0) {
  console.error('[dep-version-guard] FAIL — drift de toolchain detectado:\n')
  for (const v of violations) console.error(`  - ${v}`)
  console.error(
    '\n  → Toolchain locked: vitest@3.2.x em todos os workspaces.' +
    '\n  → Adicionar nova versão de vitest é mudança arquitetural — atualize TOOLCHAIN_POLICY e alinhe TODOS os workspaces antes de commitar.' +
    '\n  → Ver scripts/dep-version-guard.mjs',
  )
  process.exit(1)
}

console.log('[dep-version-guard] OK — toolchain consistente: vitest@3.2.x em todos os workspaces e lockfile')
