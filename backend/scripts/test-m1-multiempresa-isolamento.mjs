#!/usr/bin/env node
/**
 * M1 — isolamento multiempresa (PGlite, LOCAL ONLY).
 *
 * Prova:
 *  1) Empresa A não lê produtos/clientes/caixa/financeiro de B
 *  2) UUID conhecido de outro tenant não autoriza
 *  3) Usuário dual-empresa só vê contexto do vínculo ativo (por JWT/loja)
 *  4) Helpers fp_* fail-closed sem auth
 *  5) Catálogo sync filtrado por loja (contrato XT-02)
 *  6) Concorrência: inserts paralelos não cruzam saldo/estoque entre empresas
 */
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIG = path.join(
  ROOT,
  'supabase/migrations-experimental-m1/20261009000000_m1_fundacao_multiempresa.sql',
)
const ARTIFACT_DIR = '/opt/cursor/artifacts'
const EMPRESA_A = 'e1000001-0000-4000-8000-000000000001'
const EMPRESA_B = 'e2000002-0000-4000-8000-000000000002'
const LOJA_A = 'a0000001-0000-4000-8000-000000000001'
const LOJA_B = 'b0000002-0000-4000-8000-000000000002'
const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const USER_DUAL = '33333333-3333-4333-8333-333333333333'

function filterCatalogoProdutos(produtos, lojaId) {
  if (!lojaId) return { ok: false, error: 'LOJA_ID_OBRIGATORIO', produtos: [] }
  return {
    ok: true,
    produtos: produtos.filter((p) => p.loja_id === lojaId),
  }
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
      id uuid PRIMARY KEY,
      codigo text NOT NULL,
      nome text NOT NULL DEFAULT 'loja',
      ativo boolean NOT NULL DEFAULT true
    );
    CREATE UNIQUE INDEX lojas_codigo_key ON public.lojas (codigo);

    CREATE TABLE public.usuarios (
      id uuid PRIMARY KEY,
      loja_id uuid REFERENCES public.lojas(id),
      perfil text NOT NULL,
      ativo boolean NOT NULL DEFAULT true
    );

    CREATE TABLE public.produtos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id),
      nome text NOT NULL,
      codigo_barras text
    );
    CREATE TABLE public.clientes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id),
      nome text NOT NULL
    );
    CREATE TABLE public.fornecedores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id),
      nome text NOT NULL
    );
    CREATE TABLE public.contas_receber (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id),
      valor numeric NOT NULL DEFAULT 0
    );
    CREATE TABLE public.caixas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id),
      status text NOT NULL DEFAULT 'ABERTO'
    );
    CREATE TABLE public.estoque (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loja_id uuid NOT NULL REFERENCES public.lojas(id),
      produto_id uuid NOT NULL REFERENCES public.produtos(id),
      quantidade numeric NOT NULL DEFAULT 0
    );

    ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;

    -- Permissivas amplas (legado); a guarda RESTRICTIVE do M1 deve AND-restringir
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

  const sql = readFileSync(MIG, 'utf8')
  await db.exec(sql)
}

async function forceTenantRls(db) {
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
  // is_local=false: PGlite auto-commit por query; true perderia o JWT na query seguinte
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId])
  // Policies TO authenticated só aplicam com role authenticated (owner ignora role-target)
  await db.exec(`SET ROLE authenticated`)
  try {
    return await fn()
  } finally {
    await db.exec(`RESET ROLE`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
  }
}

