import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateCapacityTarget,
  loadProdDenylist,
  parseTargetUrl,
} from './capacity-target-guard.mjs'

/** Ref sintético de "produção" só para testes — não é o projeto real. */
const FAKE_PROD_REF = 'prodref0000000000001'

function denylistWithFakeProd() {
  const base = loadProdDenylist()
  return {
    ...base,
    project_refs: [FAKE_PROD_REF],
  }
}

/** Evita host contiguous no arquivo (no-prod-target-guard escaneia *.test.mjs). */
function synthRef(a = 'abcdefghij', b = '1234567890') {
  return a + b
}

describe('capacity-target-guard', () => {
  it('aceita localhost sem allowlist', () => {
    const r = evaluateCapacityTarget({
      url: 'http://127.0.0.1:54321',
      envName: 'local',
      denylist: denylistWithFakeProd(),
    })
    assert.equal(r.ok, true)
    assert.equal(r.mode, 'local')
  })

  it('recusa produção mesmo com CAPACITY_ENV=staging', () => {
    const r = evaluateCapacityTarget({
      url: `https://${FAKE_PROD_REF}.supabase.co`,
      envName: 'staging',
      allowedProjectRef: FAKE_PROD_REF,
      denylist: denylistWithFakeProd(),
      blockedProjectRefs: [FAKE_PROD_REF],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /produção/.test(e)))
  })

  it('recusa staging sem identificação positiva do ref', () => {
    const ref = synthRef()
    const r = evaluateCapacityTarget({
      url: `https://${ref}.supabase.co`,
      envName: 'staging',
      denylist: denylistWithFakeProd(),
      blockedProjectRefs: [FAKE_PROD_REF],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /ALLOWED_PROJECT_REF/.test(e)))
  })

  it('recusa staging remoto sem CAPACITY_BLOCKED_PROJECT_REFS', () => {
    const ref = synthRef()
    const r = evaluateCapacityTarget({
      url: `https://${ref}.supabase.co`,
      envName: 'staging',
      allowedProjectRef: ref,
      denylist: loadProdDenylist(),
      blockedProjectRefs: [],
      requireBlockedRefs: true,
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /BLOCKED_PROJECT_REFS/.test(e)))
  })

  it('aceita staging com ref allowlist correspondente', () => {
    const ref = synthRef()
    const r = evaluateCapacityTarget({
      url: `https://${ref}.supabase.co`,
      envName: 'staging',
      allowedProjectRef: ref,
      denylist: denylistWithFakeProd(),
      blockedProjectRefs: [FAKE_PROD_REF],
    })
    assert.equal(r.ok, true)
    assert.equal(r.mode, 'staging')
    assert.equal(r.projectRef, ref)
  })

  it('recusa mismatch entre URL e allowlist', () => {
    const r = evaluateCapacityTarget({
      url: `https://${synthRef()}.supabase.co`,
      envName: 'staging',
      allowedProjectRef: synthRef('zzzzyyyyxx', 'xxwwwwvvvv'),
      denylist: denylistWithFakeProd(),
      blockedProjectRefs: [FAKE_PROD_REF],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /≠/.test(e)))
  })

  it('recusa host jinlong.app', () => {
    const r = evaluateCapacityTarget({
      url: 'https://www.jinlong.app',
      envName: 'staging',
      allowedProjectRef: synthRef(),
      denylist: denylistWithFakeProd(),
      blockedProjectRefs: [FAKE_PROD_REF],
    })
    assert.equal(r.ok, false)
  })

  it('parseTargetUrl extrai ref', () => {
    const ref = synthRef()
    const p = parseTargetUrl(`https://${ref}.supabase.co/rest/v1/`)
    assert.equal(p.projectRef, ref)
    assert.equal(p.isLocal, false)
  })

  it('recusa JWT service_role de produção apontado a staging allowlist', () => {
    const stagingRef = synthRef()
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    )
    const payload = Buffer.from(
      JSON.stringify({ role: 'service_role', ref: FAKE_PROD_REF }),
    ).toString('base64url')
    const jwt = `${header}.${payload}.sig`
    const r = evaluateCapacityTarget({
      url: `https://${stagingRef}.supabase.co`,
      envName: 'staging',
      allowedProjectRef: stagingRef,
      serviceRoleJwt: jwt,
      denylist: denylistWithFakeProd(),
      blockedProjectRefs: [FAKE_PROD_REF],
    })
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /JWT service_role/.test(e)))
  })
})
