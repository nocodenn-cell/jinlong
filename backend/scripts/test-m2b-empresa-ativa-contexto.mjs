#!/usr/bin/env node
/**
 * M2-B F1–F2 — PostgreSQL local (PGlite): empresa ativa, RLS, concorrência, revogação.
 * Dados sintéticos. Sem rede. Sem produção.
 */
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIG_M1 = path.join(
  ROOT,
  'supabase/migrations-experimental-m1/20261009000000_m1_fundacao_multiempresa.sql',
)
const MIG_M2 = path.join(
  ROOT,
  'supabase/migrations-experimental-m1/20261009100000_m2b_empresa_ativa_contexto.sql',
)
const ARTIFACT = '/opt/cursor/artifacts/m2b-contexto-resultado.json'

const E_A = 'e1000001-0000-4000-8000-000000000001'
const E_B = 'e2000002-0000-4000-8000-000000000002'
const L_A1 = 'a1000001-0000-4000-8000-000000000001'
const L_A2 = 'a2000002-0000-4000-8000-000000000002'
const L_B1 = 'b1000001-0000-4000-8000-000000000001'
const U_A = '11111111-1111-4111-8111-111111111111'
const U_B = '22222222-2222-4222-8222-222222222222'
const U_DUAL = '33333333-3333-4333-8333-333333333333'
const U_NONE = '44444444-4444-4444-8444-444444444444'

const results = []

function rec(id, pass, detail) {
  results.push({ id, resultado: pass ? 'PASS' : 'FAIL', detail })
  assert.ok(pass, `${id}: ${detail}`)
}

async function bootstrap(db) {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
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
      loja_id uuid NOT NULL REFERENCES public.lojas(id),
      operador_id uuid REFERENCES public.usuarios(id),
      status text NOT NULL DEFAULT 'ABERTO'
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
  await db.exec(readFileSync(MIG_M1, 'utf8'))
  await db.exec(readFileSync(MIG_M2, 'utf8'))
}

