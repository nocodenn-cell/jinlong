/**
 * Testa a lógica do Ignored Build Step do `jinlong-site` (site/scripts/vercel-ignore.sh) contra
 * repositórios git temporários. Contrato da Vercel: exit 0 = ignorar o build, exit 1 = executar.
 *
 *   node --test scripts/vercel-site-ignore.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site', 'scripts', 'vercel-ignore.sh')
const BASE_FILES = {
  'site/package.json': '{"name":"jinlong-site"}',
  'site/app/page.tsx': 'export default null',
  'site/vercel.json': '{}',
  'pdv-importados/app/page.tsx': 'export default null',
  'pdv-importados/vercel.json': '{}',
  'pdv-local/src/main.ts': '',
  'shared-core/src/index.ts': '',
  'backend/package.json': '{}',
  'backend/supabase/migrations/001.sql': 'select 1;',
  'docs/architecture/README.md': '# docs',
  'package.json': '{"name":"root"}',
  'package-lock.json': '{}',
  'vercel.json': '{}',
}
const IGNORE = 0
const BUILD = 1
const dirs = []

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function write(repo, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(repo, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
}

function commit(repo, files, message = 'commit') {
  write(repo, files)
  git(repo, 'add', '-A')
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message)
  return git(repo, 'rev-parse', 'HEAD')
}

function newRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-step-'))
  dirs.push(repo)
  git(repo, 'init', '-q')
  return { repo, base: commit(repo, BASE_FILES, 'base') }
}

/**
 * Executa o script como a Vercel: cwd = Root Directory (site/), base = último deploy bem-sucedido.
 * `vercelEnv = null` = variável ausente.
 */
function runStep(repo, previous, cwd = path.join(repo, 'site'), vercelEnv = 'production') {
  const env = { ...process.env }
  delete env.VERCEL_GIT_PREVIOUS_SHA
  delete env.VERCEL_ENV
  if (previous !== undefined) env.VERCEL_GIT_PREVIOUS_SHA = previous
  if (vercelEnv !== null) env.VERCEL_ENV = vercelEnv
  return spawnSync('sh', [SCRIPT], { cwd, env, encoding: 'utf8' }).status
}

/**
 * Simula o primeiro push de uma branch como a Vercel o vê: clone RASO (`depth`) da branch, sem
 * acesso à main e sem deploy anterior (sem VERCEL_GIT_PREVIOUS_SHA).
 */
function shallowBranch(branchCommits, depth) {
  const { repo } = newRepo()
  // histórico da main maior que a profundidade do clone, como no repositório real
  for (let i = 0; i < 12; i++) commit(repo, { [`docs/historico-${i}.md`]: `# ${i}` }, `main ${i}`)
  git(repo, 'checkout', '-q', '-b', 'feature')
  for (const files of branchCommits) commit(repo, files)
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-clone-'))
  dirs.push(clone)
  const url = 'file://' + repo.split(path.sep).join('/')
  git(clone, 'clone', '-q', '--depth', String(depth), '--branch', 'feature', url, '.')
  return clone
}

const preview = (clone) => runStep(clone, undefined, path.join(clone, 'site'), 'preview')

function scenario(files) {
  const { repo, base } = newRepo()
  commit(repo, files)
  return runStep(repo, base)
}

after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

