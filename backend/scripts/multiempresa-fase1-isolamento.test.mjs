// Multiempresa Fase 1 — isolamento Empresa A × Empresa B (ESPEC_MULTIEMPRESA_V1 §7.3 / §14).
// Roda a migration real 20261019120000 em PGlite sobre um esquema mínimo com policies PERMISSIVE
// propositalmente amplas (simulam as 146 atuais): prova que a guarda RESTRICTIVE é a barreira.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const name = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
const { PGlite } = await import(name)

const MIG = await readFile(new URL('../supabase/migrations/20261019120000_multiempresa_fase1_base.sql', import.meta.url), 'utf8')
const RB = await readFile(new URL('../supabase/rollback/20261019120000_multiempresa_fase1_base.rollback.sql', import.meta.url), 'utf8')

const E1 = 'e0000001-0000-4000-8000-000000000001'
const MATRIZ = 'a0000001-0000-4000-8000-000000000001'
const FILIAL_A2 = 'a0000002-0000-4000-8000-000000000002'
const U = {
  donoA: '10000000-0000-4000-8000-000000000001',
  gerenteA1: '10000000-0000-4000-8000-000000000002',
  operadorA1: '10000000-0000-4000-8000-000000000003',
  adminLegado: '10000000-0000-4000-8000-000000000004',
  donoB: '20000000-0000-4000-8000-000000000001',
  gerenteB: '20000000-0000-4000-8000-000000000002',
  operadorB: '20000000-0000-4000-8000-000000000003',
}
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

const db = new PGlite()
await db.exec(`
  CREATE ROLE anon NOINHERIT; CREATE ROLE authenticated NOINHERIT; CREATE ROLE service_role NOINHERIT BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA internal; CREATE SCHEMA supabase_migrations;
  CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth, internal TO authenticated, service_role, anon;
  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

  CREATE TABLE public.lojas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, codigo text UNIQUE,
    ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.usuarios (id uuid PRIMARY KEY, nome text NOT NULL,
    perfil text NOT NULL CHECK (perfil IN ('OPERADOR','GERENTE','DONO','ADMIN')),
    idioma_preferido text NOT NULL DEFAULT 'pt', ativo boolean NOT NULL DEFAULT true,
    loja_id uuid REFERENCES public.lojas(id), created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.fornecedores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text, loja_id uuid NOT NULL REFERENCES public.lojas(id));
  CREATE TABLE public.contas_receber (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), valor numeric, loja_id uuid NOT NULL REFERENCES public.lojas(id));
  CREATE TABLE public.caixas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loja_id uuid NOT NULL REFERENCES public.lojas(id));
  CREATE TABLE public.vendas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), caixa_id uuid NOT NULL REFERENCES public.caixas(id));
  CREATE TABLE public.itens_venda (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venda_id uuid NOT NULL REFERENCES public.vendas(id), qtd int);

  -- PERMISSIVE amplas (pior caso): qualquer authenticated faz tudo.
  DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['lojas','usuarios','fornecedores','contas_receber','caixas','vendas','itens_venda'] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY ampla ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
      EXECUTE format('GRANT ALL ON public.%I TO authenticated, service_role', t);
    END LOOP; END $$;
  GRANT USAGE ON SCHEMA public TO authenticated, service_role, anon;

  INSERT INTO public.lojas (id, nome, codigo) VALUES ('${MATRIZ}', 'Matriz', 'MATRIZ'), ('${FILIAL_A2}', 'Filial', 'FILIAL');
  INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES
    ('${U.donoA}', 'Dono A', 'DONO', '${MATRIZ}'),
    ('${U.gerenteA1}', 'Gerente A1', 'GERENTE', '${MATRIZ}'),
    ('${U.operadorA1}', 'Operador A1', 'OPERADOR', '${MATRIZ}'),
    ('${U.adminLegado}', 'Admin e2e', 'ADMIN', NULL);
  INSERT INTO public.fornecedores (nome, loja_id) VALUES ('Forn A1', '${MATRIZ}'), ('Forn A2', '${FILIAL_A2}');
  INSERT INTO public.contas_receber (valor, loja_id) VALUES (10, '${MATRIZ}');
  INSERT INTO public.caixas (id, loja_id) VALUES ('c0000000-0000-4000-8000-00000000000a', '${MATRIZ}');
  INSERT INTO public.vendas (id, caixa_id) VALUES ('d0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a');
  INSERT INTO public.itens_venda (venda_id, qtd) VALUES ('d0000000-0000-4000-8000-00000000000a', 1);
`)

