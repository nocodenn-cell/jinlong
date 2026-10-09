#!/usr/bin/env node
/**
 * Smoke de autorização do GO-LIVE (migration 20261009120000) — STACK LOCAL APENAS.
 *
 * Prova, com logins reais e a API real (PostgREST), que:
 *   - GERENTE não consegue autorizar/revogar o GO-LIVE nem forjar quem autorizou;
 *   - GERENTE continua criando o cabeçalho e preenchendo itens;
 *   - DONO autoriza e o banco grava go_autorizado_por = DONO (ignora o valor enviado);
 *   - OPERADOR não vê nem altera.
 *
 * Uso (stack local no ar, com o seed):
 *   SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=... SERVICE_ROLE_KEY=... SEED_PASSWORD=... \
 *     node backend/scripts/implantacao-go-live-authz-smoke.mjs
 *
 * Recusa qualquer URL que não seja local. Não imprime chaves nem senhas.
 */
const API = (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(/\/$/, '')
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SERVICE_ROLE_KEY
const PW = process.env.SEED_PASSWORD

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`RECUSADO: SUPABASE_URL (${API}) não é local. Este smoke escreve dados de teste.`)
  process.exit(2)
}
if (!ANON || !SERVICE || !PW) {
  console.error('Faltam ANON_KEY, SERVICE_ROLE_KEY ou SEED_PASSWORD.')
  process.exit(2)
}

const LOJA = 'a0000001-0000-4000-8000-000000000001'
const DONO_ID = '11111111-1111-4111-8111-111111111111'
const GERENTE_ID = '22222222-2222-4222-8222-222222222222'

async function login(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login falhou: ${email}`)
  return j.access_token
}
const rest = async (token, method, path, body) => {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, json }
}

let falhas = 0
const check = (nome, ok, detalhe = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`)
  if (!ok) falhas += 1
}
const bloqueado = (r) => r.status === 403 || (r.json && r.json.code === '42501')

const tok = {
  gerente: await login('gerente.seed@local.test'),
  dono: await login('dono.seed@local.test'),
  operador: await login('operador.seed@local.test'),
}
const limpar = async () => {
  await rest(SERVICE, 'DELETE', `implantacao_checklist_itens?loja_id=eq.${LOJA}`)
  await rest(SERVICE, 'DELETE', `implantacao_checklists?loja_id=eq.${LOJA}`)
}

try {
  await limpar()

  // --- o que o GERENTE continua podendo
  const cria = await rest(tok.gerente, 'POST', 'implantacao_checklists', { loja_id: LOJA })
  check('GERENTE cria o cabeçalho (sem autorização)', cria.status === 201, `status ${cria.status}`)
  const item = await rest(tok.gerente, 'POST', 'implantacao_checklist_itens', {
    loja_id: LOJA, item_key: 'smoke_item', status: 'CONCLUIDO', responsavel: 'gerente',
  })
  check('GERENTE preenche item do checklist', item.status === 201, `status ${item.status}`)
  const naoGo = await rest(tok.gerente, 'PATCH', `implantacao_checklists?loja_id=eq.${LOJA}`, {
    updated_at: new Date().toISOString(),
  })
  check('GERENTE altera coluna que não é de autorização', naoGo.status === 200 && naoGo.json.length === 1)

  // --- o que o GERENTE NÃO pode mais
  const forja = await rest(tok.gerente, 'PATCH', `implantacao_checklists?loja_id=eq.${LOJA}`, {
    go_autorizado: true, go_autorizado_por: DONO_ID, go_autorizado_em: '2020-01-01T00:00:00Z',
  })
  check('GERENTE NÃO autoriza o GO-LIVE (forja em nome do DONO)', bloqueado(forja), `status ${forja.status} ${forja.json?.message ?? ''}`)
  const obs = await rest(tok.gerente, 'PATCH', `implantacao_checklists?loja_id=eq.${LOJA}`, { go_observacao: 'forjado' })
  check('GERENTE NÃO altera a observação do GO-LIVE', bloqueado(obs), `status ${obs.status}`)
  await rest(SERVICE, 'DELETE', `implantacao_checklists?loja_id=eq.${LOJA}`)
  const insForja = await rest(tok.gerente, 'POST', 'implantacao_checklists', { loja_id: LOJA, go_autorizado: true })
  check('GERENTE NÃO cria cabeçalho já autorizado', bloqueado(insForja), `status ${insForja.status}`)
  await rest(tok.gerente, 'POST', 'implantacao_checklists', { loja_id: LOJA })

  // --- o que o DONO pode, e o banco decide a atribuição
  const autoriza = await rest(tok.dono, 'PATCH', `implantacao_checklists?loja_id=eq.${LOJA}`, {
    go_autorizado: true, go_autorizado_por: GERENTE_ID, go_autorizado_em: '2020-01-01T00:00:00Z', go_observacao: 'smoke',
  })
  const linha = Array.isArray(autoriza.json) ? autoriza.json[0] : null
  check('DONO autoriza o GO-LIVE', autoriza.status === 200 && linha?.go_autorizado === true, `status ${autoriza.status}`)
  check('banco grava go_autorizado_por = DONO (ignora o valor enviado)', linha?.go_autorizado_por === DONO_ID, `por=${linha?.go_autorizado_por}`)
  const recente = linha?.go_autorizado_em && Date.now() - Date.parse(linha.go_autorizado_em) < 60_000
  check('banco grava go_autorizado_em = agora (ignora a data enviada)', Boolean(recente), `em=${linha?.go_autorizado_em}`)

  const revGer = await rest(tok.gerente, 'PATCH', `implantacao_checklists?loja_id=eq.${LOJA}`, {
    go_autorizado: false, go_autorizado_por: null, go_autorizado_em: null,
  })
  check('GERENTE NÃO revoga o GO-LIVE', bloqueado(revGer), `status ${revGer.status}`)
  const revDono = await rest(tok.dono, 'PATCH', `implantacao_checklists?loja_id=eq.${LOJA}`, {
    go_autorizado: false, go_autorizado_por: null, go_autorizado_em: null, go_observacao: null,
  })
  check('DONO revoga o GO-LIVE', revDono.status === 200 && revDono.json?.[0]?.go_autorizado === false, `status ${revDono.status}`)

  // --- OPERADOR: sem acesso
  const opLe = await rest(tok.operador, 'GET', `implantacao_checklists?loja_id=eq.${LOJA}`)
  check('OPERADOR não enxerga o checklist', Array.isArray(opLe.json) && opLe.json.length === 0)
  const opAlt = await rest(tok.operador, 'PATCH', `implantacao_checklists?loja_id=eq.${LOJA}`, { go_autorizado: true })
  check('OPERADOR não altera o checklist', Array.isArray(opAlt.json) ? opAlt.json.length === 0 : bloqueado(opAlt))
} finally {
  await limpar()
}

console.log(falhas === 0 ? '\nTODOS OS CHECKS PASSARAM' : `\n${falhas} CHECK(S) FALHARAM`)
process.exit(falhas === 0 ? 0 : 1)
