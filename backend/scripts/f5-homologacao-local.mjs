#!/usr/bin/env node
/**
 * F5 — dados de HOMOLOGAÇÃO do hub de Importações no Supabase LOCAL.
 *
 * Cria (idempotente) somente dados e identidades FICTÍCIOS:
 *   Empresa A "Importadora Dragão Demo (fictícia)" — módulo IMPORT_INTELLIGENCE habilitado
 *     · DONO  dono.importadora@homolog.test
 *     · GERENTE gerente.importadora@homolog.test
 *     · OPERADOR operador.importadora@homolog.test
 *     · fornecedor e produto fictícios
 *   Empresa B "Loja Sem Módulo Demo (fictícia)" — SEM o módulo
 *     · DONO  dono.semmodulo@homolog.test
 *   Empresa C "Importadora Concorrente Demo (fictícia)" — COM o módulo (prova de isolamento A × C)
 *     · DONO  dono.concorrente@homolog.test
 * Senha de todas as identidades fictícias: HOMOLOG_SENHA abaixo (somente local).
 *
 * Recusa qualquer host que não seja 127.0.0.1/localhost. Não designa administrador de
 * plataforma: o módulo é habilitado pelo procedimento operacional (service_role, sem identidade).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (de `supabase status -o env`).
 * Uso: node backend/scripts/f5-homologacao-local.mjs
 */
const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const HOMOLOG_SENHA = 'Homolog-Importacoes-2026!'

if (!URL_BASE || !SERVICE) {
  console.error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (supabase status -o env)')
  process.exit(2)
}
if (!['127.0.0.1', 'localhost'].includes(new URL(URL_BASE).hostname)) {
  console.error('recusado: alvo não local')
  process.exit(2)
}

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

async function req(method, path, body, prefer = 'return=representation') {
  const r = await fetch(`${URL_BASE}${path}`, { method, headers: { ...H, Prefer: prefer }, body: body ? JSON.stringify(body) : undefined })
  const txt = await r.text()
  const json = txt ? JSON.parse(txt) : null
  if (r.status >= 300) throw new Error(`${method} ${path}: ${r.status} ${txt}`)
  return json
}
const get = (path) => req('GET', `/rest/v1/${path}`)
const post = (tab, body) => req('POST', `/rest/v1/${tab}`, body)

async function umOuCria(tab, filtro, body) {
  const achado = await get(`${tab}?${filtro}&select=id&limit=1`)
  if (achado.length) return achado[0].id
  return (await post(tab, body))[0].id
}

async function usuario(email, nome, perfil, lojaId) {
  let id
  const lista = await req('GET', `/auth/v1/admin/users?per_page=1000`)
  const existente = (lista.users ?? []).find((u) => u.email === email)
  if (existente) {
    id = existente.id
  } else {
    id = (await req('POST', '/auth/v1/admin/users', { email, password: HOMOLOG_SENHA, email_confirm: true, user_metadata: { full_name: nome } })).id
  }
  const linha = await get(`usuarios?id=eq.${id}&select=id`)
  if (!linha.length) await post('usuarios', { id, nome, perfil, loja_id: lojaId, ativo: true, idioma_preferido: 'pt' })
  return id
}

const empA = await umOuCria('empresas', 'nome=eq.Importadora%20Drag%C3%A3o%20Demo%20(fict%C3%ADcia)', { nome: 'Importadora Dragão Demo (fictícia)' })
const empB = await umOuCria('empresas', 'nome=eq.Loja%20Sem%20M%C3%B3dulo%20Demo%20(fict%C3%ADcia)', { nome: 'Loja Sem Módulo Demo (fictícia)' })
const lojaA = await umOuCria('lojas', 'codigo=eq.HOMOLOG-IMP-A', { nome: 'Importadora Dragão — Matriz (fictícia)', codigo: 'HOMOLOG-IMP-A', empresa_id: empA })
const lojaB = await umOuCria('lojas', 'codigo=eq.HOMOLOG-IMP-B', { nome: 'Loja Sem Módulo (fictícia)', codigo: 'HOMOLOG-IMP-B', empresa_id: empB })
const empC = await umOuCria('empresas', 'nome=eq.Importadora%20Concorrente%20Demo%20(fict%C3%ADcia)', { nome: 'Importadora Concorrente Demo (fictícia)' })
const lojaC = await umOuCria('lojas', 'codigo=eq.HOMOLOG-IMP-C', { nome: 'Importadora Concorrente (fictícia)', codigo: 'HOMOLOG-IMP-C', empresa_id: empC })

