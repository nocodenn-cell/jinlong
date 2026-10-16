/**
 * Testa o Ignored Build Step do `pdv-importados` (pdv-importados/scripts/vercel-ignore.sh) contra
 * repositórios git temporários. Contrato da Vercel: exit 0 = ignorar o build, exit 1 = executar.
 *
 *   node --test scripts/vercel-pdv-ignore.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'pdv-importados', 'scripts', 'vercel-ignore.sh')
const BASE_FILES = {
  'pdv-importados/package.json': '{"name":"pdv-importados"}',
  'pdv-importados/app/page.tsx': 'export default null',
  'pdv-importados/vercel.json': '{}',
  'site/package.json': '{"name":"jinlong-site"}',
  'site/app/page.tsx': 'export default null',
  'shared-core/src/index.ts': '',
  'shared/logger.ts': '',
  'pdv-local/src/main.ts': '',
  'backend/supabase/migrations/001.sql': 'select 1;',
  'docs/infra/README.md': '# docs',
  '.github/workflows/ci.yml': 'on: push',
  'README.md': '# repo',
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

function commit(repo, files, message = 'commit') {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(repo, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  git(repo, 'add', '-A')
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message)
  return git(repo, 'rev-parse', 'HEAD')
}

function newRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-ignore-step-'))
  dirs.push(repo)
  git(repo, 'init', '-q')
  return { repo, base: commit(repo, BASE_FILES, 'base') }
}

/** Executa como a Vercel: cwd = Root Directory (pdv-importados/). `vercelEnv: null` = variável ausente. */
function runStep(repo, { previous, vercelEnv = 'production', cwd = path.join(repo, 'pdv-importados') } = {}) {
  const env = { ...process.env }
  delete env.VERCEL_GIT_PREVIOUS_SHA
  delete env.VERCEL_ENV
  if (previous !== undefined) env.VERCEL_GIT_PREVIOUS_SHA = previous
  if (vercelEnv !== null) env.VERCEL_ENV = vercelEnv
  return spawnSync('sh', [SCRIPT], { cwd, env, encoding: 'utf8' }).status
}

function production(files) {
  const { repo, base } = newRepo()
  commit(repo, files)
  return runStep(repo, { previous: base })
}

after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
})

describe('Ignored Build Step do pdv-importados', () => {
  it('o script versionado usa fim de linha LF (CRLF quebra o sh no Linux da Vercel)', () => {
    assert.equal(fs.readFileSync(SCRIPT, 'utf8').includes('\r'), false)
  })

  it('vercel.json do ERP aponta para o script', () => {
    const config = JSON.parse(fs.readFileSync(path.join(path.dirname(SCRIPT), '..', 'vercel.json'), 'utf8'))
    assert.equal(config.ignoreCommand, 'sh scripts/vercel-ignore.sh')
  })

  it('Preview e development continuam sempre ignorados (mesma política do painel)', () => {
    const { repo, base } = newRepo()
    commit(repo, { 'pdv-importados/app/page.tsx': 'export default 1' })
    assert.equal(runStep(repo, { previous: base, vercelEnv: 'preview' }), IGNORE)
    assert.equal(runStep(repo, { vercelEnv: 'preview' }), IGNORE)
    assert.equal(runStep(repo, { vercelEnv: 'development' }), IGNORE)
    assert.equal(runStep(repo, { vercelEnv: null }), IGNORE)
  })

  it('produção: mudança no ERP → executa', () => {
    assert.equal(production({ 'pdv-importados/app/page.tsx': 'export default 2' }), BUILD)
  })

  it('produção: código e dependências compartilhadas → executa', () => {
    assert.equal(production({ 'shared-core/src/index.ts': 'export const x = 1' }), BUILD)
    assert.equal(production({ 'shared/logger.ts': 'export {}' }), BUILD)
    assert.equal(production({ 'package-lock.json': '{"changed":true}' }), BUILD)
    assert.equal(production({ 'package.json': '{"name":"root","v":2}' }), BUILD)
    assert.equal(production({ 'pdv-importados/vercel.json': '{"regions":["gru1"]}' }), BUILD)
  })

  it('produção: backend/, pdv-local/ e vercel.json da raiz → executa (não estão na lista de exclusão)', () => {
    assert.equal(production({ 'backend/supabase/migrations/002.sql': 'select 2;' }), BUILD)
    assert.equal(production({ 'pdv-local/src/main.ts': 'export {}' }), BUILD)
    assert.equal(production({ 'vercel.json': '{"framework":"nextjs"}' }), BUILD)
  })

  it('produção: diretório novo, desconhecido → executa', () => {
    assert.equal(production({ 'novo-pacote/index.ts': 'export {}' }), BUILD)
  })

  it('produção: só site/ → ignora', () => {
    assert.equal(production({ 'site/app/page.tsx': 'export default 3' }), IGNORE)
  })

  it('produção: só docs/, .github/ e *.md da raiz → ignora', () => {
    assert.equal(production({ 'docs/infra/NOVO.md': '# novo' }), IGNORE)
    assert.equal(production({ '.github/workflows/ci.yml': 'on: pull_request' }), IGNORE)
    assert.equal(production({ 'README.md': '# repo v2', 'CHANGELOG.md': '# c' }), IGNORE)
  })

  it('produção: *.md fora da raiz e fora de docs/ → executa', () => {
    assert.equal(production({ 'pdv-importados/README.md': '# erp' }), BUILD)
  })

  it('produção: vários commits, o relevante no meio não pode ser perdido', () => {
    const { repo, base } = newRepo()
    commit(repo, { 'pdv-importados/app/page.tsx': 'export default 4' })
    commit(repo, { 'docs/a.md': '# a' })
    assert.equal(runStep(repo, { previous: base }), BUILD)
  })

  it('produção: commit misto (site + ERP) → executa', () => {
    assert.equal(production({ 'site/app/page.tsx': 'export default 5', 'pdv-importados/app/page.tsx': 'export default 5' }), BUILD)
  })

  it('produção sem base, base inexistente ou fora do git → executa', () => {
    const { repo } = newRepo()
    assert.equal(runStep(repo, {}), BUILD)
    assert.equal(runStep(repo, { previous: '0123456789abcdef0123456789abcdef01234567' }), BUILD)
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'))
    dirs.push(outside)
    assert.equal(runStep(outside, { previous: 'abc', cwd: outside }), BUILD)
  })

  it('produção: arquivo do ERP movido para docs/ → executa (rename não esconde a origem)', () => {
    const { repo, base } = newRepo()
    git(repo, 'mv', 'pdv-importados/app/page.tsx', 'docs/page.tsx')
    git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'move')
    assert.equal(runStep(repo, { previous: base }), BUILD)
  })

  it('produção: base fora do clone raso, mas buscável no remoto → busca e ignora', () => {
    const { repo, base } = newRepo()
    for (let i = 0; i < 12; i++) commit(repo, { [`docs/n${i}.md`]: `# ${i}` })
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-clone-'))
    dirs.push(clone)
    git(repo, 'config', 'uploadpack.allowAnySHA1InWant', 'true')
    git(clone, 'clone', '-q', '--depth', '10', 'file://' + repo.split(path.sep).join('/'), '.')
    assert.equal(runStep(clone, { previous: base }), IGNORE)
  })

  it('produção: redeploy do mesmo commit → ignora', () => {
    const { repo, base } = newRepo()
    assert.equal(runStep(repo, { previous: base }), IGNORE)
  })
})
