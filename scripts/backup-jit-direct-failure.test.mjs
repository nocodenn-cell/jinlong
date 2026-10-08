import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyDirectProbe,
  countFamily,
  formatDirectFailure,
  redactSecrets,
  suppressIfLeaked,
} from './backup-jit-direct-failure.mjs'
import {
  evaluateBackupJitProbe,
  missingPathMarkers,
} from './assert-backup-jit-direct-probe.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HELPER = path.join(ROOT, 'scripts/backup-jit-direct-failure.mjs')
const GUARD = path.join(ROOT, 'scripts/assert-backup-jit-direct-probe.mjs')
const NASTY = 'sbp_#.*+?[^]$(){}|\\'

test('redige valor com # e metacaracteres sem interpretar regex', () => {
  const encoded = 'sbp_%23.%2A%2B%3F'
  const raw = `FATAL ${NASTY} uri ${encoded} fim`
  const out = redactSecrets(raw, [NASTY, encoded, '', 'curto', 'x'])
  assert.equal(out, 'FATAL *** uri *** fim')
  assert.equal(out.includes(NASTY), false)
  assert.equal(out.includes('#'), false)
})

test('segredo curto ou vazio nao apaga o texto', () => {
  const raw = 'timeout expired no host'
  assert.equal(redactSecrets(raw, ['', 'abc', null]), raw)
})

test('suppressIfLeaked esconde stderr se a redacao falhar', () => {
  const secret = 'sbp_ainda_presente'
  assert.equal(suppressIfLeaked(`erro ${secret}`, [secret]), '[stderr suprimido: redacao incompleta]')
})

test('autenticacao vence ausencia de rota IPv6', () => {
  const got = classifyDirectProbe({
    stderr: 'FATAL: PAM authentication failed for user "postgres"',
    aCount: 0,
    aaaaCount: 1,
    ipv6DefaultRoute: false,
  })
  assert.equal(got.motivo, 'autenticacao')
})

test('AAAA sem rota IPv6 classifica sem_rota_ipv6 mesmo com timeout no stderr', () => {
  const got = classifyDirectProbe({
    stderr: 'connection to server failed: timeout expired',
    aCount: 0,
    aaaaCount: 1,
    ipv6DefaultRoute: false,
  })
  assert.equal(got.motivo, 'sem_rota_ipv6')
})

test('network unreachable com AAAA e rota ainda e sem_rota_ipv6', () => {
  const got = classifyDirectProbe({
    stderr: 'Network is unreachable',
    aCount: 0,
    aaaaCount: 2,
    ipv6DefaultRoute: true,
  })
  assert.equal(got.motivo, 'sem_rota_ipv6')
})

test('sem AAAA distingue registro A ausente e presente', () => {
  const none = classifyDirectProbe({ stderr: 'Name or service not known', aCount: 0, aaaaCount: 0, ipv6DefaultRoute: false })
  const withA = classifyDirectProbe({ stderr: 'connection refused', aCount: 1, aaaaCount: 0, ipv6DefaultRoute: true })
  assert.equal(none.motivo, 'sem_aaaa')
  assert.match(none.detalhe, /sem A/)
  assert.equal(withA.motivo, 'sem_aaaa')
  assert.match(withA.detalhe, /existe registro A/)
})

test('timeout so quando ha AAAA e rota IPv6', () => {
  const got = classifyDirectProbe({
    stderr: 'connection timed out',
    aCount: 0,
    aaaaCount: 1,
    ipv6DefaultRoute: true,
  })
  assert.equal(got.motivo, 'timeout')
})

test('outro quando o stderr nao casa com as classes conhecidas', () => {
  const got = classifyDirectProbe({
    stderr: 'server closed the connection unexpectedly',
    aCount: 0,
    aaaaCount: 1,
    ipv6DefaultRoute: true,
  })
  assert.equal(got.motivo, 'outro')
})

test('formatDirectFailure nao inclui o segredo e fixa o contrato do log', () => {
  const line = formatDirectFailure({
    stderr: `erro ${NASTY}`,
    aCount: 0,
    aaaaCount: 1,
    ipv6DefaultRoute: false,
  })
  assert.match(line, /^direct: motivo=sem_rota_ipv6 dns_a=0 dns_aaaa=1 rota_ipv6_default=0 /)
  assert.equal(line.includes(NASTY), false)
})

test('countFamily conta enderecos unicos e trata falha de DNS como zero', async () => {
  const lookup = async () => [{ address: '2001:db8::1' }, { address: '2001:db8::1' }, { address: '2001:db8::2' }]
  assert.equal(await countFamily('db.example', 6, lookup), 2)
  assert.equal(await countFamily('db.example', 4, async () => { throw new Error('ENOTFOUND') }), 0)
  assert.equal(await countFamily('', 4, lookup), 0)
})

test('CLI redige stderr com PAT hostil e imprime o motivo', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jit-probe-'))
  const errFile = path.join(dir, 'probe-err.txt')
  const encoded = 'sbp_%23.%2A'
  writeFileSync(errFile, `psql: ${NASTY} and ${encoded}\n`)
  const run = spawnSync(process.execPath, [
    HELPER,
    '--err', errFile,
    '--a-count', '0',
    '--aaaa-count', '1',
    '--ipv6-route', '0',
  ], {
    env: { ...process.env, JIT_PAT: NASTY, JIT_PAT_ENC: encoded },
    encoding: 'utf8',
  })
  const out = `${run.stdout}${run.stderr}`
  assert.equal(run.status, 0)
  assert.match(out, /direct: motivo=sem_rota_ipv6 /)
  assert.equal(out.includes(NASTY), false)
  assert.equal(out.includes(encoded), false)
  assert.match(out, /psql: \*\*\* and \*\*\*/)
})

test('guard rejeita sed com JIT_PAT e aceita o contrato real do repo', () => {
  const bad = evaluateBackupJitProbe('sed -E "s#${JIT_PAT}#***#g"\n', 'sem_aaaa')
  assert.ok(bad.forbidden.includes('sed interpolando JIT_PAT'))
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/backup-scheduled.yml'), 'utf8')
  const helper = readFileSync(HELPER, 'utf8')
  const live = evaluateBackupJitProbe(workflow, helper)
  assert.deepEqual(live.missing, [])
  assert.deepEqual(live.forbidden, [])
  assert.ok(live.calls >= 2)
})

test('filtros de CI e fallback citam workflow de backup e scripts do guard', () => {
  const ci = readFileSync(path.join(ROOT, '.github/workflows/ci-pdv-importados.yml'), 'utf8')
  const fallback = readFileSync(path.join(ROOT, '.github/workflows/required-checks-fallback.yml'), 'utf8')
  assert.deepEqual(missingPathMarkers(ci, fallback), [])
  assert.deepEqual(missingPathMarkers('paths: []', fallback).length > 0, true)
})

test('guard:backup-jit passa no repo', () => {
  const run = spawnSync(process.execPath, [GUARD], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /PASS/)
})
