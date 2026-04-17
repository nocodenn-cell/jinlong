#!/usr/bin/env node
/**
 * Testa CORS da Edge Function `validar-gerente` (POST direto via fetch, sem browser).
 *
 * Pré-requisitos:
 * - Function deployada; `SUPABASE_URL` (ou `VALIDAR_GERENTE_URL`) apontando ao projeto.
 * - Para o cenário "evil → 403": `VALIDAR_GERENTE_CORS_STRICT` + `VALIDAR_GERENTE_ALLOWED_ORIGINS`
 *   no Supabase **sem** incluir https://evil.com, mas **com** a origem usada em TEST_CORS_ALLOWED_ORIGIN.
 *
 * Uso (na pasta pdv-importados):
 *   node scripts/test-cors-validar-gerente.mjs
 *
 * Variáveis opcionais:
 *   TEST_CORS_ALLOWED_ORIGIN  (default: http://localhost:3000)
 *   VALIDAR_GERENTE_URL       (default: ${SUPABASE_URL}/functions/v1/validar-gerente)
 */

const supabaseRaw = process.env.SUPABASE_URL?.trim()
const fnUrl =
  process.env.VALIDAR_GERENTE_URL?.trim() ||
  (supabaseRaw
    ? `${supabaseRaw.replace(/\/+$/, '')}/functions/v1/validar-gerente`
    : null)

const allowedOrigin =
  process.env.TEST_CORS_ALLOWED_ORIGIN?.trim() || 'http://localhost:3000'
const EVIL_ORIGIN = 'https://evil.com'

if (!fnUrl) {
  console.error(
    '❌ Defina SUPABASE_URL ou VALIDAR_GERENTE_URL (URL completa da function).',
  )
  process.exit(1)
}

/**
 * @param {string} label
 * @param {Record<string, string>} extraHeaders
 * @param {{ expect403?: boolean }} opts
 */
async function runCase(label, extraHeaders, opts = {}) {
  const expect403 = opts.expect403 === true
  let status
  try {
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({ senha: 'test-cors-placeholder' }),
    })
    status = res.status
  } catch (e) {
    console.log(`❌ ${label} → erro de rede: ${e.message}`)
    return false
  }

  const ok = expect403 ? status === 403 : status !== 403
  const expectation = expect403 ? '403' : '≠403 (ex.: 401 sem JWT)'
  console.log(
    `${ok ? '✅' : '❌'} ${label} → HTTP ${status} (esperado: ${expectation})`,
  )
  return ok
}

const results = []

console.log('Function URL:', fnUrl)
console.log('Origem “permitida” no teste:', allowedOrigin)
console.log('---')

results.push(
  await runCase('Origin permitida (lista da Edge deve incluir esta URL)', {
    Origin: allowedOrigin,
  }),
)

results.push(
  await runCase('Origin não permitida (https://evil.com)', {
    Origin: EVIL_ORIGIN,
  }, { expect403: true }),
)

results.push(await runCase('Sem header Origin', {}))

const allOk = results.every(Boolean)
console.log('---')
if (allOk) {
  console.log('✅ Todos os testes passaram.')
} else {
  console.log('❌ Algum teste falhou.')
  if (!results[1]) {
    console.log(
      '   Dica: evil→403 só ocorre com CORS estrito + allowlist que não inclua https://evil.com.',
    )
  }
  if (!results[0]) {
    console.log(
      `   Dica: inclua "${allowedOrigin}" em VALIDAR_GERENTE_ALLOWED_ORIGINS ou use TEST_CORS_ALLOWED_ORIGIN.`,
    )
  }
}

process.exit(allOk ? 0 : 1)
