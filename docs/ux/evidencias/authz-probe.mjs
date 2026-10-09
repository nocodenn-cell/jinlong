import fs from 'node:fs'
const API = 'http://127.0.0.1:54321'
const ANON = process.env.ANON
const PW = fs.readFileSync(process.env.PWFILE, 'utf8').split('=')[1].trim()
const LOJA = 'a0000001-0000-4000-8000-000000000001'
const OUTRA_LOJA = 'b0000001-0000-4000-8000-000000000001'
const DONO_ID = '11111111-1111-4111-8111-111111111111'

async function login(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login ${email}: ${r.status} ${j.msg ?? j.error_description ?? ''}`)
  return j.access_token
}
const H = (tok) => ({ apikey: ANON, authorization: `Bearer ${tok ?? ANON}`, 'content-type': 'application/json', prefer: 'return=representation' })
async function rpc(tok, name, body) {
  const r = await fetch(`${API}/rest/v1/rpc/${name}`, { method: 'POST', headers: H(tok), body: JSON.stringify(body) })
  const t = await r.text(); return { status: r.status, body: t.slice(0, 140) }
}
async function rest(tok, method, path, body) {
  const r = await fetch(`${API}/rest/v1/${path}`, { method, headers: H(tok), body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); return { status: r.status, body: t.slice(0, 200) }
}
const out = []
const log = (k, v) => { out.push([k, v]); console.log(k.padEnd(62), '→', JSON.stringify(v)) }

const tok = { gerente: await login('gerente.seed@local.test'), operador: await login('operador.seed@local.test'), dono: await login('dono.seed@local.test') }

console.log('--- A) Diagnóstico do Caixa: RPC pdv_diagnostico_pre_producao')
for (const [who, t] of [['anon (sem login)', null], ['OPERADOR', tok.operador], ['GERENTE', tok.gerente], ['DONO', tok.dono]]) {
  const r = await rpc(t, 'pdv_diagnostico_pre_producao', { p_produto_codigo: null })
  log(`RPC como ${who}`, { status: r.status, resumo: r.status === 200 ? 'executou (retornou checks)' : r.body.slice(0, 90) })
}

console.log('--- B) Implantação: RLS de implantacao_checklists')
// limpa estado de teste
await rest(tok.dono, 'DELETE', `implantacao_checklists?loja_id=eq.${LOJA}`)
const ins = await rest(tok.gerente, 'POST', 'implantacao_checklists', { loja_id: LOJA })
log('GERENTE cria cabeçalho do checklist da própria loja', { status: ins.status })
const forge = await rest(tok.gerente, 'PATCH', `implantacao_checklists?loja_id=eq.${LOJA}`, {
  go_autorizado: true, go_autorizado_em: new Date().toISOString(), go_autorizado_por: DONO_ID, go_observacao: 'forjado em teste local',
})
let forged
try { forged = JSON.parse(forge.body) } catch { forged = null }
log('GERENTE grava go_autorizado=true direto no PostgREST', { status: forge.status, go_autorizado: forged?.[0]?.go_autorizado, go_autorizado_por_eh_dono: forged?.[0]?.go_autorizado_por === DONO_ID })
const op = await rest(tok.operador, 'PATCH', `implantacao_checklists?loja_id=eq.${LOJA}`, { go_autorizado: false })
let opRows; try { opRows = JSON.parse(op.body) } catch { opRows = null }
log('OPERADOR tenta alterar o mesmo cabeçalho', { status: op.status, linhas_afetadas: Array.isArray(opRows) ? opRows.length : op.body.slice(0, 80) })
const opSel = await rest(tok.operador, 'GET', `implantacao_checklists?loja_id=eq.${LOJA}`)
let opSelRows; try { opSelRows = JSON.parse(opSel.body) } catch { opSelRows = null }
log('OPERADOR consegue LER o cabeçalho', { status: opSel.status, linhas_visiveis: Array.isArray(opSelRows) ? opSelRows.length : opSel.body.slice(0, 80) })
const cross = await rest(tok.gerente, 'POST', 'implantacao_checklists', { loja_id: OUTRA_LOJA })
log('GERENTE cria cabeçalho de OUTRA loja (isolamento)', { status: cross.status, bloqueado: cross.status >= 400 })
const crossPatch = await rest(tok.gerente, 'PATCH', `implantacao_checklists?loja_id=eq.${OUTRA_LOJA}`, { go_autorizado: true })
let cp; try { cp = JSON.parse(crossPatch.body) } catch { cp = null }
log('GERENTE altera cabeçalho de OUTRA loja', { status: crossPatch.status, linhas_afetadas: Array.isArray(cp) ? cp.length : crossPatch.body.slice(0, 60) })
// restaura
await rest(tok.dono, 'DELETE', `implantacao_checklists?loja_id=eq.${LOJA}`)
log('limpeza do estado de teste', 'ok')