async function as(userId, fn) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`)
  try { return await fn() } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`) }
}
async function asService(fn) {
  await db.exec('SET ROLE service_role')
  try { return await fn() } finally { await db.exec('RESET ROLE') }
}
const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].n)
let passed = 0
async function t(label, fn) { await fn(); passed += 1; console.log(`ok - ${label}`) }

await db.exec(MIG)

await t('backfill: Empresa 1 com todas as lojas e vínculos derivados; ADMIN sem vínculo', async () => {
  assert.equal(await count(`SELECT count(*) n FROM lojas WHERE empresa_id = '${E1}'`), 2)
  const v = (await db.query(`SELECT usuario_id::text u, papel, loja_id::text l FROM usuario_vinculos ORDER BY papel`)).rows
  assert.deepEqual(v.map((r) => r.papel).sort(), ['DONO', 'GERENTE', 'OPERADOR'])
  assert.equal(v.find((r) => r.papel === 'DONO').l, null)
  assert.equal(await count(`SELECT count(*) n FROM usuario_vinculos WHERE usuario_id = '${U.adminLegado}'`), 0)
  assert.equal(await count('SELECT count(*) n FROM plataforma_admins'), 0)
})

await t('equivalência cliente 1: DONO A vê A1+A2; ADMIN legado mantém global', async () => {
  assert.equal(await as(U.donoA, () => count('SELECT count(*) n FROM fornecedores')), 2)
  assert.equal(await as(U.adminLegado, () => count('SELECT count(*) n FROM fornecedores')), 2)
  assert.equal(await as(U.gerenteA1, () => count('SELECT count(*) n FROM fornecedores')), 1)
  assert.equal(await as(U.operadorA1, () => count('SELECT count(*) n FROM itens_venda')), 1)
})

let lojaB1
await t('provisionamento atômico cria Empresa B, loja, DONO, GERENTE e OPERADOR', async () => {
  const payload = {
    empresa: { nome: 'Empresa B', cnpj: '12.345.678/0001-90', max_lojas: 3 },
    lojas: [{ chave: 'B1', nome: 'Loja B1', codigo: 'MATRIZ' }, { chave: 'B2', nome: 'Loja B2' }],
    usuarios: [
      { id: U.donoB, nome: 'Dono B', papel: 'DONO' },
      { id: U.gerenteB, nome: 'Gerente B', papel: 'GERENTE', lojas: ['B1', 'B2'] },
      { id: U.operadorB, nome: 'Operador B', papel: 'OPERADOR', lojas: ['B1'] },
    ],
  }
  const r = await asService(() => db.query('SELECT plataforma_provisionar_empresa($1::jsonb) r', [JSON.stringify(payload)]))
  lojaB1 = r.rows[0].r.lojas.B1
  assert.ok(lojaB1)
  assert.equal(await count(`SELECT count(*) n FROM usuario_vinculos WHERE usuario_id = '${U.gerenteB}' AND ativo`), 2)
  assert.equal((await db.query(`SELECT cnpj FROM empresas WHERE nome = 'Empresa B'`)).rows[0].cnpj, '12345678000190')
  assert.match((await db.query(`SELECT codigo FROM lojas WHERE id = $1`, [lojaB1])).rows[0].codigo, /^MATRIZ-/)
  await db.query(`INSERT INTO fornecedores (nome, loja_id) VALUES ('Forn B1', $1)`, [lojaB1])
  await db.query(`INSERT INTO caixas (id, loja_id) VALUES ('c0000000-0000-4000-8000-00000000000b', $1)`, [lojaB1])
  await db.query(`INSERT INTO vendas (id, caixa_id) VALUES ('d0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b')`)
  await db.query(`INSERT INTO itens_venda (venda_id, qtd) VALUES ('d0000000-0000-4000-8000-00000000000b', 7)`)
})

