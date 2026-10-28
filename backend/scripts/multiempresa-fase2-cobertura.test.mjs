// Multiempresa Fase 2 — cobertura e isolamento A×B sobre o ESQUEMA REAL (todas as migrations em PGlite).
//  1. todas as migrations aplicam;
//  2. ENUMERAÇÃO: toda tabela de public tem guarda RESTRICTIVE `tenant_guard` (FOR ALL, authenticated,
//     USING e WITH CHECK via fp_*) ou está na lista de isentas com motivo — tabela nova sem guarda QUEBRA;
//  3. toda RPC SECURITY DEFINER executável por authenticated que recebe loja/entidade está envelopada,
//     e as restantes estão na lista de pendências com motivo — RPC nova sem decisão QUEBRA;
//  4. comportamento A×B (dono/gerente/operador de B não vê nem grava dados de A e vice-versa; RPCs negam);
//  5. ativação com limite de tentativas; vincular_usuario_loja; rollback limpa e reaplica.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { applyAllMigrations } from './lib/pglite-full-schema.mjs'

const ISENTAS = {
  empresas: 'raiz do tenant; policy própria por fp_empresas_do_usuario (fase 1)',
  usuario_vinculos: 'policy própria: o próprio usuário ou o DONO da empresa (fase 1)',
  plataforma_admins: 'operador da plataforma; sem acesso authenticated',
  pdv_dispositivos: 'só service_role (sync/ativação)',
  pdv_codigos_ativacao: 'só service_role (provisionamento)',
  pdv_ativacao_tentativas: 'só service_role (limite de ativação)',
  feature_flags: 'flags globais da plataforma, sem dado de cliente',
  tipos_movimento_estoque: 'catálogo técnico global (enum em tabela)',
  gtin_lookup_cache: 'cache público de GTIN, sem dado de cliente',
  sync_request_nonces: 'anti-replay técnico, só service_role',
  gerente_auth_attempts: 'rate-limit técnico por usuário',
  gerente_auth_rate_limits: 'rate-limit técnico por usuário',
  caixa_scan_telemetry_events: 'telemetria técnica do próprio usuário (sem loja_id)',
}

// RPCs DEF sem argumento de loja/entidade: revisadas uma a uma na fase 3 e marcadas com
// COMMENT 'Multiempresa revisado (...)'. Pendência nova aqui = decisão consciente com motivo.
const RPC_PENDENTES = {}

const E1 = 'e0000001-0000-4000-8000-000000000001'
const E2 = 'e0000002-0000-4000-8000-000000000002'
const LA = 'a0000001-0000-4000-8000-000000000001' // MATRIZ (cliente 1)
const LB = 'b0000001-0000-4000-8000-000000000001'
const U = {
  donoA: '10000000-0000-4000-8000-000000000001', gerA: '10000000-0000-4000-8000-000000000002',
  opA: '10000000-0000-4000-8000-000000000003', admin: '10000000-0000-4000-8000-000000000004',
  donoB: '20000000-0000-4000-8000-000000000001', gerB: '20000000-0000-4000-8000-000000000002',
  opB: '20000000-0000-4000-8000-000000000003',
}

let pass = 0
const t = async (nome, fn) => {
  try { await fn(); pass++; console.log(`ok - ${nome}`) } catch (e) { console.error(`not ok - ${nome}\n  ${e.stack ?? e}`); process.exitCode = 1 }
}

const { db, failed } = await applyAllMigrations()

await t('todas as migrations aplicam no esquema real (PGlite)', () => assert.deepEqual(failed, []))

const tabelas = (await db.query(`SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`)).rows.map((r) => r.t)
const guardas = new Map((await db.query(`SELECT c.relname AS t, p.polpermissive, p.polcmd, p.polroles::regrole[]::text[] AS roles,
    pg_get_expr(p.polqual, p.polrelid) AS q, pg_get_expr(p.polwithcheck, p.polrelid) AS w, c.relrowsecurity AS rls
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND p.polname = 'tenant_guard'`)).rows.map((r) => [r.t, r]))