await usuario('dono.importadora@homolog.test', 'Dono Importadora (fictício)', 'DONO', lojaA)
await usuario('gerente.importadora@homolog.test', 'Gerente Importadora (fictício)', 'GERENTE', lojaA)
await usuario('operador.importadora@homolog.test', 'Operador Importadora (fictício)', 'OPERADOR', lojaA)
await usuario('dono.semmodulo@homolog.test', 'Dono Sem Módulo (fictício)', 'DONO', lojaB)
await usuario('dono.concorrente@homolog.test', 'Dono Concorrente (fictício)', 'DONO', lojaC)

await umOuCria('fornecedores', `loja_id=eq.${lojaA}&nome=eq.Ningbo%20Hardware%20Co.%20(fict%C3%ADcio)`, {
  nome: 'Ningbo Hardware Co. (fictício)', loja_id: lojaA,
})
const cat = await umOuCria('categorias', 'nome=eq.Homologa%C3%A7%C3%A3o%20Importa%C3%A7%C3%B5es', { nome: 'Homologação Importações' })
const produtoA = await umOuCria('produtos', `loja_id=eq.${lojaA}&codigo_barras=eq.7899990000017`, {
  codigo_barras: '7899990000017', nome: 'Parafuso M6 inox (fictício)', categoria_id: cat, preco_varejo: 1.5, preco_custo: 0.4,
  origem: 'importado', tem_nf: true, ativo: true, status_publicacao: 'PUBLICADO', loja_id: lojaA,
}).catch(async (e) => {
  // origem pode ter outro domínio no schema: tenta o valor usado pelos testes do repositório
  if (!/origem/.test(String(e))) throw e
  return umOuCria('produtos', `loja_id=eq.${lojaA}&codigo_barras=eq.7899990000017`, {
    codigo_barras: '7899990000017', nome: 'Parafuso M6 inox (fictício)', categoria_id: cat, preco_varejo: 1.5, preco_custo: 0.4,
    origem: 'brasil_nf', tem_nf: true, ativo: true, status_publicacao: 'PUBLICADO', loja_id: lojaA,
  })
})

// saldo fictício: o E2E prova que o hub não altera estoque, kardex, AP nem preço desta loja
await umOuCria('estoque', `loja_id=eq.${lojaA}&produto_id=eq.${produtoA}`, { loja_id: lojaA, produto_id: produtoA, quantidade_atual: 120 })

// módulo: empresas A e C (B fica sem), pelo procedimento operacional auditado
for (const emp of [empA, empC]) {
  const mod = await get(`empresa_modulos?empresa_id=eq.${emp}&modulo_codigo=eq.IMPORT_INTELLIGENCE&select=habilitado`)
  if (!mod.length || !mod[0].habilitado) {
    await req('POST', '/rest/v1/rpc/ops_definir_modulo_empresa', {
      p_empresa: emp, p_modulo: 'IMPORT_INTELLIGENCE', p_habilitado: true,
      p_autorizado_por: 'homologação local (contrato fictício)', p_motivo: 'Homologação local do hub de Importações (F5)',
      p_responsavel: 'f5-homologacao-local',
    })
  }
}

console.log(JSON.stringify({ empresaComModulo: empA, empresaSemModulo: empB, empresaConcorrente: empC, lojaA, lojaB, lojaC }, null, 2))
console.log('homologação local pronta (identidades fictícias; senha em HOMOLOG_SENHA neste script)')