await t('provisionamento falha inteiro (rollback) quando um passo é inválido', async () => {
  const before = await count('SELECT count(*) n FROM empresas')
  const bad = { empresa: { nome: 'Empresa C' }, lojas: [{ chave: 'C1', nome: 'C1' }],
    usuarios: [{ id: U.donoA, nome: 'roubo', papel: 'DONO' }] }
  await assert.rejects(asService(() => db.query('SELECT plataforma_provisionar_empresa($1::jsonb)', [JSON.stringify(bad)])), /PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA/)
  assert.equal(await count('SELECT count(*) n FROM empresas'), before)
  assert.equal(await count(`SELECT count(*) n FROM lojas WHERE nome = 'C1'`), 0)
})

await t('authenticated não executa RPC de plataforma nem lê dispositivos', async () => {
  await assert.rejects(as(U.donoA, () => db.query(`SELECT plataforma_provisionar_empresa('{}'::jsonb)`)), /permission denied/)
  await assert.rejects(as(U.donoA, () => db.query(`SELECT ativar_dispositivo_pdv('X','y')`)), /permission denied/)
  await assert.rejects(as(U.donoA, () => db.query('SELECT * FROM pdv_dispositivos')), /permission denied/)
  await assert.rejects(as(U.donoA, () => db.query(`INSERT INTO usuario_vinculos (usuario_id, empresa_id, papel) VALUES ('${U.donoA}', '${E1}', 'DONO')`)), /permission denied/)
})

for (const [label, who, own] of [['DONO A', U.donoA, 2], ['GERENTE A1', U.gerenteA1, 1], ['OPERADOR A1', U.operadorA1, 1]]) {
  await t(`${label} × Empresa B: SELECT/INSERT/UPDATE/DELETE negados`, async () => {
    await as(who, async () => {
      assert.equal(await count('SELECT count(*) n FROM fornecedores'), own)
      assert.equal(await count('SELECT count(*) n FROM fornecedores WHERE loja_id = $1', [lojaB1]), 0)
      assert.equal(await count('SELECT count(*) n FROM itens_venda WHERE qtd = 7'), 0)
      await assert.rejects(db.query(`INSERT INTO fornecedores (nome, loja_id) VALUES ('x', $1)`, [lojaB1]), /row-level security/)
      await assert.rejects(db.query(`INSERT INTO contas_receber (valor, loja_id) VALUES (1, $1)`, [lojaB1]), /row-level security/)
      await assert.rejects(db.query(`INSERT INTO itens_venda (venda_id, qtd) VALUES ('d0000000-0000-4000-8000-00000000000b', 1)`), /row-level security/)
      assert.equal((await db.query(`UPDATE fornecedores SET nome = 'hack' WHERE loja_id = $1`, [lojaB1])).affectedRows, 0)
      assert.equal((await db.query(`DELETE FROM itens_venda WHERE qtd = 7`)).affectedRows, 0)
      // mover linha própria para outro tenant (WITH CHECK)
      await assert.rejects(db.query(`UPDATE fornecedores SET loja_id = $1 WHERE nome = 'Forn A1'`, [lojaB1]), /row-level security/)
      assert.equal(await count('SELECT count(*) n FROM empresas'), 1)
    })
  })
}

await t('Empresa B × Empresa A (sentido inverso) e GERENTE B multi-loja', async () => {
  await as(U.donoB, async () => {
    assert.equal(await count('SELECT count(*) n FROM fornecedores'), 1)
    assert.equal(await count('SELECT count(*) n FROM itens_venda'), 1)
    assert.equal(await count('SELECT count(*) n FROM contas_receber'), 0)
    assert.equal(await count('SELECT count(*) n FROM usuario_vinculos'), 4) // DONO B vê os da própria empresa
  })
  await as(U.gerenteB, async () => {
    assert.equal(await count('SELECT count(*) n FROM fp_lojas_permitidas()'), 2)
    assert.equal(await count('SELECT count(*) n FROM usuario_vinculos'), 2) // só os próprios
  })
  await as(U.operadorB, async () => {
    assert.equal(await count('SELECT count(*) n FROM itens_venda'), 1)
    assert.equal(await count(`SELECT count(*) n FROM fornecedores WHERE loja_id = '${MATRIZ}'`), 0)
  })
})

await t('fail closed: sem sessão, usuário inativo, vínculo inativo', async () => {
  assert.equal(await as(null, () => count('SELECT count(*) n FROM fornecedores')), 0)
  await db.query(`UPDATE usuarios SET ativo = false WHERE id = $1`, [U.operadorB])
  assert.equal(await as(U.operadorB, () => count('SELECT count(*) n FROM itens_venda')), 0)
  await db.query(`UPDATE usuarios SET ativo = true WHERE id = $1`, [U.operadorB])
  await db.query(`UPDATE usuario_vinculos SET ativo = false WHERE usuario_id = $1`, [U.operadorB])
  assert.equal(await as(U.operadorB, () => count('SELECT count(*) n FROM itens_venda')), 0)
})