await t(`enumeração: toda tabela de public (${tabelas.length}) tem tenant_guard ou isenção com motivo`, () => {
  const faltando = tabelas.filter((x) => !guardas.has(x) && !ISENTAS[x])
  assert.deepEqual(faltando, [], `tabelas SEM guarda e sem isenção: ${faltando.join(', ')}`)
  const isentasInexistentes = Object.keys(ISENTAS).filter((x) => !tabelas.includes(x))
  assert.deepEqual(isentasInexistentes, [], 'isenção para tabela inexistente (limpar lista)')
})

await t('enumeração: toda guarda é RESTRICTIVE, FOR ALL, authenticated, RLS ligada, USING e CHECK via fp_*', () => {
  for (const [tab, g] of guardas) {
    assert.equal(g.polpermissive, false, `${tab}: guarda não é RESTRICTIVE`)
    assert.equal(g.polcmd, '*', `${tab}: guarda não é FOR ALL`)
    assert.deepEqual(g.roles, ['authenticated'], `${tab}: roles`)
    assert.equal(g.rls, true, `${tab}: RLS desligada`)
    assert.match(g.q ?? '', /fp_/, `${tab}: USING sem fp_*`)
    assert.match(g.w ?? '', /fp_/, `${tab}: WITH CHECK sem fp_*`)
  }
})

await t('enumeração: nenhuma tabela com loja_id/empresa_id fica fora da guarda (exceto isentas)', async () => {
  const r = await db.query(`SELECT DISTINCT table_name AS t FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN ('loja_id', 'empresa_id')`)
  const soltas = r.rows.map((x) => x.t).filter((x) => tabelas.includes(x) && !guardas.has(x) && !ISENTAS[x])
  assert.deepEqual(soltas, [])
})

