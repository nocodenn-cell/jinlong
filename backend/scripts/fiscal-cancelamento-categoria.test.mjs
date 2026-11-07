import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Regressão de 20261016120000_fiscal_error_category_cancelamento.sql.
// Diferente de fiscal-rpc-loja-authz.test.mjs, a tabela aqui carrega o CHECK REAL de categoria (copiado da
// migration 065): foi a ausência dele no stub que escondeu o 23514 de fiscal_cancelar_documento.

const name = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
const { PGlite } = await import(name)

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const LOJA = id(1)
const GER = id(2)
const CAIXA = id(3)
const VENDA_1 = id(4)
const VENDA_2 = id(5)
const DOC_GERENTE = id(6)
const DOC_WORKER = id(7)
const JUST = 'Cancelamento de teste local com mais de quinze caracteres'

const mig = (file) => new URL(`../supabase/migrations/${file}`, import.meta.url)

function extractBetween(sql, marker, endMarker) {
  const start = sql.indexOf(marker)
  if (start < 0) throw new Error(`trecho ausente: ${marker}`)
  const end = sql.indexOf(endMarker, start)
  if (end < 0) throw new Error(`fim ausente: ${marker}`)
  return sql.slice(start, end + endMarker.length)
}

const sql065 = await readFile(mig('065_fiscal_error_normalization.sql'), 'utf8')
const sqlIsola = await readFile(mig('20261009220000_fiscal_rpc_isola_loja.sql'), 'utf8')
const sqlCancelado = await readFile(mig('20261007161220_fiscal_cancelado_ssot.sql'), 'utf8')
const sqlFix = await readFile(mig('20261016120000_fiscal_error_category_cancelamento.sql'), 'utf8')

