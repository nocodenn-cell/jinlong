import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const name = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
const { PGlite } = await import(name)

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const LOJA_A = id(1)
const LOJA_B = id(2)
const OP_A = id(3)
const OP_B = id(4)
const GER_A = id(5)
const GER_B = id(6)
const DONO_A = id(7)
const ADMIN = id(8)
const CAIXA_A = id(9)
const CAIXA_B = id(10)
const VENDA_A = id(11)
const VENDA_B = id(12)
const DOC_A = id(13)
const DOC_B = id(14)
const JUST = 'Cancelamento de teste local com mais de quinze caracteres'

const migrationUrl = new URL(
  '../supabase/migrations/20261009220000_fiscal_rpc_isola_loja.sql',
  import.meta.url,
)

function extractCreate(sql, functionName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}`
  const start = sql.indexOf(marker)
  if (start < 0) throw new Error(`função ausente no histórico: ${functionName}`)
  const end = sql.indexOf('\n$$;', start)
  if (end < 0) throw new Error(`fim ausente: ${functionName}`)
  return sql.slice(start, end + 4)
}

async function loadHistorical(db) {
  const reprocess = await readFile(
    new URL('../supabase/migrations/20260806135429_307_d3_reaper_fiscal_em_processamento.sql', import.meta.url),
    'utf8',
  )
  const enqueue = await readFile(
    new URL('../supabase/migrations/20260819220100_fase1b_fiscal_enfileirar_assinatura_unica.sql', import.meta.url),
    'utf8',
  )
  const cancel = await readFile(
    new URL('./fixtures/fiscal_cancelar_documento.pre-isolamento.sql', import.meta.url),
    'utf8',
  )
  const evento = await readFile(
    new URL('../supabase/migrations/090_fiscal_enqueue_on_conflict_and_erro_enqueue_evento.sql', import.meta.url),
    'utf8',
  )
  const bodies = [
    extractCreate(reprocess, 'fiscal_reprocessar_documento'),
    extractCreate(cancel, 'fiscal_cancelar_documento'),
    extractCreate(enqueue, 'fiscal_enfileirar_documento_venda'),
    extractCreate(evento, 'fiscal_registrar_evento_enqueue_erro'),
  ]
  for (const body of bodies) {
    await db.exec(body)
  }
  await db.exec(`
    ALTER FUNCTION public.fiscal_reprocessar_documento(uuid) OWNER TO postgres;
    ALTER FUNCTION public.fiscal_cancelar_documento(uuid, text) OWNER TO postgres;
    ALTER FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) OWNER TO postgres;
    ALTER FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) OWNER TO postgres;
    GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_cancelar_documento(uuid, text) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO authenticated, service_role;
  `)
}

function messageOf(error) {
  return error?.message ?? String(error)
}

async function expectReject(run, pattern) {
  try {
    await run()
    throw new Error(`esperava rejeição ${pattern}`)
  } catch (error) {
    if (messageOf(error).startsWith('esperava rejeição')) throw error
    assert.match(messageOf(error), pattern)
  }
}

const db = new PGlite()
try {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    CREATE ROLE anon NOINHERIT;
    CREATE ROLE authenticator SUPERUSER NOINHERIT;
    CREATE ROLE authenticated NOINHERIT;
    CREATE ROLE service_role NOINHERIT;
    GRANT authenticated, service_role TO authenticator;
    CREATE TABLE lojas(id uuid PRIMARY KEY);
    CREATE TABLE usuarios(id uuid PRIMARY KEY, perfil text, loja_id uuid, ativo boolean);
    CREATE TABLE caixas(id uuid PRIMARY KEY, loja_id uuid);
    CREATE TABLE vendas(
      id uuid PRIMARY KEY,
      caixa_id uuid,
      operador_id uuid,
      tipo_venda text
    );
    CREATE TABLE documentos_fiscais_pendentes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid,
      tipo_doc text,
      status text,
      payload jsonb,
      ultimo_erro text,
      tentativas integer NOT NULL DEFAULT 0,
      proxima_tentativa_em timestamptz,
      fiscal_error_code text,
      fiscal_error_category text,
      fiscal_action_hint text,
      fiscal_retryable boolean,
      fiscal_next_step_url text,
      fiscal_error_payload jsonb,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX idx_doc_fiscal_unique_venda_tipo
      ON documentos_fiscais_pendentes (venda_id, tipo_doc)
      WHERE status <> 'CANCELADO';
    CREATE TABLE documentos_fiscais_dlq(documento_id uuid, venda_id uuid);
    CREATE TABLE documentos_fiscais_eventos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      documento_id uuid,
      evento_tipo text,
      status_antes text,
      status_depois text,
      actor_user_id uuid,
      actor_role text,
      origem_acao text,
      payload jsonb
    );
    INSERT INTO lojas VALUES ('${LOJA_A}'), ('${LOJA_B}');
    INSERT INTO usuarios VALUES
      ('${OP_A}', 'OPERADOR', '${LOJA_A}', true),
      ('${OP_B}', 'OPERADOR', '${LOJA_B}', true),
      ('${GER_A}', 'GERENTE', '${LOJA_A}', true),
      ('${GER_B}', 'GERENTE', '${LOJA_B}', true),
      ('${DONO_A}', 'DONO', '${LOJA_A}', true),
      ('${ADMIN}', 'ADMIN', NULL, true);
    INSERT INTO caixas VALUES ('${CAIXA_A}', '${LOJA_A}'), ('${CAIXA_B}', '${LOJA_B}');
    INSERT INTO vendas VALUES
      ('${VENDA_A}', '${CAIXA_A}', '${OP_A}', 'NFCE'),
      ('${VENDA_B}', '${CAIXA_B}', '${OP_B}', 'NFCE');
    INSERT INTO documentos_fiscais_pendentes (id, venda_id, tipo_doc, status, tentativas, ultimo_erro)
      VALUES
        ('${DOC_A}', '${VENDA_A}', 'NFC_E_STUB', 'ERRO', 2, 'falha A'),
        ('${DOC_B}', '${VENDA_B}', 'NFC_E_STUB', 'ERRO', 4, 'falha B');
    INSERT INTO documentos_fiscais_dlq VALUES ('${DOC_B}', '${VENDA_B}');
  `)

  await loadHistorical(db)

  async function asPostgres() {
    await db.exec('RESET ROLE')
    await db.exec('SET SESSION AUTHORIZATION postgres')
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
    await db.query(`SELECT set_config('request.jwt.claim.role', '', false)`)
  }

  async function asSession(uid, jwtRole, dbRole) {
    await asPostgres()
    await db.exec('SET SESSION AUTHORIZATION authenticator')
    await db.exec(`SET ROLE ${dbRole}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
    await db.query(`SELECT set_config('request.jwt.claim.role', $1, false)`, [jwtRole])
  }

  async function asUser(uid) {
    await asSession(uid, 'authenticated', 'authenticated')
  }

  async function asService() {
    await asSession('', 'service_role', 'service_role')
  }

  async function statusOf(docId) {
    await asPostgres()
    const row = await db.query('SELECT status FROM documentos_fiscais_pendentes WHERE id = $1', [docId])
    return row.rows[0].status
  }

  async function dlqCount(docId) {
    await asPostgres()
    const row = await db.query(
      'SELECT count(*)::int AS n FROM documentos_fiscais_dlq WHERE documento_id = $1',
      [docId],
    )
    return row.rows[0].n
  }

  await db.exec(`
    CREATE FUNCTION public._probe_identity()
    RETURNS TABLE(cur text, sess text)
    LANGUAGE sql SECURITY DEFINER SET search_path = public
    AS $fn$ SELECT current_user::text, session_user::text $fn$;
    ALTER FUNCTION public._probe_identity() OWNER TO postgres;
    GRANT EXECUTE ON FUNCTION public._probe_identity() TO authenticated;
  `)
  await asUser(OP_A)
  const identity = (await db.query('SELECT * FROM public._probe_identity()')).rows[0]
  assert.equal(identity.cur, 'postgres', 'current_user dentro de SECURITY DEFINER é o dono')
  assert.equal(identity.sess, 'authenticator', 'session_user continua sendo quem autenticou')

  await asPostgres()
  await db.exec(`
    DELETE FROM documentos_fiscais_eventos;
    DELETE FROM documentos_fiscais_dlq;
    DELETE FROM documentos_fiscais_pendentes;
    INSERT INTO documentos_fiscais_pendentes (id, venda_id, tipo_doc, status, tentativas, ultimo_erro)
      VALUES
        ('${DOC_A}', '${VENDA_A}', 'NFC_E_STUB', 'ERRO', 2, 'falha A'),
        ('${DOC_B}', '${VENDA_B}', 'NFC_E_STUB', 'ERRO', 4, 'falha B');
    INSERT INTO documentos_fiscais_dlq VALUES ('${DOC_B}', '${VENDA_B}');
  `)

  await asUser(OP_A)
  await db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B])
  assert.equal(await statusOf(DOC_B), 'PENDENTE')
  assert.equal(await dlqCount(DOC_B), 0)
  console.log('ANTES: OPERADOR da loja A reprocessou documento ERRO da loja B e esvaziou a DLQ')

  await asPostgres()
  await db.exec(`
    UPDATE documentos_fiscais_pendentes
       SET status = 'ERRO', tentativas = 4, ultimo_erro = 'falha B'
     WHERE id = '${DOC_B}';
    INSERT INTO documentos_fiscais_dlq VALUES ('${DOC_B}', '${VENDA_B}');
  `)

  await asUser(OP_A)
  const enqueued = await db.query(
    `SELECT fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb)::text AS id`,
    [VENDA_B],
  )
  assert.ok(enqueued.rows[0].id)
  console.log('ANTES: OPERADOR da loja A enfileirou NFCE da venda da loja B')

  await asUser(GER_A)
  await db.query('SELECT fiscal_cancelar_documento($1, $2)', [DOC_B, JUST])
  assert.equal(await statusOf(DOC_B), 'CANCELADO')
  console.log('ANTES: GERENTE da loja A cancelou documento da loja B')

  await asUser(OP_A)
  await db.query('SELECT fiscal_registrar_evento_enqueue_erro($1, $2, $3, $4::jsonb)', [
    VENDA_A,
    'NFC_E_STUB',
    'erro alheio',
    '{}',
  ])
  await asPostgres()
  const eventosAntes = await db.query(
    `SELECT count(*)::int AS n FROM documentos_fiscais_eventos
      WHERE documento_id = $1 AND evento_tipo = 'ERRO_ENQUEUE' AND origem_acao = 'caixa_web_enqueue'`,
    [DOC_A],
  )
  // DOC_A pertence à loja A; o furo é gravar em documento de outra loja.
  await asUser(OP_A)
  await db.query('SELECT fiscal_registrar_evento_enqueue_erro($1, $2, $3, $4::jsonb)', [
    VENDA_B,
    'NFCE',
    'trilha da outra loja',
    '{}',
  ])
  await asPostgres()
  const eventosB = await db.query(
    `SELECT count(*)::int AS n FROM documentos_fiscais_eventos e
      JOIN documentos_fiscais_pendentes d ON d.id = e.documento_id
      WHERE d.venda_id = $1 AND e.evento_tipo = 'ERRO_ENQUEUE'`,
    [VENDA_B],
  )
  assert.ok(eventosAntes.rows[0].n >= 0)
  assert.equal(eventosB.rows[0].n, 1)
  console.log('ANTES: OPERADOR da loja A gravou evento fiscal na venda da loja B')

  await asPostgres()
  await db.exec(await readFile(migrationUrl, 'utf8'))
  await db.exec(await readFile(migrationUrl, 'utf8'))
  await db.exec(`
    DELETE FROM documentos_fiscais_eventos;
    DELETE FROM documentos_fiscais_dlq;
    DELETE FROM documentos_fiscais_pendentes;
    INSERT INTO documentos_fiscais_pendentes (id, venda_id, tipo_doc, status, tentativas, ultimo_erro)
      VALUES
        ('${DOC_A}', '${VENDA_A}', 'NFC_E_STUB', 'ERRO', 2, 'falha A'),
        ('${DOC_B}', '${VENDA_B}', 'NFC_E_STUB', 'ERRO', 4, 'falha B');
    INSERT INTO documentos_fiscais_dlq VALUES ('${DOC_B}', '${VENDA_B}');
  `)

  await asUser(OP_A)
  await expectReject(
    () => db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B]),
    /FISCAL_REPROCESSO_PERFIL/,
  )
  assert.equal(await statusOf(DOC_B), 'ERRO')
  assert.equal(await dlqCount(DOC_B), 1)

  await asUser(GER_A)
  await expectReject(
    () => db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B]),
    /FISCAL_REPROCESSO_LOJA/,
  )
  await asUser(DONO_A)
  await expectReject(
    () => db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B]),
    /FISCAL_REPROCESSO_LOJA/,
  )
  assert.equal(await statusOf(DOC_B), 'ERRO')

  await asUser(GER_B)
  await db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B])
  assert.equal(await statusOf(DOC_B), 'PENDENTE')
  assert.equal(await dlqCount(DOC_B), 0)

  await asPostgres()
  await db.exec(`
    UPDATE documentos_fiscais_pendentes
       SET status = 'ERRO', tentativas = 4, ultimo_erro = 'falha B'
     WHERE id = '${DOC_B}';
    INSERT INTO documentos_fiscais_dlq VALUES ('${DOC_B}', '${VENDA_B}');
  `)
  await asUser(ADMIN)
  await db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B])
  assert.equal(await statusOf(DOC_B), 'PENDENTE')

  await asPostgres()
  await db.exec(`UPDATE documentos_fiscais_pendentes SET status = 'ERRO' WHERE id = '${DOC_A}'`)
  await asUser(GER_A)
  await db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_A])
  assert.equal(await statusOf(DOC_A), 'PENDENTE')

  await asUser(OP_A)
  await expectReject(
    () => db.query(`SELECT fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb)`, [VENDA_B]),
    /FISCAL_ENQUEUE_PERMISSAO/,
  )
  await asUser(GER_A)
  await expectReject(
    () => db.query(`SELECT fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb)`, [VENDA_B]),
    /FISCAL_ENQUEUE_PERMISSAO/,
  )
  await asUser(OP_A)
  const propria = await db.query(
    `SELECT fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb)::text AS id`,
    [VENDA_A],
  )
  assert.ok(propria.rows[0].id)
  await asUser(GER_A)
  const gerentePropria = await db.query(
    `SELECT fiscal_enfileirar_documento_venda($1, 'NFE', '{}'::jsonb)::text AS id`,
    [VENDA_A],
  )
  assert.ok(gerentePropria.rows[0].id)
  await asUser(DONO_A)
  await expectReject(
    () => db.query(`SELECT fiscal_enfileirar_documento_venda($1, 'NFE', '{}'::jsonb)`, [VENDA_B]),
    /FISCAL_ENQUEUE_PERMISSAO/,
  )
  const donoPropria = await db.query(
    `SELECT fiscal_enfileirar_documento_venda($1, 'NFE', '{}'::jsonb)::text AS id`,
    [VENDA_A],
  )
  assert.ok(donoPropria.rows[0].id)

  await asPostgres()
  await db.exec(`UPDATE vendas SET tipo_venda = 'SEM_NF' WHERE id = '${VENDA_A}'`)
  await asUser(OP_A)
  await expectReject(
    () => db.query(`SELECT fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb)`, [VENDA_A]),
    /FISCAL_ENQUEUE_VENDA_SEM_NF/,
  )
  await asPostgres()
  await db.exec(`UPDATE vendas SET tipo_venda = 'NFCE' WHERE id = '${VENDA_A}'`)

  await asService()
  await expectReject(
    () => db.query(
      `SELECT fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb, $2)`,
      [VENDA_B, LOJA_A],
    ),
    /FISCAL_ENQUEUE_LOJA_DIVERGENTE/,
  )
  const serviceOk = await db.query(
    `SELECT fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb, $2)::text AS id`,
    [VENDA_B, LOJA_B],
  )
  assert.ok(serviceOk.rows[0].id)

  await asPostgres()
  await db.exec(`
    UPDATE documentos_fiscais_pendentes SET status = 'EMITIDO', deleted_at = NULL WHERE id = '${DOC_B}';
  `)
  await asUser(GER_A)
  await expectReject(
    () => db.query('SELECT fiscal_cancelar_documento($1, $2)', [DOC_B, JUST]),
    /FISCAL_CANCELAR_LOJA/,
  )
  assert.equal(await statusOf(DOC_B), 'EMITIDO')
  await asUser(OP_A)
  await expectReject(
    () => db.query('SELECT fiscal_cancelar_documento($1, $2)', [DOC_A, JUST]),
    /FISCAL_CANCELAR_FORBIDDEN/,
  )
  await asUser(GER_B)
  await db.query('SELECT fiscal_cancelar_documento($1, $2)', [DOC_B, JUST])
  assert.equal(await statusOf(DOC_B), 'CANCELADO')
  await asPostgres()
  await db.exec(`UPDATE documentos_fiscais_pendentes SET status = 'EMITIDO' WHERE id = '${DOC_A}'`)
  await asUser(ADMIN)
  await db.query('SELECT fiscal_cancelar_documento($1, $2)', [DOC_A, JUST])
  assert.equal(await statusOf(DOC_A), 'CANCELADO')

  await asPostgres()
  await db.exec(`
    UPDATE documentos_fiscais_pendentes SET status = 'PENDENTE', deleted_at = NULL WHERE id = '${DOC_A}';
    DELETE FROM documentos_fiscais_eventos;
  `)
  await asUser(OP_A)
  await expectReject(
    () => db.query('SELECT fiscal_registrar_evento_enqueue_erro($1, $2, $3, $4::jsonb)', [
      VENDA_B, 'NFCE', 'nao pode', '{}',
    ]),
    /FISCAL_ENQUEUE_ERRO_EVENTO_AUTH/,
  )
  await db.query('SELECT fiscal_registrar_evento_enqueue_erro($1, $2, $3, $4::jsonb)', [
    VENDA_A, 'NFCE', 'erro da propria venda', '{}',
  ])
  await asUser(DONO_A)
  await expectReject(
    () => db.query('SELECT fiscal_registrar_evento_enqueue_erro($1, $2, $3, $4::jsonb)', [
      VENDA_B, 'NFCE', 'dono outra loja', '{}',
    ]),
    /FISCAL_ENQUEUE_ERRO_EVENTO_AUTH/,
  )
  await asPostgres()
  const eventosOk = await db.query(
    `SELECT count(*)::int AS n FROM documentos_fiscais_eventos WHERE evento_tipo = 'ERRO_ENQUEUE'`,
  )
  assert.equal(eventosOk.rows[0].n, 1)

  await asPostgres()
  await db.exec(`UPDATE documentos_fiscais_pendentes SET status = 'ERRO' WHERE id = '${DOC_A}'`)
  await db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_A])
  assert.equal(await statusOf(DOC_A), 'PENDENTE')

  await asUser('')
  await expectReject(
    () => db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B]),
    /FISCAL_REPROCESSO_AUTH/,
  )

  await asPostgres()
  await db.exec(`
    UPDATE usuarios SET ativo = false
     WHERE id IN ('${GER_B}', '${OP_A}', '${DONO_A}', '${ADMIN}');
    UPDATE documentos_fiscais_pendentes SET status = 'ERRO' WHERE id = '${DOC_B}';
  `)
  await asUser(GER_B)
  await expectReject(
    () => db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B]),
    /FISCAL_REPROCESSO_PERFIL/,
  )
  assert.equal(await statusOf(DOC_B), 'ERRO')
  await asUser(OP_A)
  await expectReject(
    () => db.query(`SELECT fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb)`, [VENDA_A]),
    /FISCAL_ENQUEUE_PERMISSAO/,
  )
  await asUser(DONO_A)
  await expectReject(
    () => db.query(`SELECT fiscal_enfileirar_documento_venda($1, 'NFCE', '{}'::jsonb)`, [VENDA_A]),
    /FISCAL_ENQUEUE_PERMISSAO/,
  )
  await asUser(ADMIN)
  await expectReject(
    () => db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B]),
    /FISCAL_REPROCESSO_PERFIL/,
  )
  await asUser(OP_A)
  await expectReject(
    () => db.query('SELECT fiscal_registrar_evento_enqueue_erro($1, $2, $3, $4::jsonb)', [
      VENDA_A, 'NFCE', 'inativo', '{}',
    ]),
    /FISCAL_ENQUEUE_ERRO_EVENTO_AUTH/,
  )
  await asPostgres()
  await db.exec(`UPDATE usuarios SET ativo = true`)
  await asUser(GER_B)
  await db.query('SELECT fiscal_reprocessar_documento($1)', [DOC_B])
  assert.equal(await statusOf(DOC_B), 'PENDENTE')

  const fonte = await readFile(migrationUrl, 'utf8')
  assert.match(fonte, /session_user IN \('postgres', 'supabase_admin'\)/)
  assert.match(fonte, /não restaurar os corpos anteriores/)
  assert.doesNotMatch(fonte, /git show desta migration/)
  await asPostgres()
  const defs = await db.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'fiscal_reprocessar_documento',
        'fiscal_enfileirar_documento_venda',
        'fiscal_registrar_evento_enqueue_erro'
      )
  `)
  for (const row of defs.rows) {
    assert.doesNotMatch(row.def, /current_user <> 'postgres'/)
  }

  console.log('DEPOIS: outra loja e usuário inativo negados; mesma loja, ADMIN ativo, service_role e manutenção seguem válidos')
  console.log('OK: isolamento fiscal entre lojas')
} finally {
  await db.close()
}