await t('enumeração: RPC SECURITY DEFINER exposta a authenticated está envelopada ou revisada (sem pendências)', async () => {
  const r = await db.query(`SELECT p.proname, coalesce(obj_description(p.oid, 'pg_proc'), '') AS c, p.prosrc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND p.proname !~ '^(fp_|auth_)'`)
  const soltas = r.rows.filter((x) => !x.c.startsWith('Envelope multiempresa') && !x.c.startsWith('Multiempresa revisado')
    && !RPC_PENDENTES[x.proname]).map((x) => x.proname)
  assert.deepEqual(soltas, [], `RPCs sem envelope nem pendência: ${soltas.join(', ')}`)
  for (const x of r.rows.filter((y) => y.c.startsWith('Envelope multiempresa'))) {
    assert.match(x.prosrc, /fp_assert_(loja|produto)/, `${x.proname}: envelope sem asserção`)
  }
  const nInternas = (await db.query(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'internal' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname IN (SELECT nome FROM internal.fp_rpc_envelopes)`)).rows[0].n
  assert.equal(nInternas, 0, 'corpo original em internal ainda executável por authenticated')
})

await t('transferir_estoque_seguro exige mesma empresa (P0)', async () => {
  const src = (await db.query(`SELECT prosrc FROM pg_proc WHERE proname = 'transferir_estoque_seguro' AND pronamespace = 'public'::regnamespace`)).rows[0].prosrc
  assert.match(src, /fp_assert_mesma_empresa/)
})

// ── Semente A×B ─────────────────────────────────────────────────────────────
await db.exec(`
  INSERT INTO public.categorias (nome) VALUES ('Cat legado A'); -- antes da 2ª empresa: vai para E1
  INSERT INTO public.empresas (id, nome) VALUES ('${E2}', 'Empresa B');
  INSERT INTO public.lojas (id, nome, empresa_id) VALUES ('${LB}', 'Loja B', '${E2}');
  INSERT INTO auth.users (id) SELECT unnest(ARRAY['${Object.values(U).join("','")}']::uuid[]);
  INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES
    ('${U.donoA}', 'Dono A', 'DONO', '${LA}'), ('${U.gerA}', 'Ger A', 'GERENTE', '${LA}'), ('${U.opA}', 'Op A', 'OPERADOR', '${LA}'),
    ('${U.donoB}', 'Dono B', 'DONO', '${LB}'), ('${U.gerB}', 'Ger B', 'GERENTE', '${LB}'), ('${U.opB}', 'Op B', 'OPERADOR', '${LB}');
  INSERT INTO public.produtos (id, nome, preco_varejo, origem, loja_id) VALUES
    ('c0000001-0000-4000-8000-000000000001', 'Prod A', 10, 'china_manual', '${LA}'),
    ('c0000002-0000-4000-8000-000000000002', 'Prod B', 20, 'china_manual', '${LB}');
  INSERT INTO public.clientes (nome, loja_id) VALUES ('Cli A', '${LA}'), ('Cli B', '${LB}');
  INSERT INTO public.fornecedores (nome, loja_id) VALUES ('For A', '${LA}'), ('For B', '${LB}');
  INSERT INTO public.caixas (id, loja_id) VALUES ('d0000001-0000-4000-8000-000000000001', '${LA}'), ('d0000002-0000-4000-8000-000000000002', '${LB}');
  INSERT INTO public.categorias (nome, empresa_id) VALUES ('Cat B', '${E2}');
`).catch((e) => { console.error('semente falhou:', e.message); process.exit(1) })

async function como(uid, fn) {
  await db.exec('BEGIN')
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true),
      set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [uid])
    await db.exec('SET LOCAL ROLE authenticated')
    return await fn()
  } finally { await db.exec('ROLLBACK') }
}
const col = async (uid, sql) => como(uid, async () => (await db.query(sql)).rows)
const nomes = async (uid, tab) => (await col(uid, `SELECT nome FROM public.${tab} ORDER BY 1`)).map((r) => r.nome)
const falha = async (uid, sql, re = /row-level security|ACESSO_|permission denied/) => {
  await assert.rejects(como(uid, () => db.query(sql)), re)
}

for (const tab of ['produtos', 'clientes', 'fornecedores', 'lojas']) {
  await t(`A×B leitura: ${tab}`, async () => {
    const a = await nomes(U.donoA, tab), b = await nomes(U.donoB, tab), gb = await nomes(U.gerB, tab), ob = await nomes(U.opB, tab)
    assert.ok(a.some((n) => / A$|Matriz/.test(n)) && !a.some((n) => / B$/.test(n)), `donoA vê ${a}`)
    for (const v of [b, gb, ob]) assert.ok(!v.some((n) => / A$|Matriz/.test(n)), `B vê A: ${v}`)
  })
}

await t('A×B leitura: catálogo de empresa (categorias) — legado vai para E1, B não vê', async () => {
  assert.deepEqual(await nomes(U.donoB, 'categorias'), ['Cat B'])
  assert.ok(!(await nomes(U.donoA, 'categorias')).includes('Cat B'))
  assert.ok((await nomes(U.donoA, 'categorias')).includes('Cat legado A'))
})

await t('A×B leitura: J (caixas→vendas) e usuarios', async () => {
  const cx = await col(U.gerB, `SELECT loja_id FROM public.caixas`)
  assert.ok(cx.every((r) => r.loja_id === LB))
  const us = (await col(U.donoB, `SELECT nome FROM public.usuarios ORDER BY 1`)).map((r) => r.nome)
  assert.ok(us.every((n) => / B$/.test(n)), `donoB vê usuários ${us}`)
})

await t('A×B escrita: B não insere/atualiza/apaga em loja de A', async () => {
  await falha(U.donoB, `INSERT INTO public.clientes (nome, loja_id) VALUES ('x', '${LA}')`)
  await falha(U.donoB, `INSERT INTO public.categorias (nome, empresa_id) VALUES ('x', '${E1}')`)
  const upd = await como(U.donoB, async () => (await db.query(`UPDATE public.produtos SET nome = 'hack' WHERE loja_id = '${LA}'`)).affectedRows)
  assert.equal(upd, 0)
  const del = await como(U.donoB, async () => (await db.query(`DELETE FROM public.fornecedores WHERE loja_id = '${LA}'`)).affectedRows)
  assert.equal(del, 0)
  await falha(U.donoB, `UPDATE public.produtos SET loja_id = '${LA}' WHERE loja_id = '${LB}'`)
})

await t('categoria sem empresa_id em insert do dono B cai na empresa B (trigger)', async () => {
  const r = await col(U.donoB, `INSERT INTO public.categorias (nome) VALUES ('nova') RETURNING empresa_id`)
  assert.equal(r[0].empresa_id, E2)
})

await t('servidor sem empresa_id com 2+ empresas: erro explícito (sem linha órfã)', async () => {
  await assert.rejects(db.query(`INSERT INTO public.marcas (nome) VALUES ('órfã')`), /EMPRESA_ID_OBRIGATORIA/)
})

// #623 (20261028110000): ADMIN descontinuado — não há mais perfil global (substitui o antigo "compat D9").
await t('ADMIN descontinuado: perfil recusado e usuário sem vínculo não vê nada de A nem de B', async () => {
  await assert.rejects(db.query(`INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES ('${U.admin}', 'Admin', 'ADMIN', '${LA}')`),
    /PERFIL_ADMIN_DESCONTINUADO/)
  assert.deepEqual(await nomes(U.admin, 'clientes'), [])
})

await t('RPC: B não consulta/opera loja de A (envelopes)', async () => {
  await falha(U.donoB, `SELECT * FROM public.listar_vendas_gerente(p_loja_id => '${LA}')`, /ACESSO_LOJA_NEGADO/)
  await falha(U.gerB, `SELECT public.calcular_valor_sistema_dinheiro_caixa('d0000001-0000-4000-8000-000000000001')`, /ACESSO_LOJA_NEGADO/)
  await falha(U.donoB, `SELECT * FROM public.listar_vendas_gerente(p_loja_id => NULL)`, /ACESSO_LOJA_OBRIGATORIA/)
})

await t('RPC: transferência entre empresas é negada mesmo com origem permitida', async () => {
  const args = (await db.query(`SELECT pg_get_function_identity_arguments(oid) a FROM pg_proc WHERE proname='transferir_estoque_seguro' AND pronamespace='public'::regnamespace`)).rows[0].a
  assert.match(args, /p_loja_origem/)
  await falha(U.donoB, `SELECT public.fp_assert_mesma_empresa('${LB}', '${LA}', 't')`, /ACESSO_EMPRESA_INVALIDA/)
  await falha(U.donoA, `SELECT public.fp_assert_loja('${LB}', true, 't')`, /ACESSO_LOJA_NEGADO/)
})

await t('vincular_usuario_loja: ator de B não vincula em loja de A; ator de A vincula', async () => {
  await assert.rejects(db.query(`SELECT public.vincular_usuario_loja('${U.opB}', '${LA}', 'OPERADOR', '${U.donoB}')`), /VINCULO_ATOR_SEM_ACESSO_LOJA/)
  await assert.rejects(db.query(`SELECT public.vincular_usuario_loja('${U.opB}', '${LA}', 'OPERADOR', '${U.donoA}')`), /VINCULO_USUARIO_DE_OUTRA_EMPRESA/)
  const r = await db.query(`SELECT public.vincular_usuario_loja('${U.opA}', '${LA}', 'OPERADOR', '${U.gerA}') AS id`)
  assert.ok(r.rows[0].id)
})

await t('fp_usuario_pode_loja: operador só na própria loja/empresa', async () => {
  const q = async (u, l) => (await db.query(`SELECT public.fp_usuario_pode_loja($1, $2) ok`, [u, l])).rows[0].ok
  assert.equal(await q(U.opA, LA), true); assert.equal(await q(U.opA, LB), false)
  assert.equal(await q(U.opB, LB), true); assert.equal(await q(U.donoB, LA), false)
})

await t('ativação v2: 10 falhas em 15 min bloqueiam o computador', async () => {
  for (let i = 0; i < 10; i++) {
    const r = (await db.query(`SELECT public.ativar_dispositivo_pdv_v2('ERRADO${i}', 'fp-teste-1234567890', NULL, '10.0.0.1') r`)).rows[0].r
    assert.equal(r.ok, false); assert.notEqual(r.error, 'ATIVACAO_PDV_BLOQUEADA')
  }
  const r = (await db.query(`SELECT public.ativar_dispositivo_pdv_v2('QUALQUER', 'fp-teste-1234567890', NULL, '10.0.0.9') r`)).rows[0].r
  assert.equal(r.error, 'ATIVACAO_PDV_BLOQUEADA')
  const ip = (await db.query(`SELECT public.ativar_dispositivo_pdv_v2('QUALQUER', 'outro-computador-123456', NULL, '10.0.0.1') r`)).rows[0].r
  assert.equal(ip.error, 'ATIVACAO_PDV_BLOQUEADA', 'mesmo IP também bloqueia')
})

await t('rollback remove guardas/envelopes, devolve as RPCs originais, e a migration reaplica', async () => {
  const rb = await readFile(new URL('../supabase/rollback/20261019140000_multiempresa_fase2_guardas.rollback.sql', import.meta.url), 'utf8')
  const mig = await readFile(new URL('../supabase/migrations/20261019140000_multiempresa_fase2_guardas.sql', import.meta.url), 'utf8')
  const rb3 = await readFile(new URL('../supabase/rollback/20261019150000_multiempresa_fase3_config.rollback.sql', import.meta.url), 'utf8')
  const mig3 = await readFile(new URL('../supabase/migrations/20261019150000_multiempresa_fase3_config.sql', import.meta.url), 'utf8')
  const rb4 = await readFile(new URL('../supabase/rollback/20261019160000_multiempresa_fase4_desempenho_guardas.rollback.sql', import.meta.url), 'utf8')
  const mig4 = await readFile(new URL('../supabase/migrations/20261019160000_multiempresa_fase4_desempenho_guardas.sql', import.meta.url), 'utf8')
  const nEnv = (await db.query(`SELECT count(*)::int n FROM internal.fp_rpc_envelopes`)).rows[0].n
  await db.exec(await readFile(new URL('../supabase/rollback/20261019170000_multiempresa_fase5_catalogo_empresa.rollback.sql', import.meta.url), 'utf8')) // fase 5 sai primeiro
  await db.exec(rb4) // depois a fase 4
  await db.exec(rb3) // fase 3 sai antes da fase 2
  await db.exec(rb)
  const g = (await db.query(`SELECT count(*)::int n FROM pg_policy WHERE polname = 'tenant_guard' AND polrelid::regclass::text NOT IN ('fornecedores','contas_receber','itens_venda')`)).rows[0].n
  assert.equal(g, 0)
  const pub = (await db.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'listar_vendas_gerente' AND pronamespace = 'public'::regnamespace AND has_function_privilege('authenticated', oid, 'EXECUTE')`)).rows[0].n
  assert.equal(pub, 1)
  const intern = (await db.query(`SELECT count(*)::int n FROM pg_proc WHERE pronamespace = 'internal'::regnamespace AND proname = 'listar_vendas_gerente'`)).rows[0].n
  assert.equal(intern, 0)
  assert.equal((await db.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'categorias' AND column_name = 'empresa_id'`)).rows[0].n, 0)
  await db.exec(mig)
  await db.exec(mig3)
  await db.exec(mig4)
  await db.exec(await readFile(new URL('../supabase/migrations/20261019170000_multiempresa_fase5_catalogo_empresa.sql', import.meta.url), 'utf8'))
  assert.equal((await db.query(`SELECT count(*)::int n FROM internal.fp_rpc_envelopes`)).rows[0].n, nEnv)
})

console.log(`\n${pass} testes ok${process.exitCode ? ' — HÁ FALHAS' : ''}`)