const checkOriginal065 = extractBetween(
  sql065,
  'ALTER TABLE public.documentos_fiscais_pendentes\n  ADD CONSTRAINT documentos_fiscais_pendentes_error_category_check',
  '\n  );',
)
const fnCancelar = extractBetween(sqlIsola, 'CREATE OR REPLACE FUNCTION public.fiscal_cancelar_documento', '\n$$;')
const fnMarcarCancelado = extractBetween(sqlCancelado, 'CREATE OR REPLACE FUNCTION public.fiscal_marcar_cancelado', '\n$$;')

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
    CREATE ROLE authenticator SUPERUSER NOINHERIT;
    CREATE ROLE authenticated NOINHERIT;
    CREATE ROLE service_role NOINHERIT;
    GRANT authenticated, service_role TO authenticator;
    CREATE TABLE usuarios(id uuid PRIMARY KEY, perfil text, loja_id uuid, ativo boolean);
    CREATE TABLE caixas(id uuid PRIMARY KEY, loja_id uuid);
    CREATE TABLE vendas(id uuid PRIMARY KEY, caixa_id uuid);
    CREATE TABLE documentos_fiscais_pendentes (
      id uuid PRIMARY KEY,
      venda_id uuid,
      tipo_doc text,
      status text CHECK (status IN ('PENDENTE', 'EM_PROCESSAMENTO', 'EMITIDO', 'ERRO', 'CANCELADO')),
      ultimo_erro text,
      proxima_tentativa_em timestamptz,
      fiscal_error_code text,
      fiscal_error_category text,
      fiscal_action_hint text,
      fiscal_retryable boolean,
      fiscal_next_step_url text,
      fiscal_error_payload jsonb,
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ${checkOriginal065};
    INSERT INTO usuarios VALUES ('${GER}', 'GERENTE', '${LOJA}', true);
    INSERT INTO caixas VALUES ('${CAIXA}', '${LOJA}');
    INSERT INTO vendas VALUES ('${VENDA_1}', '${CAIXA}'), ('${VENDA_2}', '${CAIXA}');
    INSERT INTO documentos_fiscais_pendentes (id, venda_id, tipo_doc, status) VALUES
      ('${DOC_GERENTE}', '${VENDA_1}', 'NFCE', 'PENDENTE'),
      ('${DOC_WORKER}', '${VENDA_2}', 'NFCE', 'EMITIDO');
    ${fnCancelar}
    ${fnMarcarCancelado}
    GRANT EXECUTE ON FUNCTION public.fiscal_cancelar_documento(uuid, text) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.fiscal_marcar_cancelado(uuid, text, jsonb) TO service_role;
  `)

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
  const asGerente = () => asSession(GER, 'authenticated', 'authenticated')
  const asService = () => asSession('', 'service_role', 'service_role')

  async function doc(docId) {
    await asPostgres()
    return (await db.query(
      'SELECT status, fiscal_error_category FROM documentos_fiscais_pendentes WHERE id = $1',
      [docId],
    )).rows[0]
  }

  async function expectCheckViolation(fn, label) {
    await assert.rejects(fn, (err) => {
      assert.equal(err.code, '23514', `${label}: esperado 23514, veio ${err.code} ${err.message}`)
      assert.match(err.message, /documentos_fiscais_pendentes_error_category_check/)
      return true
    })
  }

  // ANTES: com o CHECK original, os dois caminhos de cancelamento falham.
  await asGerente()
  await expectCheckViolation(
    () => db.query('SELECT fiscal_cancelar_documento($1, $2)', [DOC_GERENTE, JUST]),
    'fiscal_cancelar_documento',
  )
  assert.equal((await doc(DOC_GERENTE)).status, 'PENDENTE')
  await asService()
  await expectCheckViolation(
    () => db.query('SELECT fiscal_marcar_cancelado($1, $2, NULL)', [DOC_WORKER, 'cancelado no provedor']),
    'fiscal_marcar_cancelado',
  )
  assert.equal((await doc(DOC_WORKER)).status, 'EMITIDO')
  console.log('ANTES: GERENTE da própria loja e worker recebem 23514 ao cancelar (CHECK sem CANCELAMENTO)')

  // Migration aplicada duas vezes (idempotência).
  await asPostgres()
  await db.exec(sqlFix)
  await db.exec(sqlFix)

  await asGerente()
  await db.query('SELECT fiscal_cancelar_documento($1, $2)', [DOC_GERENTE, JUST])
  assert.deepEqual(await doc(DOC_GERENTE), { status: 'CANCELADO', fiscal_error_category: 'CANCELAMENTO' })
  await asGerente()
  await db.query('SELECT fiscal_cancelar_documento($1, $2)', [DOC_GERENTE, JUST]) // retry idempotente

  await asService()
  await db.query('SELECT fiscal_marcar_cancelado($1, $2, NULL)', [DOC_WORKER, 'cancelado no provedor'])
  assert.deepEqual(await doc(DOC_WORKER), { status: 'CANCELADO', fiscal_error_category: 'CANCELAMENTO' })
  console.log('DEPOIS: cancelamento explícito (GERENTE) e do worker persistem CANCELADO/CANCELAMENTO; retry idempotente')

  // O CHECK continua restritivo: categorias antigas aceitas, valor arbitrário recusado.
  await asPostgres()
  for (const cat of ['DADOS_CADASTRAIS_INVALIDOS', 'FALHA_COMUNICACAO_PROVIDER', 'TIMEOUT_RATE_LIMIT', 'REJEICAO_REGRA_FISCAL', 'DESCONHECIDO', null]) {
    await db.query('UPDATE documentos_fiscais_pendentes SET fiscal_error_category = $1 WHERE id = $2', [cat, DOC_GERENTE])
  }
  await expectCheckViolation(
    () => db.query(`UPDATE documentos_fiscais_pendentes SET fiscal_error_category = 'QUALQUER' WHERE id = $1`, [DOC_GERENTE]),
    'categoria arbitrária',
  )
  console.log('DEPOIS: categorias do worker seguem válidas e valor fora da lista continua recusado')
  console.log('OK: categoria CANCELAMENTO aceita pelo CHECK')
} finally {
  await db.close()
}
