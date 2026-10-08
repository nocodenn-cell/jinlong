import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  assertForbiddenFileMarked,
  assertNotInApplyDirectory,
  assertNotInAutomatedApplyList,
  loadForbiddenRegistry,
  runAssertForbiddenMigrations,
} from './assert-forbidden-migrations.mjs'

const REGISTRY = `{
  "version": 1,
  "quarantineDir": "migrations-forbidden",
  "entries": [{
    "version": "20261006120000",
    "file": "20261006120000_financeiro_contas_formas_e_painel.sql",
    "reason": "obsoleta",
    "decisionDoc": "docs/x.md",
    "supersededBy": "20261006180000"
  }]
}`

test('loadForbiddenRegistry valida schema e quarantineDir', () => {
  const { entries, quarantineDir } = loadForbiddenRegistry(REGISTRY)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].version, '20261006120000')
  assert.equal(quarantineDir, 'migrations-forbidden')
  assert.throws(() => loadForbiddenRegistry('{}'), /entries/)
  assert.throws(
    () =>
      loadForbiddenRegistry(
        JSON.stringify({
          quarantineDir: 'migrations',
          entries: [
            {
              version: '20261006120000',
              file: '20261006120000_x.sql',
              reason: 'r',
              decisionDoc: 'd',
            },
          ],
        }),
      ),
    /não pode ser migrations/,
  )
})

test('assertNotInAutomatedApplyList bloqueia versão proibida', () => {
  const { entries } = loadForbiddenRegistry(REGISTRY)
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
  const { entries } = loadForbiddenRegistry(REGISTRY)
  assert.throws(() => assertForbiddenFileMarked(dir, entries[0]), /FORBIDDEN_APPLY/)
  fs.writeFileSync(
    path.join(dir, file),
    '-- FORBIDDEN_APPLY: superseded by 20261006180000\nBEGIN;\nCOMMIT;\n',
  )
  assert.equal(assertForbiddenFileMarked(dir, entries[0]), true)
})

test('SQL proibido em migrations/ (apply path) falha', () => {
  const applyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-mig-'))
  const { entries } = loadForbiddenRegistry(REGISTRY)
  fs.writeFileSync(
    path.join(applyDir, '20261006120000_financeiro_contas_formas_e_painel.sql'),
    '-- FORBIDDEN_APPLY\n',
  )
  assert.throws(() => assertNotInApplyDirectory(applyDir, entries), /ainda em supabase\/migrations/)
  fs.unlinkSync(path.join(applyDir, '20261006120000_financeiro_contas_formas_e_painel.sql'))
  assert.equal(assertNotInApplyDirectory(applyDir, entries), true)
})

test('runAssertForbiddenMigrations PASS no registry real do repo', () => {
  const result = runAssertForbiddenMigrations()
  assert.equal(result.ok, true)
  assert.ok(result.versions.includes('20261006120000'))
  assert.equal(result.quarantineDir, 'migrations-forbidden')
})
