#!/usr/bin/env node
/**
 * Smoke ADVERSARIAL do N1 (migration 20261009180000) — STACK LOCAL APENAS.
 *
 * Garante, com logins reais e a API real (PostgREST), que o OPERADOR não lê o custo de aquisição por nenhum
 * caminho conhecido e que o PDV continua funcionando, enquanto GERENTE/DONO/ADMIN seguem lendo o custo pela
 * view `produtos_custos` com o isolamento entre lojas preservado.
 *
 * Uso (stack local no ar, com o seed):
 *   SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=... SERVICE_ROLE_KEY=... SEED_PASSWORD=... \
 *   PROVISION_PASSWORDS=1 ADMIN_EMAIL=admin.ux@local.test \
 *     node backend/scripts/n1-preco-custo-authz-smoke.mjs
 *
 * O seed cria os usuários `*.seed@local.test` SEM senha: PROVISION_PASSWORDS=1 define SEED_PASSWORD neles
 * (somente local, API admin do GoTrue). ADMIN_EMAIL, se informado, deve existir com perfil ADMIN.
 * Recusa qualquer URL que não seja local. Não imprime chaves nem senhas. Restaura o que altera (custo do produto
 * usado, configuração de alertas, produto efêmero da loja B); deixa apenas UMA venda de teste (histórico de venda é
 * imutável) — rode em stack descartável/CI, não em base de uso contínuo.
 */
import { randomUUID } from 'node:crypto'

const API = (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(/\/$/, '')
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SERVICE_ROLE_KEY
const PW = process.env.SEED_PASSWORD
const ADMIN_EMAIL = process.env.ADMIN_EMAIL

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`RECUSADO: SUPABASE_URL (${API}) não é local.`)
  process.exit(2)
}
if (!ANON || !SERVICE || !PW) {
  console.error('Faltam ANON_KEY, SERVICE_ROLE_KEY ou SEED_PASSWORD.')
  process.exit(2)
}

const LOJA_A = 'a0000001-0000-4000-8000-000000000001' // Matriz (loja dos usuários seed)
const LOJA_B = 'b0000001-0000-4000-8000-000000000001' // outra loja do seed
const OPERADOR_ID = '33333333-3333-4333-8333-333333333333'

