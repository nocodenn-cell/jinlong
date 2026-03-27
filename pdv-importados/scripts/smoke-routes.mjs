#!/usr/bin/env node
/**
 * Smoke HTTP: exige `npm run dev` (ou servidor em SMOKE_BASE_URL).
 * Uso: node scripts/smoke-routes.mjs
 *   ou SMOKE_BASE_URL=http://localhost:3009 node scripts/smoke-routes.mjs
 */

const base = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')

const cases = [
  { path: '/', expectRedirect: true, name: 'raiz -> login' },
  { path: '/login', ok: [200], name: 'login' },
  { path: '/gerente/produtos', expectRedirect: true, name: 'gerente sem auth' },
  { path: '/gerente/estoque', expectRedirect: true, name: 'estoque gerente sem auth' },
  { path: '/caixa', expectRedirect: true, name: 'caixa sem auth' },
]

let failed = 0

for (const c of cases) {
  const url = `${base}${c.path}`
  let res
  try {
    res = await fetch(url, { redirect: 'manual' })
  } catch (e) {
    console.error(`FAIL ${c.name}: ${e.message}`)
    failed++
    continue
  }

  const code = res.status
  let ok = false
  if (c.expectRedirect) {
    ok = code === 307 || code === 302 || code === 303 || code === 308
  } else if (c.ok) {
    ok = c.ok.includes(code)
  }

  if (!ok) {
    console.error(`FAIL ${c.name}: ${url} -> HTTP ${code} (esperado redirect ${c.expectRedirect ? '302/307' : c.ok})`)
    failed++
  } else {
    console.log(`OK   ${c.name}: HTTP ${code}`)
  }
}

if (failed) {
  console.error(`\n${failed} falha(s). Suba o servidor: npm run dev`)
  process.exit(1)
}
console.log('\nSmoke HTTP OK.')
