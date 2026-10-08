#!/usr/bin/env node
/**
 * Gate M1→M2 — matriz de testes negativos (PGlite = Postgres local isolado).
 * Dados 100% sintéticos. Sem rede. Sem produção.
 *
 * Cenários (Frente C):
 *  C1 Empresa A / loja A1 / operador A
 *  C2 Empresa A / loja A2 / operador A2
 *  C3 Empresa B / loja B1 / operador B
 *  C4 Usuário dual (A+B)
 *  C5 Usuário sem vínculo
 *  C6 Sessão sem auth / sem empresa
 *  C7 Manipulação de IDs (empresa/loja) em INSERT/UPDATE
 *  C8 Acesso cruzado + contrato sync
 */
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIG = path.join(
  ROOT,
  'supabase/migrations-experimental-m1/20261009000000_m1_fundacao_multiempresa.sql',
)
const ARTIFACT = '/opt/cursor/artifacts/m1-matriz-negativa.json'

const E_A = 'e1000001-0000-4000-8000-000000000001'
const E_B = 'e2000002-0000-4000-8000-000000000002'
const L_A1 = 'a1000001-0000-4000-8000-000000000001'
const L_A2 = 'a2000002-0000-4000-8000-000000000002'
const L_B1 = 'b1000001-0000-4000-8000-000000000001'
const U_A1 = '11111111-1111-4111-8111-111111111111'
const U_A2 = '12121212-1212-4121-8121-121212121212'
const U_B1 = '22222222-2222-4222-8222-222222222222'
const U_DUAL = '33333333-3333-4333-8333-333333333333'
const U_NONE = '44444444-4444-4444-8444-444444444444'

const results = []

function record(id, esperado, observado, pass, evidencia) {
  results.push({ id, esperado, observado, resultado: pass ? 'PASS' : 'FAIL', evidencia })
  assert.ok(pass, `${id}: esperado=${esperado} observado=${observado}`)
}

function filterCatalogo(produtos, lojaId) {
  if (!lojaId) return { ok: false, error: 'LOJA_ID_OBRIGATORIO', produtos: [] }
  return { ok: true, produtos: produtos.filter((p) => p.loja_id === lojaId) }
}

