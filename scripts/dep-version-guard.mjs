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
  react:                   { lockedMajorMinor: '19.2', scope: 'react' },
  'react-dom':             { lockedMajorMinor: '19.2', scope: 'react' },
}

/**
 * Pacotes que só podem existir em UMA cópia na árvore inteira.
 *
 * React guarda estado de módulo (o dispatcher de hooks). Duas cópias =
 * dois dispatchers: o runtime do Next lê uma, o código do app lê a outra, e
 * a que não está renderizando tem dispatcher `null`. O sintoma é
 * `Cannot read properties of null (reading 'useContext')`.
 *
 * Como a duplicação nasce: `react-dom@X` declara peer `react: ^X`. Se um
 * workspace sobe react-dom sem subir react na mesma versão, o react hoisted
 * deixa de satisfazer o peer e o npm ANINHA um segundo par dentro do
 * workspace — silenciosamente, sem erro de install.
 *
 * Caso real: bump de react-dom 19.2.5 → 19.2.8 (Dependabot) com
 * `"react": "19"` em pdv-importados. `npm ci` passou, build da Vercel morreu
 * no prerender de /500. Regras 1–3 não pegavam: a versão hoisted continuava
 * 19.2.5 e a declaração continuava dentro de 19.2.
 */
const SINGLETON_PACKAGES = ['react', 'react-dom']

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
const requiredOverrides = ['vitest', '@vitest/ui', '@vitest/coverage-v8', 'react', 'react-dom']
for (const dep of requiredOverrides) {
  if (!overrides[dep]) {
    violations.push(
      `[package.json] overrides.${dep} ausente — adicione para prevenir drift de versão entre workspaces`,
    )
  }
}

// ─── Regra 4: instância única dos pacotes singleton ───────────────────────────
// Varre TODAS as chaves do lockfile, não só `node_modules/<pkg>`. Qualquer
// caminho aninhado (ex: `pdv-importados/node_modules/react`) é uma segunda cópia.
for (const pkg of SINGLETON_PACKAGES) {
  const copies = Object.entries(lockPkgs)
    .filter(([key]) => key === `node_modules/${pkg}` || key.endsWith(`/node_modules/${pkg}`))
    .map(([key, entry]) => `${key}@${entry.version}`)

  if (copies.length > 1) {
    violations.push(
      `[lockfile] ${pkg} tem ${copies.length} cópias na árvore — deve haver exatamente 1:\n` +
      copies.map((c) => `      ${c}`).join('\n'),
    )
  }
}

// ─── Regra 5: react e react-dom na mesma versão exata ─────────────────────────
// O peer de react-dom é `react: ^<mesma versão>`. Ranges diferentes (ou um
// caret onde o outro é exato) permitem que se separem no próximo bump.
{
  const reactLock = lockPkgs['node_modules/react']?.version
  const reactDomLock = lockPkgs['node_modules/react-dom']?.version
  if (reactLock && reactDomLock && reactLock !== reactDomLock) {
    violations.push(
      `[lockfile] react@${reactLock} ≠ react-dom@${reactDomLock} — devem ser a MESMA versão exata`,
    )
  }

  for (const relPath of WORKSPACES) {
    const absPath = path.join(root, relPath)
    if (!fs.existsSync(absPath)) continue
    const pkg = JSON.parse(fs.readFileSync(absPath, 'utf8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    const r = allDeps.react
    const rd = allDeps['react-dom']
    if (r && rd && r !== rd) {
      violations.push(
        `[${relPath}] react: "${r}" ≠ react-dom: "${rd}" — declare a MESMA versão exata nos dois`,
      )
    }
    for (const [dep, declared] of [['react', r], ['react-dom', rd]]) {
      if (declared && /^[\^~]/.test(declared)) {
        violations.push(
          `[${relPath}] ${dep}: "${declared}" — use versão exata (sem ^ ou ~); ` +
          `um range deixa react e react-dom se separarem e duplica a árvore`,
        )
      }
    }
  }
}

// ─── Resultado ────────────────────────────────────────────────────────────────
if (violations.length > 0) {
  console.error('[dep-version-guard] FAIL — drift de toolchain detectado:\n')
  for (const v of violations) console.error(`  - ${v}`)
  console.error(
    '\n  → Toolchain locked: vitest@3.2.x e react/react-dom@19.2.5 em todos os workspaces.' +
    '\n  → Subir react OU react-dom exige subir os DOIS na mesma versão exata, em' +
    '\n    pdv-importados, pdv-local e em overrides na raiz — os três juntos, no mesmo commit.' +
    '\n    Bump de só um deles quebra o peer, o npm aninha uma 2ª cópia de React e o' +
    '\n    build da Vercel morre em "Cannot read properties of null (reading \'useContext\')".' +
    '\n  → Adicionar nova versão de vitest é mudança arquitetural — atualize TOOLCHAIN_POLICY e alinhe TODOS os workspaces antes de commitar.' +
    '\n  → Ver scripts/dep-version-guard.mjs',
  )
  process.exit(1)
}

console.log(
  '[dep-version-guard] OK — vitest@3.2.x e react/react-dom@19.2.5 consistentes; ' +
  'instância única de React na árvore',
)
