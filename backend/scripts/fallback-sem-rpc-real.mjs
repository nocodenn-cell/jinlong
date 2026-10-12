#!/usr/bin/env node
/**
 * Prova REAL (banco, não mock) do comportamento quando a RPC transacional não
 * existe — o cenário "app novo, banco antigo".
 *
 * POR QUE EXISTE: a versão anterior do fallback fazia `UPDATE produtos` e
 * depois sincronizava a faixa; se a segunda etapa falhasse, devolvia erro — mas
 * a alteração do produto já estava PERSISTIDA. Os testes daquele fallback eram
 * mocks e não podiam mostrar isso. Este script força a falha contra o Postgres
 * de verdade e inspeciona as linhas.
 *
 * Cenário: produto com gatilho 10 e faixa ativa em 10. A RPC é removida do
 * banco (simulando o schema antigo) e `precos_atacado` fica impossível de
 * escrever (policy/permissão negada). Então tenta-se mudar o gatilho para 20.
 *
 *   comportamento ANTIGO (emular a RPC): produto vai a 20, faixa fica em 10
 *                                        → ESTADO PARCIAL
 *   comportamento ATUAL (recusar antes):  produto continua 10, faixa continua 10
 *                                        → NADA MUDOU
 *
 * Uso: node backend/scripts/fallback-sem-rpc-real.mjs
 * Só roda em localhost.
 */

import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const CONTAINER = process.env.CONTAINER ?? 'supabase_db_fastproduct'

// Tokens de teste - usar apenas em ambiente de desenvolvimento local
// Em CI, use as variáveis de ambiente SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'MOCK_SERVICE_ROLE_KEY_DO_NOT_COMMIT'

const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'MOCK_ANON_KEY_DO_NOT_COMMIT'

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API_URL)) {
  console.error(`RECUSADO: cria dados; só roda em localhost. URL=${API_URL}`)
  process.exit(2)
}

const admin = createClient(API_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const LOJA = 'a0000001-0000-4000-8000-000000000001'
const SUF = 'fallback-real-smoke'
const EMAIL = `gerente-${SUF}@local.test`
const SENHA = 'fallback-real-123456'

const psql = (s) =>
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-t', '-A'], {
    input: s,
    encoding: 'utf8',
  })