async function forceRls(db) {
  await db.exec(`
    ALTER TABLE public.produtos FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.clientes FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.contas_receber FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.caixas FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.usuario_contexto_ativo FORCE ROW LEVEL SECURITY;
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
    await db.query(`SELECT set_config('request.fp.empresa_id', '', false)`)
  }
}

async function seed(db) {
  await db.query(
    `INSERT INTO public.lojas (id, codigo, nome) VALUES
      ($1,'A1','A1'), ($2,'A2','A2'), ($3,'B1','B1')`,
    [L_A1, L_A2, L_B1],
  )
  await db.query(
    `INSERT INTO public.usuarios (id, loja_id, perfil, ativo) VALUES
      ($1,$2,'OPERADOR',true), ($3,$4,'OPERADOR',true),
      ($5,$2,'GERENTE',true), ($6,$2,'OPERADOR',true)`,
    [U_A, L_A1, U_B, L_B1, U_DUAL, U_NONE],
  )
  await db.query(
    `INSERT INTO public.empresas (id, nome) VALUES ($1,'B') ON CONFLICT DO NOTHING`,
    [E_B],
  )
  await db.query(`UPDATE public.lojas SET empresa_id = $1 WHERE id IN ($2,$3)`, [E_A, L_A1, L_A2])
  await db.query(`UPDATE public.lojas SET empresa_id = $1 WHERE id = $2`, [E_B, L_B1])
  await db.exec(`DELETE FROM public.usuario_vinculos`)
  await db.query(
    `INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo) VALUES
      ($1,$2,$3,'OPERADOR',true),
      ($4,$5,$6,'OPERADOR',true),
      ($7,$2,$3,'GERENTE',true),
      ($7,$5,$6,'GERENTE',true)`,
    [U_A, E_A, L_A1, U_B, E_B, L_B1, U_DUAL],
  )
  const pA = randomUUID()
  const pB = randomUUID()
  await db.query(
    `INSERT INTO public.produtos (id, loja_id, nome) VALUES ($1,$2,'PA'), ($3,$4,'PB')`,
    [pA, L_A1, pB, L_B1],
  )
  await forceRls(db)
  return { pA, pB }
}

test('M2-B F1–F2 contexto seguro', async () => {
  const db = new PGlite()
  await bootstrap(db)
  const ids = await seed(db)

  // Dual sem contexto → 0 lojas / não lê produtos
  await asUser(db, U_DUAL, async () => {
    const ativa = await db.query(`SELECT public.fp_empresa_ativa() AS e`)
    const lojas = await db.query(`SELECT count(*)::int AS n FROM public.fp_lojas_permitidas(NULL)`)
    const prods = await db.query(`SELECT count(*)::int AS n FROM public.produtos`)
    rec(
      'F2-dual-sem-ativa',
      ativa.rows[0].e == null && lojas.rows[0].n === 0 && prods.rows[0].n === 0,
      `e=${ativa.rows[0].e}; lojas=${lojas.rows[0].n}; prods=${prods.rows[0].n}`,
    )
  })

  // Single empresa auto
  await asUser(db, U_A, async () => {
    const ativa = await db.query(`SELECT public.fp_empresa_ativa() AS e`)
    const prods = await db.query(`SELECT loja_id FROM public.produtos`)
    rec(
      'F1-single-auto',
      ativa.rows[0].e === E_A && prods.rows.length === 1 && prods.rows[0].loja_id === L_A1,
      `e=${ativa.rows[0].e}; n=${prods.rows.length}`,
    )
  })

  // Set empresa A no dual → só A
  await asUser(db, U_DUAL, async () => {
    const set = await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, NULL) AS r`, [
      E_A,
      L_A1,
    ])
    rec('F2-set-A', set.rows[0].r?.ok === true, JSON.stringify(set.rows[0].r))
    const prods = await db.query(`SELECT loja_id FROM public.produtos`)
    rec(
      'F2-dual-com-A',
      prods.rows.length === 1 && prods.rows[0].loja_id === L_A1,
      `n=${prods.rows.length}`,
    )
  })

  // Troca para B
  await asUser(db, U_DUAL, async () => {
    await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, NULL)`, [E_B, L_B1])
    const prods = await db.query(`SELECT loja_id FROM public.produtos`)
    rec(
      'F2-troca-B',
      prods.rows.length === 1 && prods.rows[0].loja_id === L_B1,
      `loja=${prods.rows[0]?.loja_id}`,
    )
  })

  // Assert consistente / divergente
  await asUser(db, U_DUAL, async () => {
    await db.query(`SELECT public.fp_assert_contexto_consistente($1::uuid)`, [E_B])
    let diverged = false
    try {
      await db.query(`SELECT public.fp_assert_contexto_consistente($1::uuid)`, [E_A])
    } catch (e) {
      diverged = String(e.message).includes('EMPRESA_DIVERGENTE')
    }
    rec('F2-assert-divergente', diverged, 'request atrasada')
  })

  // Empresa do cliente adulterada
  await asUser(db, U_A, async () => {
    let denied = false
    try {
      await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, NULL, NULL)`, [E_B])
    } catch (e) {
      denied = String(e.message).includes('EMPRESA_NAO_AUTORIZADA')
    }
    rec('F1-adulteracao-empresa', denied, 'set B como A')
  })

  // Loja de outra empresa
  await asUser(db, U_DUAL, async () => {
    await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, NULL)`, [E_A, L_A1])
    let denied = false
    try {
      await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, NULL)`, [E_A, L_B1])
    } catch (e) {
      denied = String(e.message).includes('LOJA_FORA_DA_EMPRESA')
    }
    rec('F1-loja-fora-empresa', denied, 'A+L_B1')
  })

  // Sem vínculo
  await asUser(db, U_NONE, async () => {
    const ativa = await db.query(`SELECT public.fp_empresa_ativa() AS e`)
    const prods = await db.query(`SELECT count(*)::int AS n FROM public.produtos`)
    rec('F1-sem-vinculo', ativa.rows[0].e == null && prods.rows[0].n === 0, 'none')
  })

  // Revogação de vínculo → contexto órfão
  await asUser(db, U_DUAL, async () => {
    await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, NULL)`, [E_A, L_A1])
  })
  await db.exec(`RESET ROLE`)
  await db.query(
    `UPDATE public.usuario_vinculos SET ativo = false
     WHERE usuario_id = $1 AND empresa_id = $2`,
    [U_DUAL, E_A],
  )
  await asUser(db, U_DUAL, async () => {
    const ativa = await db.query(`SELECT public.fp_empresa_ativa() AS e`)
    const prods = await db.query(`SELECT count(*)::int AS n FROM public.produtos`)
    // ainda tem vínculo B ativo, mas contexto aponta A revogado → null; dual? only B left → auto B
    rec(
      'F2-revogacao-A',
      ativa.rows[0].e === E_B && prods.rows[0].n === 1,
      `e=${ativa.rows[0].e}; n=${prods.rows[0].n}`,
    )
  })
  await db.exec(`RESET ROLE`)
  await db.query(
    `UPDATE public.usuario_vinculos SET ativo = true
     WHERE usuario_id = $1 AND empresa_id = $2`,
    [U_DUAL, E_A],
  )

  // Caixa aberto bloqueia troca
  await asUser(db, U_DUAL, async () => {
    await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, NULL)`, [E_A, L_A1])
  })
  await db.exec(`RESET ROLE`)
  await db.query(
    `INSERT INTO public.caixas (loja_id, operador_id, status) VALUES ($1,$2,'ABERTO')`,
    [L_A1, U_DUAL],
  )
  await asUser(db, U_DUAL, async () => {
    let blocked = false
    try {
      await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, NULL)`, [E_B, L_B1])
    } catch (e) {
      blocked = String(e.message).includes('CAIXA_ABERTO_BLOQUEIA_TROCA')
    }
    rec('F2-caixa-aberto', blocked, 'troca A→B')
  })
  await db.exec(`RESET ROLE`)
  await db.query(`UPDATE public.caixas SET status = 'FECHADO' WHERE operador_id = $1`, [U_DUAL])

  // Version conflict (duas abas)
  await asUser(db, U_DUAL, async () => {
    const r1 = await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, NULL) AS r`, [
      E_A,
      L_A1,
    ])
    const ver = Number(r1.rows[0].r.version)
    await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, NULL)`, [E_A, L_A1])
    let conflict = false
    try {
      await db.query(`SELECT public.fp_set_empresa_ativa($1::uuid, $2::uuid, $3::bigint)`, [
        E_B,
        L_B1,
        ver,
      ])
    } catch (e) {
      conflict = String(e.message).includes('CONTEXTO_VERSION_CONFLITO')
    }
    rec('F2-version-race', conflict, `stale version ${ver}`)
  })

  // GUC adulterada
  await asUser(db, U_A, async () => {
    await db.query(`SELECT set_config('request.fp.empresa_id', $1, false)`, [E_B])
    const ativa = await db.query(`SELECT public.fp_empresa_ativa() AS e`)
    rec('F1-guc-adulterada', ativa.rows[0].e == null, `e=${ativa.rows[0].e}`)
  })

  // ADMIN perfil sem plataforma não escala
  await db.exec(`RESET ROLE`)
  await db.query(`UPDATE public.usuarios SET perfil = 'ADMIN' WHERE id = $1`, [U_A])
  await asUser(db, U_A, async () => {
    const podeB = await db.query(`SELECT public.fp_pode_loja($1::uuid, NULL) AS p`, [L_B1])
    rec('F3-admin-sem-escalonamento', podeB.rows[0].p === false, `podeB=${podeB.rows[0].p}`)
  })

  mkdirSync('/opt/cursor/artifacts', { recursive: true })
  writeFileSync(
    ARTIFACT,
    JSON.stringify(
      {
        suite: 'test-m2b-empresa-ativa-contexto',
        summary: {
          total: results.length,
          pass: results.filter((r) => r.resultado === 'PASS').length,
          fail: results.filter((r) => r.resultado === 'FAIL').length,
        },
        results,
        ids,
      },
      null,
      2,
    ),
  )
  await db.close()
})
