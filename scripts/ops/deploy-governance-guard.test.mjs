import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { evaluate, parseNameStatus, APPROVAL_LABEL, MANIFEST } from './deploy-governance-guard.mjs';

const deferred = [{ version: '20261010120000', file: 'backend/supabase/migrations/20261010120000_caixa_sem_loja_padrao.sql' }];
const exists = () => true;
const run = (diff, labels = [], fileExists = exists) => evaluate({ changes: parseNameStatus(diff), labels, deferred, fileExists });

test('PR só de frontend/docs passa sem label', () => {
  assert.deepEqual(run('M\tpdv-importados/app/page.tsx\nA\tdocs/x.md').errors, []);
});
test('nova migration sem label falha', () => {
  assert.equal(run('A\tbackend/supabase/migrations/20261101000000_x.sql').errors.length, 1);
});
test('nova migration com label passa', () => {
  assert.deepEqual(run('A\tbackend/supabase/migrations/20261101000000_x.sql', [APPROVAL_LABEL]).errors, []);
});
test('edge function sem label falha', () => {
  assert.equal(run('M\tbackend/supabase/functions/sync-outbox/index.ts').errors.length, 1);
});
test('_shared das edges sem label falha', () => {
  assert.equal(run('M\tbackend/supabase/functions/_shared/x.ts').errors.length, 1);
});
test('config.toml sem label falha', () => {
  assert.equal(run('M\tbackend/supabase/config.toml').errors.length, 1);
});
test('manifesto alterado sem label falha', () => {
  assert.equal(run(`M\t${MANIFEST}`).errors.length, 1);
});
test('migration adiada removida falha mesmo com label', () => {
  assert.ok(run(`D\t${deferred[0].file}`, [APPROVAL_LABEL]).errors.some((e) => e.includes('adiada')));
});
test('migration adiada renomeada falha mesmo com label', () => {
  assert.ok(run(`R100\t${deferred[0].file}\tbackend/supabase/migrations_adiadas/x.sql`, [APPROVAL_LABEL]).errors.some((e) => e.includes('adiada')));
});
test('migration adiada editada falha mesmo com label', () => {
  assert.ok(run(`M\t${deferred[0].file}`, [APPROVAL_LABEL]).errors.some((e) => e.includes('adiada')));
});
test('migration adiada ausente do tree falha', () => {
  assert.ok(run('', [], () => false).errors.some((e) => e.includes('ausente')));
});
test('manifesto real: todas as migrations adiadas existem no repo', () => {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.ok(m.deferred.length >= 1);
  for (const d of m.deferred) {
    assert.ok(existsSync(d.file), d.file);
    assert.ok(d.file.includes(d.version));
  }
});
test('criação inicial do manifesto passa sem label', () => {
  assert.deepEqual(run(`A\t${MANIFEST}`).errors, []);
});
test('manifesto removido sem label falha', () => {
  assert.equal(run(`D\t${MANIFEST}`).errors.length, 1);
});
