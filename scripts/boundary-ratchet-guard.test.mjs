/**
 * Teste do boundary-ratchet-guard (Sprint 1 / 0.3) — `node --test`.
 * Roda o guard real contra uma árvore fixture (BOUNDARY_RATCHET_ROOT), nunca contra o repo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'boundary-ratchet-guard.mjs')

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'))
  const w = (rel, text) => {
    const f = path.join(root, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, text)
  }
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  w('pdv-importados/lib/ok.ts', "export const a = 1\n")
  w('pdv-importados/lib/legacy.ts', "import { x } from '@/app/caixa/actions'\nexport const y = x\n")
  w('pdv-importados/app/admin/leitura.ts', "export const q = (s: any) => s.from('produtos').select()\n")
  w('pdv-importados/core/status.ts', "export type StatusPublicacao = 'A' | 'B'\n")
  return { root, w }
}

function run(root, ...args) {
  const r = spawnSync(process.execPath, [GUARD, ...args], {
    env: { ...process.env, BOUNDARY_RATCHET_ROOT: root },
    encoding: 'utf8',
  })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

test('sem baseline: falha e pede --update', () => {
  const { root } = fixture()
  const r = run(root)
  assert.equal(r.code, 1)
  assert.match(r.out, /baseline ausente/)
})

test('baseline gravada e estado igual: passa', () => {
  const { root } = fixture()
  assert.equal(run(root, '--update').code, 0)
  const r = run(root)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /boundary-ratchet: OK/)
})

test('novo import lib→app falha', () => {
  const { root, w } = fixture()
  run(root, '--update')
  w('pdv-importados/lib/novo.ts', "import x from '@/app/gerente/actions'\n")
  const r = run(root)
  assert.equal(r.code, 1)
  assert.match(r.out, /\[lib-to-app\] pdv-importados\/lib\/novo\.ts: 0 → 1/)
})

test('novo .from() direto e nova declaração duplicada falham', () => {
  const { root, w } = fixture()
  run(root, '--update')
  w('pdv-importados/app/gerente/outra.ts', "export const q = (s: any) => s.from('estoque').select()\n")
  w('pdv-importados/core/status2.ts', "export type StatusPublicacao = 'C'\n")
  const r = run(root)
  assert.equal(r.code, 1)
  assert.match(r.out, /\[direct-from\] pdv-importados\/app\/gerente\/outra\.ts\|estoque: 0 → 1/)
  assert.match(r.out, /\[duplicates\] declaracoes-StatusPublicacao: 1 → 2/)
})

test('melhoria não falha e pede --update para travar o ganho', () => {
  const { root } = fixture()
  run(root, '--update')
  fs.unlinkSync(path.join(root, 'pdv-importados/lib/legacy.ts'))
  const r = run(root)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /melhoria/)
  assert.equal(run(root, '--update').code, 0)
  // após travar, reintroduzir a violação volta a falhar
  fs.writeFileSync(path.join(root, 'pdv-importados/lib/legacy.ts'), "import x from '@/app/a'\n")
  assert.equal(run(root).code, 1)
})

test('--update recusa regressão sem --allow-growth', () => {
  const { root, w } = fixture()
  run(root, '--update')
  w('pdv-importados/lib/novo.ts', "import x from '@/app/a'\n")
  const refused = run(root, '--update')
  assert.equal(refused.code, 1)
  assert.match(refused.out, /recusado/)
  assert.equal(run(root, '--update', '--allow-growth').code, 0)
  assert.equal(run(root).code, 0)
})

test('arquivos de teste não contam como violação', () => {
  const { root, w } = fixture()
  run(root, '--update')
  w('pdv-importados/lib/x.test.ts', "import x from '@/app/a'\nconst q = s.from('produtos')\n")
  assert.equal(run(root).code, 0)
})
