import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarAlvoDrift, REF_HOMOLOG, REF_PRODUCAO } from './drift-target-guard.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const workflowPath = fileURLToPath(new URL('../../.github/workflows/ci-backend-supabase.yml', import.meta.url));

test('homologação é permitida', () => {
  assert.deepEqual(validarAlvoDrift(REF_HOMOLOG), { ok: true, motivo: 'HOMOLOGACAO' });
});

test('produção é bloqueada', () => {
  assert.equal(validarAlvoDrift(REF_PRODUCAO).ok, false);
  assert.equal(validarAlvoDrift(REF_PRODUCAO).motivo, 'REF_PRODUCAO_BLOQUEADO');
});

test('referência vazia, ausente ou só espaços é bloqueada', () => {
  for (const v of ['', undefined, null, '   ']) {
    assert.equal(validarAlvoDrift(v).ok, false, `aceitou ${JSON.stringify(v)}`);
  }
});

test('referência desconhecida é bloqueada', () => {
  assert.equal(validarAlvoDrift('abcdefghijklmnopqrst').motivo, 'REF_NAO_HOMOLOGACAO');
});

test('comparação exata: espaço, maiúscula ou quebra de linha no homolog são recusados', () => {
  for (const v of [` ${REF_HOMOLOG}`, `${REF_HOMOLOG} `, `${REF_HOMOLOG}\n`, REF_HOMOLOG.toUpperCase()]) {
    assert.equal(validarAlvoDrift(v).ok, false, `aceitou ${JSON.stringify(v)}`);
  }
});

test('prefixo do homolog não basta', () => {
  assert.equal(validarAlvoDrift(REF_HOMOLOG.slice(0, 10)).ok, false);
});

test('CLI: homologação sai com 0; produção sai com 1 sem vazar o ref', () => {
  const script = `${here}drift-target-guard.mjs`;
  const ok = execFileSync(process.execPath, [script], {
    env: { ...process.env, SUPABASE_MIGRATION_CHECK_PROJECT_REF: REF_HOMOLOG },
    encoding: 'utf8',
  });
  assert.match(ok, /alvo aceito/);

  let saida = '';
  let codigo = 0;
  try {
    execFileSync(process.execPath, [script], {
      env: { ...process.env, SUPABASE_MIGRATION_CHECK_PROJECT_REF: REF_PRODUCAO },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    codigo = e.status;
    saida = `${e.stdout}${e.stderr}`;
  }
  assert.equal(codigo, 1);
  assert.match(saida, /RECUSADO \(REF_PRODUCAO_BLOQUEADO\)/);
  assert.equal(saida.includes(REF_PRODUCAO), false, 'o ref não pode aparecer no log');
});

test('workflow: a guarda roda no job drift ANTES do supabase link', () => {
  const yml = readFileSync(workflowPath, 'utf8');
  const jobStart = yml.indexOf('  migration-remote-drift:');
  const jobEnd = yml.indexOf('\n  anti-replay-diagnostic-gate:', jobStart);
  assert.ok(jobStart > 0 && jobEnd > jobStart, 'job migration-remote-drift não encontrado');
  const job = yml.slice(jobStart, jobEnd);
  const guarda = job.indexOf('node scripts/ops/drift-target-guard.mjs');
  const link = job.indexOf('npx supabase link');
  const consulta = job.indexOf('node scripts/p0-migration-status.mjs');
  assert.ok(guarda > 0, 'etapa da guarda ausente no job');
  assert.ok(guarda < link, 'guarda precisa vir antes do link');
  assert.ok(link < consulta, 'ordem link → consulta preservada');
});