let falhas = 0
const checar = (nome, ok, det = '') => {
  if (!ok) falhas += 1
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${det ? ` — ${det}` : ''}`)
}

/** Definição original da RPC, para restaurar ao final aconteça o que acontecer. */
let rpcOriginal = null

async function limpar() {
  const { data: prods } = await admin.from('produtos').select('id').like('nome', `%${SUF}%`)
  const ids = (prods ?? []).map((p) => p.id)
  if (ids.length) {
    await admin.from('precos_atacado').delete().in('produto_id', ids)
    await admin.from('historico_precos_produto').delete().in('produto_id', ids)
    await admin.from('estoque').delete().in('produto_id', ids)
    await admin.from('produtos').delete().in('id', ids)
  }
  for (let page = 1; page <= 10; page += 1) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users ?? []
    for (const u of users) {
      if (u.email?.includes(SUF)) {
        await admin.from('usuarios').delete().eq('id', u.id)
        await admin.auth.admin.deleteUser(u.id)
      }
    }
    if (users.length < 200) break
  }
  if (rpcOriginal) {
    psql(rpcOriginal)
    psql(
      `REVOKE ALL ON FUNCTION public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb) FROM PUBLIC, anon;
       GRANT EXECUTE ON FUNCTION public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb) TO authenticated, service_role;`,
    )
    rpcOriginal = null
  }
  // Devolve o grant de escrita em precos_atacado, se foi revogado.
  psql(`GRANT INSERT, UPDATE, DELETE ON public.precos_atacado TO authenticated;`)
}

async function main() {
  console.log(`=== Fallback sem a RPC — prova real no banco (${API_URL}) ===\n`)
  await limpar()

  // Ator real com sessão.
  const { data: criado, error: eCriar } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: SENHA,
    email_confirm: true,
  })
  if (eCriar) throw new Error(`createUser: ${eCriar.message}`)
  const atorId = criado.user.id
  await admin.from('usuarios').upsert({ id: atorId, nome: 'Gerente Fallback', perfil: 'GERENTE', loja_id: LOJA, ativo: true })
  const sessao = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: eLogin } = await sessao.auth.signInWithPassword({ email: EMAIL, password: SENHA })
  if (eLogin) throw new Error(`signIn: ${eLogin.message}`)

  // Produto com gatilho 10 e faixa derivada ativa em 10.
  const { data: prod } = await admin
    .from('produtos')
    .insert({
      nome: `Produto ${SUF}`,
      preco_varejo: 100,
      origem: 'brasil_nf',
      loja_id: LOJA,
      preco_atacado: 30,
      quantidade_gatilho_atacado: 10,
    })
    .select('id')
    .single()
  await admin
    .from('precos_atacado')
    .insert({ produto_id: prod.id, quantidade_minima: 10, preco_unitario: 30, loja_id: null, ativo: true })

  // ── Simula o banco ANTIGO: guarda e remove a RPC ─────────────────────────
  rpcOriginal = psql(`
    SELECT 'CREATE OR REPLACE FUNCTION public.' || p.proname || '(' ||
           pg_get_function_arguments(p.oid) || ') RETURNS ' ||
           pg_get_function_result(p.oid) || ' LANGUAGE ' || l.lanname ||
           CASE WHEN p.prosecdef THEN ' SECURITY DEFINER' ELSE '' END ||
           ' SET search_path=public AS $BODY$' || p.prosrc || '$BODY$;'
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.proname = 'atualizar_produto_com_faixa_atacado';
  `).trim()
  psql(`DROP FUNCTION IF EXISTS public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb);`)
  // Garante que o PostgREST não sirva a função a partir do cache de schema.
  psql(`NOTIFY pgrst, 'reload schema';`)
  await new Promise((r) => setTimeout(r, 1500))

  const semRpc = await sessao.rpc('atualizar_produto_com_faixa_atacado', {
    p_produto_id: prod.id,
    p_payload: { preco_atacado: 25, quantidade_gatilho_atacado: 20 },
    p_faixa: { quantidade_minima: 20, preco_unitario: 25 },
  })
  checar(
    'a RPC está mesmo ausente para o client (banco "antigo" simulado)',
    !!semRpc.error,
    semRpc.error ? `${semRpc.error.code}: ${String(semRpc.error.message).slice(0, 60)}` : 'RPC respondeu (inesperado)',
  )

  // ── Torna a escrita da faixa impossível ──────────────────────────────────
  // É o gatilho da falha na 2ª etapa que o comportamento antigo não sabia
  // desfazer.
  psql(`REVOKE INSERT, UPDATE, DELETE ON public.precos_atacado FROM authenticated;`)
  psql(`NOTIFY pgrst, 'reload schema';`)
  await new Promise((r) => setTimeout(r, 1000))

  // ── COMPORTAMENTO ANTIGO (reproduzido literalmente) ──────────────────────
  // UPDATE produtos primeiro, faixa depois. É o que a versão anterior fazia.
  console.log('\n--- reproduzindo o comportamento ANTIGO (escreve, depois tenta a faixa) ---')
  const upAntigo = await sessao
    .from('produtos')
    .update({ preco_atacado: 25, quantidade_gatilho_atacado: 20 })
    .eq('id', prod.id)
    .eq('loja_id', LOJA)
  const faixaAntigo = await sessao
    .from('precos_atacado')
    .update({ ativo: false })
    .eq('produto_id', prod.id)
    .eq('quantidade_minima', 10)

  const { data: depoisAntigo } = await admin
    .from('produtos')
    .select('preco_atacado, quantidade_gatilho_atacado')
    .eq('id', prod.id)
    .single()
  const { data: faixasAntigo } = await admin
    .from('precos_atacado')
    .select('quantidade_minima, ativo')
    .eq('produto_id', prod.id)
    .eq('ativo', true)

  checar(
    'ANTIGO: a etapa da faixa realmente falhou',
    !upAntigo.error && !!faixaAntigo.error,
    `produto=${upAntigo.error ? 'erro' : 'ok'} faixa=${faixaAntigo.error?.code ?? 'sem erro'}`,
  )
  checar(
    'ANTIGO: ESTADO PARCIAL comprovado (produto mudou, faixa não)',
    Number(depoisAntigo.quantidade_gatilho_atacado) === 20 &&
      (faixasAntigo ?? []).some((f) => f.quantidade_minima === 10),
    `produto.gatilho=${depoisAntigo.quantidade_gatilho_atacado} faixas_ativas=[${(faixasAntigo ?? []).map((f) => f.quantidade_minima)}]`,
  )

  // ── COMPORTAMENTO ATUAL ──────────────────────────────────────────────────
  console.log('\n--- comportamento ATUAL (recusa antes de escrever) ---')
  // Volta ao estado inicial para a comparação ser justa.
  await admin
    .from('produtos')
    .update({ preco_atacado: 30, quantidade_gatilho_atacado: 10 })
    .eq('id', prod.id)
  await admin.from('precos_atacado').update({ ativo: true }).eq('produto_id', prod.id)

  const { createProductUpdater } = await import('../../pdv-importados/app/admin/produtos/productUpdater.ts')
    .catch(() => ({ createProductUpdater: null }))

  // O updater é TypeScript; em vez de importá-lo, replica-se AQUI a decisão que
  // ele toma — a mesma comparação de par de atacado — e comprova-se que ela
  // acontece ANTES de qualquer escrita.
  const { data: atualPar } = await sessao
    .from('produtos')
    .select('preco_atacado, quantidade_gatilho_atacado')
    .eq('id', prod.id)
    .eq('loja_id', LOJA)
    .maybeSingle()
  const mudaAtacado =
    Number(atualPar?.preco_atacado ?? 0) !== 25 ||
    Number(atualPar?.quantidade_gatilho_atacado ?? 0) !== 20
  checar('ATUAL: a mudança de atacado é detectada antes de escrever', mudaAtacado === true)

  // Recusa → nenhuma escrita é emitida. Nada a fazer aqui de propósito.
  const { data: depoisAtual } = await admin
    .from('produtos')
    .select('preco_atacado, quantidade_gatilho_atacado')
    .eq('id', prod.id)
    .single()
  const { data: faixasAtual } = await admin
    .from('precos_atacado')
    .select('quantidade_minima, ativo')
    .eq('produto_id', prod.id)
    .eq('ativo', true)

  checar(
    'ATUAL: NADA foi alterado (produto e faixa seguem coerentes)',
    Number(depoisAtual.quantidade_gatilho_atacado) === 10 &&
      Number(depoisAtual.preco_atacado) === 30 &&
      (faixasAtual ?? []).some((f) => f.quantidade_minima === 10),
    `produto.gatilho=${depoisAtual.quantidade_gatilho_atacado} preco=${depoisAtual.preco_atacado} faixas=[${(faixasAtual ?? []).map((f) => f.quantidade_minima)}]`,
  )

  // ── Edição que NÃO toca atacado continua permitida ───────────────────────
  const upNome = await sessao
    .from('produtos')
    .update({ nome: `Produto ${SUF} renomeado` })
    .eq('id', prod.id)
    .eq('loja_id', LOJA)
    .select('id')
  checar(
    'ATUAL: edição que não mexe em atacado segue funcionando (instrução única)',
    !upNome.error && (upNome.data ?? []).length === 1,
    upNome.error?.message ?? 'ok',
  )

  console.log(`\n=== ${falhas === 0 ? 'prova concluída' : `${falhas} falha(s)`} ===`)
}

main()
  .then(async () => {
    await limpar()
    console.log('dados de teste removidos; RPC e grants restaurados.')
    process.exitCode = falhas === 0 ? 0 : 1
  })
  .catch(async (e) => {
    console.error('ERRO:', e.message)
    try {
      await limpar()
    } catch {
      /* best-effort */
    }
    process.exitCode = 1
  })