await t('trigger legado: troca de loja do OPERADOR move o vínculo', async () => {
  await db.query(`UPDATE usuarios SET loja_id = $1 WHERE id = $2`, [FILIAL_A2, U.operadorA1])
  const rows = (await db.query(`SELECT loja_id::text l FROM usuario_vinculos WHERE usuario_id = $1 AND ativo`, [U.operadorA1])).rows
  assert.deepEqual(rows.map((r) => r.l), [FILIAL_A2])
})

await t('ativação PDV: código de uso único, hash no banco, segredo por dispositivo amarrado à loja', async () => {
  const code = 'K7QX-M2PA-9D'
  await asService(() => db.query('SELECT plataforma_registrar_codigo_ativacao_pdv($1, $2, 24)', [lojaB1, sha('K7QXM2PA9D')]))
  assert.equal(await count(`SELECT count(*) n FROM pdv_codigos_ativacao WHERE codigo_hash = $1`, [sha('K7QXM2PA9D')]), 1)
  const r = (await asService(() => db.query('SELECT ativar_dispositivo_pdv($1, $2, $3) r', [` ${code.toLowerCase()} `, 'Desktop-Caixa-01', 'Caixa 1']))).rows[0].r
  assert.equal(r.loja_id, lojaB1)
  assert.equal(r.device_fingerprint, 'desktop-caixa-01')
  assert.ok(r.sync_key.length >= 48)
  await assert.rejects(asService(() => db.query('SELECT ativar_dispositivo_pdv($1, $2)', [code, 'outro-pc'])), /ATIVACAO_PDV_CODIGO_INVALIDO/)
  await asService(() => db.query('SELECT plataforma_registrar_codigo_ativacao_pdv($1, $2, 1)', [lojaB1, sha('EXPIRADO1')]))
  await db.query(`UPDATE pdv_codigos_ativacao SET expira_em = now() - interval '1 minute' WHERE codigo_hash = $1`, [sha('EXPIRADO1')])
  await assert.rejects(asService(() => db.query('SELECT ativar_dispositivo_pdv($1, $2)', ['EXPIRADO1', 'pc-x'])), /ATIVACAO_PDV_CODIGO_INVALIDO/)
  // reativar o mesmo PC revoga o segredo anterior
  await asService(() => db.query('SELECT plataforma_registrar_codigo_ativacao_pdv($1, $2, 1)', [lojaB1, sha('REATIVA01')]))
  await asService(() => db.query('SELECT ativar_dispositivo_pdv($1, $2)', ['REATIVA01', 'desktop-caixa-01']))
  assert.equal(await count(`SELECT count(*) n FROM pdv_dispositivos WHERE device_fingerprint = 'desktop-caixa-01' AND ativo`), 1)
  await db.query(`UPDATE empresas SET status = 'SUSPENSA' WHERE nome = 'Empresa B'`)
  await assert.rejects(asService(() => db.query('SELECT plataforma_registrar_codigo_ativacao_pdv($1, $2, 1)', [lojaB1, sha('SUSP0001')])), /EMPRESA_NAO_OPERACIONAL/)
  await db.query(`UPDATE empresas SET status = 'ATIVA' WHERE nome = 'Empresa B'`)
})

await t('rollback remove tudo e a migration reaplica (idempotente)', async () => {
  await db.exec(RB)
  assert.equal(await count(`SELECT count(*) n FROM information_schema.columns WHERE table_name = 'lojas' AND column_name = 'empresa_id'`), 0)
  assert.equal(await count(`SELECT count(*) n FROM pg_policies WHERE policyname = 'tenant_guard'`), 0)
  assert.equal(await as(U.donoA, () => count('SELECT count(*) n FROM fornecedores')), 3) // volta ao comportamento anterior
  await db.exec(MIG)
  await db.exec(MIG)
  assert.equal(await count(`SELECT count(*) n FROM pg_policies WHERE policyname = 'tenant_guard'`), 3)
})

console.log(`\n${passed} testes multiempresa-fase1 OK`)
await db.close()