let falhas = 0
const check = (nome, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${extra ? ` — ${extra}` : ''}`)
  if (!ok) falhas++
}

async function provisionarSenhas() {
  const r = await fetch(`${API}/auth/v1/admin/users?per_page=200`, { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } })
  const { users = [] } = await r.json()
  const alvo = new Set(['operador.seed@local.test', 'gerente.seed@local.test', 'dono.seed@local.test', ADMIN_EMAIL].filter(Boolean))
  for (const u of users.filter((x) => alvo.has(x.email))) {
    const up = await fetch(`${API}/auth/v1/admin/users/${u.id}`, {
      method: 'PUT',
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password: PW }),
    })
    if (!up.ok) throw new Error(`não foi possível definir a senha de ${u.email}`)
  }
}
if (process.env.PROVISION_PASSWORDS === '1') await provisionarSenhas()

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
const hdr = (tok, extra = {}) => ({ apikey: tok === SERVICE ? SERVICE : ANON, authorization: `Bearer ${tok ?? ANON}`, 'content-type': 'application/json', ...extra })
async function call(tok, method, path, body, extra) {
  const r = await fetch(`${API}/${path}`, { method, headers: hdr(tok, extra), body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, json, text }
}
const get = (tok, path) => call(tok, 'GET', `rest/v1/${path}`)
const rpc = (tok, name, body) => call(tok, 'POST', `rest/v1/rpc/${name}`, body ?? {})
const negado = (r) => r.status >= 400 && /42501|permission denied|permissao|NAO_AUTORIZADO/i.test(r.text)
const vazio = (r) => r.status === 200 && Array.isArray(r.json) && r.json.length === 0

const tOp = await login('operador.seed@local.test')
const tGer = await login('gerente.seed@local.test')
const tDono = await login('dono.seed@local.test')
const tAdmin = ADMIN_EMAIL ? await login(ADMIN_EMAIL) : null

// ── dados de teste ──────────────────────────────────────────────────────────────────────────────────────
// prodA: produto EXISTENTE da loja A com estoque; o custo é elevado temporariamente acima do preço (e restaurado
//        no final) para provar o alerta de margem negativa sem criar produtos que sujariam outras suítes.
// prodB: produto efêmero na loja B (removido no final) para provar o isolamento entre lojas.
const est = await get(SERVICE, `estoque?loja_id=eq.${LOJA_A}&quantidade_atual=gte.5&select=produto_id&limit=40`)
let prodA = null
let orig = null
for (const e of est.json ?? []) {
  const p = await get(SERVICE, `produtos?id=eq.${e.produto_id}&ativo=eq.true&status_publicacao=eq.PUBLICADO&select=id,preco_varejo,preco_custo,permitir_abaixo_custo`)
  const row = p.json?.[0]
  if (row && Number(row.preco_varejo) > 0) { prodA = row.id; orig = row; break }
}
if (!prodA) {
  console.error('Nenhum produto elegível na loja A (seed ausente?).')
  process.exit(2)
}
const PRECO = Number(orig.preco_varejo)
const CUSTO = Math.round((PRECO + 4.5) * 100) / 100
const prodB = randomUUID()
// caixa ABERTO do OPERADOR: usa o existente ou abre um próprio (suítes anteriores podem tê-lo fechado)
let CAIXA = (await get(SERVICE, `caixas?operador_id=eq.${OPERADOR_ID}&status=eq.ABERTO&select=id&limit=1`)).json?.[0]?.id ?? null
let caixaCriado = false
if (!CAIXA) {
  CAIXA = randomUUID()
  const c = await call(SERVICE, 'POST', 'rest/v1/caixas', { id: CAIXA, operador_id: OPERADOR_ID, loja_id: LOJA_A, status: 'ABERTO', valor_inicial: 0, saldo_atual: 0 }, { prefer: 'return=minimal' })
  if (c.status >= 300) { console.error(`Não foi possível abrir um caixa de teste: ${c.text.slice(0, 160)}`); process.exit(2) }
  caixaCriado = true
}
const cfgOriginal = (await get(SERVICE, 'pdv_config?id=eq.1&select=alertas_leves_ativos')).json?.[0]?.alertas_leves_ativos ?? false

await call(SERVICE, 'PATCH', `rest/v1/produtos?id=eq.${prodA}`, { preco_custo: CUSTO, permitir_abaixo_custo: true }, { prefer: 'return=minimal' })
await call(SERVICE, 'POST', 'rest/v1/produtos', { id: prodB, loja_id: LOJA_B, nome: 'N1 Outra loja (efemero)', preco_varejo: 20, preco_custo: 7.7, origem: 'brasil_sem_nf', ativo: true, status_publicacao: 'PUBLICADO' }, { prefer: 'return=minimal' })
await call(SERVICE, 'PATCH', 'rest/v1/pdv_config?id=eq.1', { alertas_leves_ativos: true }, { prefer: 'return=minimal' })

try {
  console.log('\n— OPERADOR: leitura direta do custo —')
  for (const q of ['preco_custo', 'preco_custo_medio', '*', 'id,nome,preco_custo']) {
    const r = await get(tOp, `produtos?select=${encodeURIComponent(q)}&limit=5`)
    check(`OPERADOR select=${q} é negado`, negado(r), `HTTP ${r.status}`)
  }
  const f1 = await get(tOp, 'produtos?select=id&preco_custo=gt.0&limit=5')
  check('OPERADOR não filtra por preco_custo (inferência)', negado(f1), `HTTP ${f1.status}`)
  const f2 = await get(tOp, 'produtos?select=id&order=preco_custo.desc&limit=5')
  check('OPERADOR não ordena por preco_custo (inferência)', negado(f2), `HTTP ${f2.status}`)
  const ok = await get(tOp, 'produtos?select=id,nome,preco_varejo,preco_atacado,codigo_barras&limit=500')
  check('OPERADOR continua lendo as colunas sem custo (catálogo/PDV)', ok.status === 200 && ok.json.length >= 1, `${ok.json.length} produtos`)
  const emb = await get(tOp, 'itens_venda?select=id,produtos(preco_custo)&limit=1')
  check('OPERADOR não lê custo por embed (itens_venda→produtos)', negado(emb), `HTTP ${emb.status}`)
  const view = await get(tOp, 'produtos_custos?select=*')
  check('OPERADOR vê 0 linhas em produtos_custos', vazio(view), `HTTP ${view.status}`)
  const hist = await get(tOp, 'historico_precos_produto?select=preco_custo_anterior,preco_custo_novo&limit=5')
  check('OPERADOR não lê histórico de preços (custo)', vazio(hist) || negado(hist), `HTTP ${hist.status}`)
  const iv = await get(tOp, 'itens_venda?select=custo_unitario_snap&limit=5')
  check('OPERADOR não lê custo_unitario_snap', vazio(iv) || negado(iv), `HTTP ${iv.status}`)
  const nfe = await get(tOp, 'importacoes_nfe_itens?select=custo_unitario&limit=5')
  check('OPERADOR não lê custo de itens de NF-e', vazio(nfe) || negado(nfe), `HTTP ${nfe.status}`)
  const al = await get(tOp, 'system_alerts?select=detalhe&limit=5')
  check('OPERADOR não lê system_alerts', vazio(al) || negado(al), `HTTP ${al.status}`)
  const m = await rpc(tOp, 'relatorio_margem_por_venda_periodo', { p_de: '2026-01-01', p_ate: '2026-12-31', p_limite: 200 })
  const algumCusto = Array.isArray(m.json) && m.json.some((l) => l.custo_total_estimado != null || l.margem_estimada != null)
  check('RPC margem por venda não expõe custo ao OPERADOR', m.status === 200 && !algumCusto, `HTTP ${m.status}`)
  const r1 = await rpc(tOp, 'relatorio_resumo_executivo_periodo', { p_de: '2026-01-01', p_ate: '2026-12-31' })
  const row = Array.isArray(r1.json) ? r1.json[0] : null
  check('RPC resumo executivo não expõe custo/margem ao OPERADOR', !row || (row.cobertura_custo === 0 && Number(row.margem_bruta_estimada ?? 0) === 0 && row.custo_confiavel === false), JSON.stringify(row ?? {}).slice(0, 90))
  for (const fn of ['dashboard_gerente_resumo']) {
    const r = await rpc(tOp, fn, { p_loja_id: LOJA_A, p_tz: 'America/Sao_Paulo' })
    check(`RPC ${fn} negada ao OPERADOR`, negado(r), `HTTP ${r.status}`)
  }
  const wr = await call(tOp, 'PATCH', `rest/v1/produtos?id=eq.${prodA}`, { preco_custo: 0.01 }, { prefer: 'return=minimal' })
  const apos = await get(SERVICE, `produtos?id=eq.${prodA}&select=preco_custo`)
  check('OPERADOR não altera preco_custo', Number(apos.json?.[0]?.preco_custo) === CUSTO, `HTTP ${wr.status}`)

  console.log('\n— anon —')
  const an = await get(null, 'produtos?select=preco_custo&limit=1')
  check('anon não lê preco_custo', negado(an) || an.status === 401, `HTTP ${an.status}`)
  const anv = await get(null, 'produtos_custos?select=*&limit=1')
  check('anon não acessa produtos_custos', negado(anv) || anv.status === 401, `HTTP ${anv.status}`)

  console.log('\n— GERENTE / DONO / ADMIN —')
  for (const [rot, tok] of [['GERENTE', tGer], ['DONO', tDono], ...(tAdmin ? [['ADMIN', tAdmin]] : [])]) {
    const direto = await get(tok, 'produtos?select=preco_custo&limit=1')
    check(`${rot} também não lê a coluna direto (usa a view)`, negado(direto), `HTTP ${direto.status}`)
    const v = await get(tok, `produtos_custos?select=produto_id,loja_id,preco_custo,preco_custo_medio&produto_id=in.(${prodA},${prodB})`)
    const ids = new Set((v.json ?? []).map((l) => l.produto_id))
    const veA = ids.has(prodA)
    const veB = ids.has(prodB)
    if (rot === 'ADMIN') {
      check('ADMIN lê custo das duas lojas', v.status === 200 && veA && veB && Number(v.json.find((l) => l.produto_id === prodA).preco_custo) === CUSTO, `${ids.size} linhas`)
    } else {
      check(`${rot} lê o custo da própria loja e NÃO o de outra loja`, v.status === 200 && veA && !veB && Number(v.json.find((l) => l.produto_id === prodA).preco_custo) === CUSTO, `${ids.size} linhas`)
    }
    const base = await get(tok, 'produtos?select=id,nome,preco_varejo,estoque_minimo,ncm&limit=5')
    check(`${rot} lê as colunas sem custo`, base.status === 200 && base.json.length > 0)
    const als = await get(tok, 'system_alerts?select=id&limit=1')
    check(`${rot} lê system_alerts`, als.status === 200)
  }

  console.log('\n— PDV: OPERADOR conclui venda sem ler custo; snapshot vem do banco —')
  const vendaId = randomUUID()
  const item = { item_id: randomUUID(), produto_id: prodA, quantidade: 2, preco_original: PRECO, preco_unitario: PRECO, desconto_unitario: 0, tipo_preco: 'VAREJO', custo_unitario_snap: null, tipo_preco_fonte: 'VAREJO', regra_aplicada_id: null }
  const fin = await rpc(tOp, 'finalizar_venda_transacional_canonica_v4', {
    p_venda_id: vendaId, p_caixa_id: CAIXA, p_operador_id: OPERADOR_ID, p_loja_id: LOJA_A, p_forma_pagamento: 'DINHEIRO',
    p_total_bruto: PRECO * 2, p_total_desconto: 0, p_total_liquido: PRECO * 2, p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: PRECO * 2 }], p_itens: [item],
    p_desconto_gerente_token: null, p_desconto_gerente_percentual: null, p_strict_manager_discount_auth: false, p_fiscal_auto_enqueue: false,
    p_ip_address: '127.0.0.1', p_user_agent: 'n1-smoke', p_device_id: 'n1', p_terminal_id: 'web-caixa', p_cliente_id: null,
    p_motivo_desconto: 'NAO_ESPECIFICADO', p_motivo_descricao: null, p_limite_credito_gerente_token: null,
  })
  check('OPERADOR conclui a venda (custo_unitario_snap enviado nulo)', fin.status === 200, `HTTP ${fin.status} ${fin.status === 200 ? '' : fin.text.slice(0, 120)}`)
  const snap = await get(SERVICE, `itens_venda?venda_id=eq.${vendaId}&select=custo_unitario_snap`)
  check('banco gravou o snapshot de custo sem ajuda do cliente', Number(snap.json?.[0]?.custo_unitario_snap) === CUSTO, JSON.stringify(snap.json?.[0] ?? {}))
  const a1 = await rpc(tOp, 'pdv_registrar_alertas_margem_venda', { p_venda_id: vendaId })
  check('OPERADOR dispara o alerta de margem negativa da própria venda', a1.status === 200 && Number(a1.json) === 1, `HTTP ${a1.status} retorno=${JSON.stringify(a1.json)}`)
  const a2 = await rpc(tOp, 'pdv_registrar_alertas_margem_venda', { p_venda_id: vendaId })
  check('alerta é idempotente (2ª chamada = 0)', a2.status === 200 && Number(a2.json) === 0)
  const alerta = await get(SERVICE, `system_alerts?venda_id=eq.${vendaId}&select=tipo,detalhe`)
  const det = JSON.stringify(alerta.json?.[0]?.detalhe ?? {})
  check('detalhe do alerta NÃO contém o custo', alerta.json?.length === 1 && !det.includes(String(CUSTO)) && !/custo_unitario/.test(det), det)
  const alG = await get(tGer, `system_alerts?venda_id=eq.${vendaId}&select=tipo`)
  check('GERENTE enxerga o alerta', alG.status === 200 && alG.json.length === 1)
  const alOutra = await rpc(tGer, 'pdv_registrar_alertas_margem_venda', { p_venda_id: randomUUID() })
  check('venda inexistente é recusada', alOutra.status >= 400)
} finally {
  // restaura o produto da loja A, remove o produto efêmero da loja B e a configuração original
  await call(SERVICE, 'PATCH', `rest/v1/produtos?id=eq.${prodA}`, { preco_custo: orig.preco_custo, permitir_abaixo_custo: orig.permitir_abaixo_custo }, { prefer: 'return=minimal' })
  await call(SERVICE, 'DELETE', `rest/v1/historico_precos_produto?produto_id=eq.${prodB}`, undefined, { prefer: 'return=minimal' })
  await call(SERVICE, 'DELETE', `rest/v1/produtos?id=eq.${prodB}`, undefined, { prefer: 'return=minimal' })
  await call(SERVICE, 'PATCH', 'rest/v1/pdv_config?id=eq.1', { alertas_leves_ativos: cfgOriginal }, { prefer: 'return=minimal' })
  if (caixaCriado) await call(SERVICE, 'PATCH', `rest/v1/caixas?id=eq.${CAIXA}`, { status: 'FECHADO', data_fechamento: new Date().toISOString() }, { prefer: 'return=minimal' })
}

console.log(falhas === 0 ? '\nTODOS OS CHECKS PASSARAM' : `\n${falhas} CHECK(S) FALHARAM`)
process.exit(falhas === 0 ? 0 : 1)