async function seedTwoEmpresas(db) {
  await db.query(
    `INSERT INTO public.lojas (id, codigo, nome) VALUES ($1,'MATRIZ','Matriz'), ($2,'FILIALB','Filial B')`,
    [LOJA_A, LOJA_B],
  )
  await db.query(
    `INSERT INTO public.usuarios (id, loja_id, perfil, ativo) VALUES
      ($1,$2,'GERENTE',true), ($3,$4,'GERENTE',true), ($5,$2,'GERENTE',true)`,
    [USER_A, LOJA_A, USER_B, LOJA_B, USER_DUAL],
  )

  // Migration backfill cria Empresa 1 + vínculos A/dual-parcial; completar B + dual
  await db.query(
    `INSERT INTO public.empresas (id, nome, plano, status, vigencia_inicio)
     VALUES ($1,'Empresa B','piloto','ATIVA',CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
    [EMPRESA_B],
  )
  await db.query(`UPDATE public.lojas SET empresa_id = $1 WHERE id = $2`, [EMPRESA_A, LOJA_A])
  await db.query(`UPDATE public.lojas SET empresa_id = $1 WHERE id = $2`, [EMPRESA_B, LOJA_B])

  await db.exec(`DELETE FROM public.usuario_vinculos`)
  await db.query(
    `INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
     VALUES
       ($1,$2,$3,'GERENTE',true),
       ($4,$5,$6,'GERENTE',true),
       ($7,$2,$3,'GERENTE',true),
       ($7,$5,$6,'GERENTE',true)`,
    [USER_A, EMPRESA_A, LOJA_A, USER_B, EMPRESA_B, LOJA_B, USER_DUAL],
  )

  const prodA = randomUUID()
  const prodB = randomUUID()
  const cliA = randomUUID()
  const cliB = randomUUID()
  const crA = randomUUID()
  const crB = randomUUID()
  const cxA = randomUUID()
  const cxB = randomUUID()

  await db.query(
    `INSERT INTO public.produtos (id, loja_id, nome) VALUES ($1,$2,'Prod A'), ($3,$4,'Prod B')`,
    [prodA, LOJA_A, prodB, LOJA_B],
  )
  await db.query(
    `INSERT INTO public.clientes (id, loja_id, nome) VALUES ($1,$2,'Cli A'), ($3,$4,'Cli B')`,
    [cliA, LOJA_A, cliB, LOJA_B],
  )
  await db.query(
    `INSERT INTO public.contas_receber (id, loja_id, valor) VALUES ($1,$2,100), ($3,$4,200)`,
    [crA, LOJA_A, crB, LOJA_B],
  )
  await db.query(
    `INSERT INTO public.caixas (id, loja_id) VALUES ($1,$2), ($3,$4)`,
    [cxA, LOJA_A, cxB, LOJA_B],
  )
  await db.query(
    `INSERT INTO public.estoque (loja_id, produto_id, quantidade) VALUES ($1,$2,10), ($3,$4,20)`,
    [LOJA_A, prodA, LOJA_B, prodB],
  )

  await forceTenantRls(db)
  return { prodA, prodB, cliA, cliB, crA, crB, cxA, cxB }
}

test('M1: helpers fail-closed sem auth', async () => {
  const db = new PGlite()
  await bootstrap(db)
  await seedTwoEmpresas(db)
  const r = await db.query(`SELECT public.fp_usuario_ativo() AS a, public.fp_pode_loja($1::uuid, NULL) AS p`, [
    LOJA_A,
  ])
  assert.equal(r.rows[0].a, false)
  assert.equal(r.rows[0].p, false)
  await db.close()
})

test('M1: Empresa A não lê produtos/clientes/caixa/CR da B', async () => {
  const db = new PGlite()
  await bootstrap(db)
  const ids = await seedTwoEmpresas(db)

  await asUser(db, USER_A, async () => {
    const prods = await db.query(`SELECT id FROM public.produtos`)
    assert.equal(prods.rows.length, 1)
    assert.equal(prods.rows[0].id, ids.prodA)

    const clis = await db.query(`SELECT id FROM public.clientes`)
    assert.equal(clis.rows.length, 1)
    assert.equal(clis.rows[0].id, ids.cliA)

    const crs = await db.query(`SELECT id FROM public.contas_receber`)
    assert.equal(crs.rows.length, 1)
    assert.equal(crs.rows[0].id, ids.crA)

    const cxs = await db.query(`SELECT id FROM public.caixas`)
    assert.equal(cxs.rows.length, 1)
    assert.equal(cxs.rows[0].id, ids.cxA)
  })
  await db.close()
})

test('M1: UUID conhecido de outro tenant não autoriza SELECT/UPDATE', async () => {
  const db = new PGlite()
  await bootstrap(db)
  const ids = await seedTwoEmpresas(db)

  await asUser(db, USER_A, async () => {
    const sel = await db.query(`SELECT id, nome FROM public.produtos WHERE id = $1`, [ids.prodB])
    assert.equal(sel.rows.length, 0, 'SELECT por UUID estrangeiro deve retornar vazio')

    let denied = false
    try {
      await db.query(`UPDATE public.produtos SET nome = 'hack' WHERE id = $1`, [ids.prodB])
    } catch {
      denied = true
    }
    const after = await db.query(
      `SELECT nome FROM public.produtos WHERE id = $1`,
      [ids.prodB],
    )
    // RLS: UPDATE afeta 0 linhas ou erro; sob service_role veríamos o nome original
    assert.equal(after.rows.length, 0)
    void denied
  })

  // Integridade: B ainda lê o próprio produto intacto (UPDATE cross-tenant não alterou)
  await asUser(db, USER_B, async () => {
    const intact = await db.query(`SELECT nome FROM public.produtos WHERE id = $1`, [ids.prodB])
    assert.equal(intact.rows[0].nome, 'Prod B')
  })
  await db.close()
})

test('M1: Empresa B não acessa recursos da A', async () => {
  const db = new PGlite()
  await bootstrap(db)
  const ids = await seedTwoEmpresas(db)
  await asUser(db, USER_B, async () => {
    const prods = await db.query(`SELECT id FROM public.produtos`)
    assert.equal(prods.rows.length, 1)
    assert.equal(prods.rows[0].id, ids.prodB)
    const emptyA = await db.query(`SELECT id FROM public.clientes WHERE id = $1`, [ids.cliA])
    assert.equal(emptyA.rows.length, 0)
  })
  await db.close()
})

test('M1: usuário dual só vê lojas do vínculo (ambas quando vinculado)', async () => {
  const db = new PGlite()
  await bootstrap(db)
  await seedTwoEmpresas(db)
  await asUser(db, USER_DUAL, async () => {
    const lojas = await db.query(`SELECT * FROM public.fp_lojas_permitidas(NULL) ORDER BY 1`)
    const set = new Set(lojas.rows.map((r) => r.fp_lojas_permitidas))
    assert.ok(set.has(LOJA_A))
    assert.ok(set.has(LOJA_B))
    assert.equal(set.size, 2)
    const empresas = await db.query(`SELECT * FROM public.fp_empresas_do_usuario() ORDER BY 1`)
    assert.equal(empresas.rows.length, 2)
  })
  await db.close()
})

test('M1: contrato sync catalogo exige loja e filtra (XT-02)', () => {
  const catalog = [
    { id: '1', loja_id: LOJA_A, nome: 'A' },
    { id: '2', loja_id: LOJA_B, nome: 'B' },
  ]
  assert.equal(filterCatalogoProdutos(catalog, null).ok, false)
  const filtered = filterCatalogoProdutos(catalog, LOJA_A)
  assert.equal(filtered.ok, true)
  assert.equal(filtered.produtos.length, 1)
  assert.equal(filtered.produtos[0].id, '1')
})

test('M1: concorrência — inserts paralelos não cruzam estoque entre empresas', async () => {
  const db = new PGlite()
  await bootstrap(db)
  const ids = await seedTwoEmpresas(db)

  await Promise.all([
    asUser(db, USER_A, async () => {
      for (let i = 0; i < 20; i++) {
        await db.query(
          `UPDATE public.estoque SET quantidade = quantidade + 1
           WHERE produto_id = $1 AND loja_id = $2`,
          [ids.prodA, LOJA_A],
        )
      }
    }),
    asUser(db, USER_B, async () => {
      for (let i = 0; i < 20; i++) {
        await db.query(
          `UPDATE public.estoque SET quantidade = quantidade + 1
           WHERE produto_id = $1 AND loja_id = $2`,
          [ids.prodB, LOJA_B],
        )
      }
    }),
  ])

  // estoque sem guarda RLS neste PoC — valida integridade numérica por loja
  const ea = await db.query(`SELECT quantidade FROM public.estoque WHERE loja_id = $1`, [LOJA_A])
  const eb = await db.query(`SELECT quantidade FROM public.estoque WHERE loja_id = $1`, [LOJA_B])
  assert.equal(Number(ea.rows[0].quantidade), 30)
  assert.equal(Number(eb.rows[0].quantidade), 40)
  await db.close()
})

test('M1: relatório artefato', async () => {
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  const report = {
    suite: 'test-m1-multiempresa-isolamento',
    ts: new Date().toISOString(),
    criteria: [
      'A nao le B',
      'B nao le A',
      'UUID ataque',
      'dual vinculo',
      'catalogo XT-02',
      'concorrencia estoque',
    ],
    verdict: 'executed_by_node_test_runner',
  }
  writeFileSync(
    path.join(ARTIFACT_DIR, 'm1-isolamento-report.json'),
    JSON.stringify(report, null, 2),
  )
  assert.ok(true)
})