async function bootstrap(db) {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    CREATE TABLE public.lojas (
      id uuid PRIMARY KEY, codigo text NOT NULL, nome text NOT NULL DEFAULT 'loja',
      ativo boolean NOT NULL DEFAULT true
    );
    CREATE UNIQUE INDEX lojas_codigo_key ON public.lojas (codigo);
    CREATE TABLE public.usuarios (
      id uuid PRIMARY KEY, loja_id uuid REFERENCES public.lojas(id),
      perfil text NOT NULL, ativo boolean NOT NULL DEFAULT true
    );
    CREATE TABLE public.produtos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id), nome text NOT NULL
    );
    CREATE TABLE public.clientes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id), nome text NOT NULL
    );
    CREATE TABLE public.fornecedores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id), nome text NOT NULL
    );
    CREATE TABLE public.contas_receber (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id), valor numeric NOT NULL DEFAULT 0
    );
    CREATE TABLE public.caixas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id), status text NOT NULL DEFAULT 'ABERTO'
    );
    ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;
    CREATE POLICY produtos_perm ON public.produtos FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
    CREATE POLICY clientes_perm ON public.clientes FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
    CREATE POLICY fornecedores_perm ON public.fornecedores FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
    CREATE POLICY cr_perm ON public.contas_receber FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
    CREATE POLICY caixas_perm ON public.caixas FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
      TO authenticated, service_role;
  `)
  await db.exec(readFileSync(MIG, 'utf8'))
}

async function forceRls(db) {
  await db.exec(`
    ALTER TABLE public.produtos FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.clientes FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.fornecedores FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.contas_receber FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.caixas FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.empresas FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.usuario_vinculos FORCE ROW LEVEL SECURITY;
  `)
}

async function asUser(db, userId, fn) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId])
  await db.exec(`SET ROLE authenticated`)
  try {
    return await fn()
  } finally {
    await db.exec(`RESET ROLE`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
  }
}

async function seed(db) {
  await db.query(
    `INSERT INTO public.lojas (id, codigo, nome) VALUES
      ($1,'A1','Loja A1'), ($2,'A2','Loja A2'), ($3,'B1','Loja B1')`,
    [L_A1, L_A2, L_B1],
  )
  await db.query(
    `INSERT INTO public.usuarios (id, loja_id, perfil, ativo) VALUES
      ($1,$2,'OPERADOR',true), ($3,$4,'OPERADOR',true), ($5,$6,'OPERADOR',true),
      ($7,$2,'GERENTE',true), ($8,$2,'OPERADOR',true)`,
    [U_A1, L_A1, U_A2, L_A2, U_B1, L_B1, U_DUAL, U_NONE],
  )
  await db.query(
    `INSERT INTO public.empresas (id, nome, plano, status, vigencia_inicio)
     VALUES ($1,'Empresa B','piloto','ATIVA',CURRENT_DATE) ON CONFLICT DO NOTHING`,
    [E_B],
  )
  await db.query(`UPDATE public.lojas SET empresa_id = $1 WHERE id IN ($2,$3)`, [E_A, L_A1, L_A2])
  await db.query(`UPDATE public.lojas SET empresa_id = $1 WHERE id = $2`, [E_B, L_B1])
  await db.exec(`DELETE FROM public.usuario_vinculos`)
  await db.query(
    `INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo) VALUES
      ($1,$2,$3,'OPERADOR',true),
      ($4,$2,$5,'OPERADOR',true),
      ($6,$7,$8,'OPERADOR',true),
      ($9,$2,$3,'GERENTE',true),
      ($9,$7,$8,'GERENTE',true)`,
    [U_A1, E_A, L_A1, U_A2, L_A2, U_B1, E_B, L_B1, U_DUAL],
  )

  const ids = {
    pA1: randomUUID(),
    pA2: randomUUID(),
    pB1: randomUUID(),
    cA1: randomUUID(),
    cB1: randomUUID(),
  }
  await db.query(
    `INSERT INTO public.produtos (id, loja_id, nome) VALUES
      ($1,$2,'Prod A1'), ($3,$4,'Prod A2'), ($5,$6,'Prod B1')`,
    [ids.pA1, L_A1, ids.pA2, L_A2, ids.pB1, L_B1],
  )
  await db.query(
    `INSERT INTO public.clientes (id, loja_id, nome) VALUES ($1,$2,'Cli A1'), ($3,$4,'Cli B1')`,
    [ids.cA1, L_A1, ids.cB1, L_B1],
  )
  await db.query(
    `INSERT INTO public.contas_receber (loja_id, valor) VALUES ($1,10), ($2,20), ($3,30)`,
    [L_A1, L_A2, L_B1],
  )
  await db.query(`INSERT INTO public.caixas (loja_id) VALUES ($1), ($2), ($3)`, [L_A1, L_A2, L_B1])
  await forceRls(db)
  return ids
}

test('matriz negativa C1–C8', async () => {
  const db = new PGlite()
  await bootstrap(db)
  const ids = await seed(db)

  // C1: operador A1 só A1
  await asUser(db, U_A1, async () => {
    const prods = await db.query(`SELECT loja_id FROM public.produtos ORDER BY nome`)
    const lojas = prods.rows.map((r) => r.loja_id)
    record(
      'C1-SELECT-produtos',
      'somente L_A1',
      lojas.join(','),
      lojas.length === 1 && lojas[0] === L_A1,
      `rows=${prods.rows.length}`,
    )
    const cross = await db.query(`SELECT id FROM public.produtos WHERE id = $1`, [ids.pB1])
    record('C1-UUID-B', '0 rows', String(cross.rows.length), cross.rows.length === 0, 'SELECT uuid B')
  })

  // C2: operador A2 só A2 (mesma empresa, outra loja)
  await asUser(db, U_A2, async () => {
    const prods = await db.query(`SELECT loja_id FROM public.produtos`)
    record(
      'C2-SELECT-A2-nao-A1',
      'somente L_A2',
      prods.rows.map((r) => r.loja_id).join(','),
      prods.rows.length === 1 && prods.rows[0].loja_id === L_A2,
      'isolamento intra-empresa por loja',
    )
    const a1 = await db.query(`SELECT id FROM public.produtos WHERE id = $1`, [ids.pA1])
    record('C2-UUID-A1', '0 rows', String(a1.rows.length), a1.rows.length === 0, 'cross-loja mesma empresa')
  })

  // C3: operador B
  await asUser(db, U_B1, async () => {
    const prods = await db.query(`SELECT loja_id FROM public.produtos`)
    record(
      'C3-SELECT-B',
      'somente L_B1',
      prods.rows.map((r) => r.loja_id).join(','),
      prods.rows.length === 1 && prods.rows[0].loja_id === L_B1,
      'tenant B',
    )
    const cr = await db.query(`SELECT loja_id FROM public.contas_receber`)
    record(
      'C3-CR-B',
      'somente L_B1',
      cr.rows.map((r) => r.loja_id).join(','),
      cr.rows.length === 1 && cr.rows[0].loja_id === L_B1,
      'financeiro',
    )
  })

  // C4: dual — helpers expõem ambas (lacuna de sessão ativa documentada)
  await asUser(db, U_DUAL, async () => {
    const lojas = await db.query(`SELECT * FROM public.fp_lojas_permitidas(NULL)`)
    const set = new Set(lojas.rows.map((r) => r.fp_lojas_permitidas))
    record(
      'C4-helpers-multi',
      'A1+B1 (ambas; sem seletor de empresa ativa no DB)',
      [...set].sort().join(','),
      set.has(L_A1) && set.has(L_B1) && set.size === 2,
      'ESPEC §9 exige fail-closed na sessão app — NÃO implementado no M1 DB',
    )
    const prods = await db.query(`SELECT loja_id FROM public.produtos ORDER BY 1`)
    record(
      'C4-RLS-ve-ambas',
      'vê A1 e B1 (risco até sessão única)',
      prods.rows.map((r) => r.loja_id).sort().join(','),
      prods.rows.length === 2,
      'P0 residual: dual sem empresa ativa',
    )
  })

  // C5: sem vínculo
  await asUser(db, U_NONE, async () => {
    const pode = await db.query(`SELECT public.fp_pode_loja($1::uuid, NULL) AS p`, [L_A1])
    const prods = await db.query(`SELECT id FROM public.produtos`)
    record(
      'C5-sem-vinculo',
      'fp_pode_loja=false e 0 produtos',
      `pode=${pode.rows[0].p}; n=${prods.rows.length}`,
      pode.rows[0].p === false && prods.rows.length === 0,
      'fail closed',
    )
  })

  // C6: sem auth
  {
    const ativo = await db.query(`SELECT public.fp_usuario_ativo() AS a`)
    const pode = await db.query(`SELECT public.fp_pode_loja($1::uuid, NULL) AS p`, [L_A1])
    const empresas = await db.query(`SELECT count(*)::int AS n FROM public.fp_empresas_do_usuario()`)
    record(
      'C6-sem-auth',
      'ativo=false; pode=false; empresas=0',
      `a=${ativo.rows[0].a}; p=${pode.rows[0].p}; e=${empresas.rows[0].n}`,
      ativo.rows[0].a === false && pode.rows[0].p === false && empresas.rows[0].n === 0,
      'contexto ausente',
    )
  }

  // C7: manipulação de IDs — INSERT produto na loja B como operador A
  await asUser(db, U_A1, async () => {
    let denied = false
    try {
      await db.query(`INSERT INTO public.produtos (loja_id, nome) VALUES ($1, 'hack')`, [L_B1])
    } catch {
      denied = true
    }
    const countB = await db.query(
      `SELECT count(*)::int AS n FROM public.produtos WHERE loja_id = $1 AND nome = 'hack'`,
      [L_B1],
    )
    // sob RLS: WITH CHECK falha → exception ou 0 rows visíveis; owner check after reset
    record(
      'C7-INSERT-cross-loja',
      'INSERT negado (exception ou 0 efeito)',
      `denied=${denied}`,
      denied === true,
      'WITH CHECK fp_pode_loja',
    )
    void countB
  })

  // C7b: UPDATE loja_id para outra empresa
  await asUser(db, U_A1, async () => {
    let denied = false
    try {
      await db.query(`UPDATE public.produtos SET loja_id = $1 WHERE id = $2`, [L_B1, ids.pA1])
    } catch {
      denied = true
    }
    const still = await db.query(`SELECT loja_id FROM public.produtos WHERE id = $1`, [ids.pA1])
    record(
      'C7-UPDATE-move-tenant',
      'UPDATE negado; produto permanece em A1',
      `denied=${denied}; loja=${still.rows[0]?.loja_id}`,
      denied === true && still.rows[0]?.loja_id === L_A1,
      'WITH CHECK impede move cross-tenant',
    )
  })

  // C7c: DELETE produto B como A
  await asUser(db, U_A1, async () => {
    await db.query(`DELETE FROM public.produtos WHERE id = $1`, [ids.pB1])
    // 0 rows affected expected
  })
  await asUser(db, U_B1, async () => {
    const still = await db.query(`SELECT id FROM public.produtos WHERE id = $1`, [ids.pB1])
    record(
      'C7-DELETE-cross',
      'produto B intacto',
      `n=${still.rows.length}`,
      still.rows.length === 1,
      'DELETE RLS',
    )
  })

  // C8: sync catalog contract
  const catalog = [
    { id: '1', loja_id: L_A1 },
    { id: '2', loja_id: L_B1 },
  ]
  const noLoja = filterCatalogo(catalog, null)
  const aOnly = filterCatalogo(catalog, L_A1)
  const forgedB = filterCatalogo(catalog, L_B1)
  record(
    'C8-sync-sem-loja',
    'ok=false LOJA_ID_OBRIGATORIO',
    JSON.stringify(noLoja),
    noLoja.ok === false,
    'fail closed',
  )
  record(
    'C8-sync-filtra-A',
    '1 produto A',
    String(aOnly.produtos.length),
    aOnly.ok && aOnly.produtos.length === 1 && aOnly.produtos[0].id === '1',
    'filtro loja',
  )
  record(
    'C8-sync-header-B-sem-auth-dispositivo',
    'filtra B (header ainda é autoridade — P0 residual XT-02 parcial)',
    String(forgedB.produtos.length),
    forgedB.produtos.length === 1,
    'mitigação parcial: exige loja mas confia no header',
  )

  // C8b: service_role bypass (simulado: RESET ROLE + sem FORCE para role bypass)
  await db.exec(`RESET ROLE`)
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
  // Com FORCE, owner still subject; document BYPASSRLS attribute exists on service_role
  const bypassAttr = await db.query(
    `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'`,
  )
  record(
    'C8-service-role-bypassrls',
    'rolbypassrls=true (caminho privilegiado documentado)',
    String(bypassAttr.rows[0]?.rolbypassrls),
    bypassAttr.rows[0]?.rolbypassrls === true,
    'Server Actions/Edge com service_role ignoram RLS',
  )

  mkdirSync('/opt/cursor/artifacts', { recursive: true })
  writeFileSync(
    ARTIFACT,
    JSON.stringify(
      {
        suite: 'test-m1-matriz-negativa',
        engine: 'PGlite (Postgres isolado local)',
        ts: new Date().toISOString(),
        summary: {
          total: results.length,
          pass: results.filter((r) => r.resultado === 'PASS').length,
          fail: results.filter((r) => r.resultado === 'FAIL').length,
        },
        results,
      },
      null,
      2,
    ),
  )
  await db.close()
})
