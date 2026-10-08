import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  assertForbiddenFileMarked,
  assertNotInAutomatedApplyList,
  loadForbiddenRegistry,
  runAssertForbiddenMigrations,
} from './assert-forbidden-migrations.mjs'

const REGISTRY = `{
  "version": 1,
  "entries": [{
    "version": "20261006120000",
    "file": "20261006120000_financeiro_contas_formas_e_painel.sql",
    "reason": "obsoleta",
    "decisionDoc": "docs/x.md",
    "supersededBy": "20261006180000"
  }]
}`

test('loadForbiddenRegistry valida schema', () => {
  const entries = loadForbiddenRegistry(REGISTRY)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].version, '20261006120000')
  assert.throws(() => loadForbiddenRegistry('{}'), /entries/)
  assert.throws(
    () =>
      loadForbiddenRegistry(
        JSON.stringify({
          entries: [{ version: '1', file: '1.sql', reason: 'r', decisionDoc: 'd' }],
        }),
      ),
    /14 dígitos/,
  )
})

test('assertNotInAutomatedApplyList bloqueia versão proibida', () => {
  const entries = loadForbiddenRegistry(REGISTRY)
  assert.throws(
    () => assertNotInAutomatedApplyList(['20261006120000', '20261006180000'], entries),
    /apply automatizado bloqueado/,
  )
  assert.equal(
    assertNotInAutomatedApplyList(['20261006180000', '20261007163200'], entries),
    true,
  )
})

test('arquivo sem cabeçalho FORBIDDEN_APPLY falha', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forbid-mig-'))
  const file = '20261006120000_financeiro_contas_formas_e_painel.sql'
  fs.writeFileSync(path.join(dir, file), 'BEGIN;\nCOMMIT;\n')
  const entry = loadForbiddenRegistry(REGISTRY)[0]
  assert.throws(() => assertForbiddenFileMarked(dir, entry), /FORBIDDEN_APPLY/)
  fs.writeFileSync(
    path.join(dir, file),
    '-- FORBIDDEN_APPLY: superseded by 20261006180000\nBEGIN;\nCOMMIT;\n',
  )
  assert.equal(assertForbiddenFileMarked(dir, entry), true)
})

test('runAssertForbiddenMigrations PASS no registry real do repo', () => {
  const result = runAssertForbiddenMigrations()
  assert.equal(result.ok, true)
  assert.ok(result.versions.includes('20261006120000'))
})
