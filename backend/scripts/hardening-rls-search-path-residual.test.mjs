import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Regressão de 20261016120100_hardening_rls_search_path_residual.sql:
//   * RLS ligada nas 2 tabelas internas nega authenticated mesmo com GRANT acidental; service_role segue lendo;
//   * as 8 funções ficam com search_path = '' e devolvem exatamente o mesmo resultado;
//   * a migration é idempotente e tolera ambiente sem alguma das funções.
// Corpos das funções = definição vigente em produção em 2026-10-16.

const name = process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
const { PGlite } = await import(name)

const sqlFix = await readFile(
  new URL('../supabase/migrations/20261016120100_hardening_rls_search_path_residual.sql', import.meta.url),
  'utf8',
)

const db = new PGlite()
try {
  await db.exec(`
    CREATE ROLE authenticated NOINHERIT;
    CREATE ROLE service_role NOINHERIT BYPASSRLS;
    CREATE SCHEMA internal;
    CREATE TYPE public.motivo_desconto_enum_tipo AS ENUM ('AUTORIZACAO_COMERCIAL', 'OUTRO');

    CREATE TABLE public.sync_request_nonces(nonce text PRIMARY KEY);
    CREATE TABLE public.venda_engine_shadow_runs(id int PRIMARY KEY);
    INSERT INTO public.sync_request_nonces VALUES ('n1');
    INSERT INTO public.venda_engine_shadow_runs VALUES (1);
    -- GRANT "acidental" para provar que a RLS é a barreira, não o grant.
    GRANT SELECT ON public.sync_request_nonces, public.venda_engine_shadow_runs TO authenticated, service_role;

    CREATE FUNCTION internal.desconto_comercial_operador_ok(p_token text, p_percentual numeric, p_motivo public.motivo_desconto_enum_tipo)
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
      SELECT p_token IS NULL
        AND p_percentual IS NOT NULL
        AND p_percentual > 0
        AND p_percentual <= 10
        AND p_motivo = 'AUTORIZACAO_COMERCIAL'::public.motivo_desconto_enum_tipo
    $$;
    CREATE FUNCTION internal.comissao_valor_item(p_quantidade numeric, p_preco_unitario numeric, p_tipo_calculo text, p_percentual numeric, p_valor_unitario_fixo numeric)
    RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
      SELECT (CASE
        WHEN COALESCE(p_quantidade, 0) <= 0 THEN 0
        WHEN p_tipo_calculo = 'fixo'
          THEN ROUND(COALESCE(p_valor_unitario_fixo, 0) * p_quantidade, 2)
        ELSE ROUND(ROUND(p_quantidade * p_preco_unitario, 2) * COALESCE(p_percentual, 0) / 100.0, 2)
      END)::numeric(14,2);
    $$;
    CREATE FUNCTION public.venda_evento_idempotency_key(p_source text, p_sale_id uuid, p_cancelled boolean)
    RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE
        WHEN p_cancelled THEN btrim(p_source) || ':cancel:' || p_sale_id::text
        ELSE btrim(p_source) || ':' || p_sale_id::text
      END;
    $$;
    CREATE FUNCTION public.trg_comissoes_ajustes_bloquear_mutacao() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'COMISSOES_AJUSTES_IMUTAVEL'
        USING DETAIL = format('%s bloqueado em public.comissoes_ajustes', TG_OP);
    END;
    $$;
    CREATE FUNCTION public.trg_movimentos_estoque_log_bloquear_mutacao() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'MOVIMENTOS_ESTOQUE_LOG_IMUTAVEL'
        USING DETAIL = format('%s bloqueado em public.movimentos_estoque_log', TG_OP);
    END;
    $$;
    CREATE FUNCTION public.finalizar_venda_transacional_canonica_v2() RETURNS void LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'; END; $$;
    -- finalizar_venda_transacional_canonica_v3() e finalizar_venda_transacional(7 args) AUSENTES de propósito.

    CREATE TABLE public.movimentos_estoque_log(id int PRIMARY KEY);
    INSERT INTO public.movimentos_estoque_log VALUES (1);
    CREATE TRIGGER trg_bloqueia BEFORE UPDATE OR DELETE ON public.movimentos_estoque_log
      FOR EACH ROW EXECUTE FUNCTION public.trg_movimentos_estoque_log_bloquear_mutacao();
  `)

  const probe = `
    SELECT
      internal.desconto_comercial_operador_ok(NULL, 5, 'AUTORIZACAO_COMERCIAL') AS desc_ok,
      internal.desconto_comercial_operador_ok(NULL, 11, 'AUTORIZACAO_COMERCIAL') AS desc_acima,
      internal.comissao_valor_item(3, 19.99, 'percentual', 2.5, NULL)::text AS com_pct,
      internal.comissao_valor_item(3, 19.99, 'fixo', NULL, 1.234)::text AS com_fixo,
      public.venda_evento_idempotency_key(' web ', '00000000-0000-4000-8000-000000000001', true) AS idem
  `
  const antes = (await db.query(probe)).rows[0]

  await db.exec(sqlFix)
  await db.exec(sqlFix) // idempotente

  const depois = (await db.query(probe)).rows[0]
  assert.deepEqual(depois, antes, 'resultado das funções idêntico após fixar search_path')

  const cfg = await db.query(`
    SELECT p.oid::regprocedure::text AS sig, p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (('internal','desconto_comercial_operador_ok'), ('internal','comissao_valor_item'),
      ('public','venda_evento_idempotency_key'), ('public','trg_comissoes_ajustes_bloquear_mutacao'),
      ('public','trg_movimentos_estoque_log_bloquear_mutacao'), ('public','finalizar_venda_transacional_canonica_v2'))
  `)
  assert.equal(cfg.rows.length, 6)
  for (const r of cfg.rows) {
    assert.deepEqual(r.proconfig, ['search_path=""'], `${r.sig} com search_path vazio`)
  }

  await assert.rejects(db.query('UPDATE public.movimentos_estoque_log SET id = 2'), /MOVIMENTOS_ESTOQUE_LOG_IMUTAVEL/)
  await assert.rejects(db.query('SELECT public.finalizar_venda_transacional_canonica_v2()'), /LEGACY_DISABLED_USE_V4/)

  const rls = await db.query(`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname IN ('sync_request_nonces', 'venda_engine_shadow_runs') ORDER BY relname
  `)
  assert.deepEqual(rls.rows.map((r) => r.relrowsecurity), [true, true])

  await db.exec('SET ROLE authenticated')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.sync_request_nonces')).rows[0].n, 0)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.venda_engine_shadow_runs')).rows[0].n, 0)
  await db.exec('RESET ROLE')
  await db.exec('SET ROLE service_role')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.sync_request_nonces')).rows[0].n, 1)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.venda_engine_shadow_runs')).rows[0].n, 1)
  await db.exec('RESET ROLE')

  console.log('search_path vazio nas funções presentes, resultados idênticos, ausentes ignoradas')
  console.log('RLS: authenticated com GRANT vê 0 linhas; service_role (BYPASSRLS) segue lendo')
  console.log('OK: hardening residual (RLS + search_path)')
} finally {
  await db.close()
}