describe('Ignored Build Step do jinlong-site', () => {
  it('o script versionado usa fim de linha LF (CRLF quebra o sh no Linux da Vercel)', () => {
    const committed = execFileSync('git', ['show', ':site/scripts/vercel-ignore.sh'], {
      cwd: path.dirname(SCRIPT),
      encoding: 'utf8',
    })
    assert.equal(committed.includes('\r'), false)
    assert.equal(fs.readFileSync(SCRIPT, 'utf8').includes('\r'), false)
  })

  it('A: commit só em backend/ → ignora', () => {
    assert.equal(scenario({ 'backend/supabase/migrations/002.sql': 'select 2;', 'backend/package.json': '{"v":2}' }), IGNORE)
  })

  it('B: commit só em docs/architecture/ → ignora', () => {
    assert.equal(scenario({ 'docs/architecture/multiempresa/NOVO.md': '# novo' }), IGNORE)
  })

  it('C: commit só no frontend do ERP → ignora', () => {
    assert.equal(scenario({ 'pdv-importados/app/page.tsx': 'export default 1' }), IGNORE)
  })

  it('D: commit só no site → executa', () => {
    assert.equal(scenario({ 'site/app/page.tsx': 'export default 2' }), BUILD)
  })

  it('E: dependências compartilhadas (lockfile, package.json e .npmrc da raiz) → executa', () => {
    assert.equal(scenario({ 'package-lock.json': '{"changed":true}' }), BUILD)
    assert.equal(scenario({ 'package.json': '{"name":"root","v":2}' }), BUILD)
    assert.equal(scenario({ '.npmrc': 'legacy-peer-deps=true' }), BUILD)
  })

  it('E2: código compartilhado que o site não importa (shared-core, pdv-local) → ignora', () => {
    assert.equal(scenario({ 'shared-core/src/index.ts': 'export const x = 1' }), IGNORE)
    assert.equal(scenario({ 'pdv-local/src/main.ts': 'export {}' }), IGNORE)
  })

  it('F: configuração Vercel — do site executa; da raiz e do ERP ignoram (não são lidas pelo site)', () => {
    assert.equal(scenario({ 'site/vercel.json': '{"regions":["gru1"]}' }), BUILD)
    assert.equal(scenario({ 'vercel.json': '{"framework":"nextjs"}' }), IGNORE)
    assert.equal(scenario({ 'pdv-importados/vercel.json': '{"regions":["gru1"]}' }), IGNORE)
  })

  it('G: commit misto (ERP + site + backend) → executa', () => {
    const files = { 'pdv-importados/app/page.tsx': 'export default 3', 'site/app/page.tsx': 'export default 3', 'backend/package.json': '{"v":3}' }
    assert.equal(scenario(files), BUILD)
  })

  it('H: push com vários commits — o relevante no meio não pode ser perdido', () => {
    const { repo, base } = newRepo()
    commit(repo, { 'site/app/page.tsx': 'export default 4' }, 'muda o site')
    commit(repo, { 'backend/package.json': '{"v":4}' }, 'só backend (último commit)')
    assert.equal(runStep(repo, base), BUILD)
  })

  it('H2: vários commits, todos irrelevantes → ignora', () => {
    const { repo, base } = newRepo()
    commit(repo, { 'backend/package.json': '{"v":5}' })
    commit(repo, { 'docs/architecture/a.md': '# a' })
    commit(repo, { 'pdv-importados/app/page.tsx': 'export default 5' })
    assert.equal(runStep(repo, base), IGNORE)
  })

  it('I: produção sem base do último deploy → executa (nunca ignora por dúvida)', () => {
    const { repo } = newRepo()
    commit(repo, { 'backend/package.json': '{"v":6}' })
    assert.equal(runStep(repo, undefined), BUILD)
    assert.equal(runStep(repo, undefined, path.join(repo, 'site'), null), BUILD)
  })

  it('I2: Preview, primeiro push de branch só do ERP (clone raso) → ignora', () => {
    const clone = shallowBranch([{ 'pdv-importados/app/page.tsx': 'export default 7' }, { 'docs/x.md': '# x' }], 10)
    assert.equal(preview(clone), IGNORE)
  })

  it('I3: Preview, primeiro push com mudança no site em commit intermediário → executa', () => {
    const clone = shallowBranch([{ 'site/app/page.tsx': 'export default 8' }, { 'backend/package.json': '{"v":8}' }], 10)
    assert.equal(preview(clone), BUILD)
  })

  it('I4: Preview, lockfile da raiz mudou na branch → executa', () => {
    const clone = shallowBranch([{ 'package-lock.json': '{"v":9}' }, { 'docs/y.md': '# y' }], 10)
    assert.equal(preview(clone), BUILD)
  })

  it('I5: Preview sem base em clone NÃO raso → executa (nunca ignora por dúvida)', () => {
    const { repo } = newRepo()
    commit(repo, { 'backend/package.json': '{"v":10}' })
    assert.equal(runStep(repo, undefined, path.join(repo, 'site'), 'preview'), BUILD)
  })

  it('I5b: Preview em clone raso de um único commit → executa', () => {
    const clone = shallowBranch([{ 'pdv-importados/app/page.tsx': 'export default 12' }], 1)
    assert.equal(preview(clone), BUILD)
  })

  it('I5c: limite documentado — branch mais longa que o clone: só o que está dentro da janela conta', () => {
    const clone = shallowBranch([
      { 'site/app/page.tsx': 'export default 13' },
      { 'pdv-importados/a.ts': '1' },
      { 'pdv-importados/b.ts': '2' },
      { 'pdv-importados/c.ts': '3' },
    ], 3)
    assert.equal(preview(clone), IGNORE)
  })

  it('I6: Preview com base do último deploy usa a base (não a main)', () => {
    const { repo, base } = newRepo()
    commit(repo, { 'site/app/page.tsx': 'export default 11' })
    assert.equal(runStep(repo, base, path.join(repo, 'site'), 'preview'), BUILD)
  })

  it('J: base inexistente (histórico reescrito/clone raso) → executa', () => {
    const { repo } = newRepo()
    assert.equal(runStep(repo, '0123456789abcdef0123456789abcdef01234567'), BUILD)
  })

  it('K: fora de um repositório git (erro do git) → executa', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'))
    dirs.push(outside)
    write(outside, { 'package.json': '{"name":"jinlong-site"}' })
    assert.equal(runStep(outside, 'abc', outside), BUILD)
  })

  it('M: site/ só com o esqueleto (sem package.json) → ignora, mesmo sem base e com base de outra branch', () => {
    const { repo, base } = newRepo()
    fs.rmSync(path.join(repo, 'site', 'package.json'))
    git(repo, 'add', '-A')
    git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'esqueleto')
    assert.equal(runStep(repo, undefined), IGNORE)
    assert.equal(runStep(repo, '0123456789abcdef0123456789abcdef01234567'), IGNORE)
    assert.equal(runStep(repo, base), IGNORE)
  })

  it('L: base igual ao HEAD (redeploy do mesmo commit) → ignora', () => {
    const { repo, base } = newRepo()
    assert.equal(runStep(repo, base), IGNORE)
  })
})
