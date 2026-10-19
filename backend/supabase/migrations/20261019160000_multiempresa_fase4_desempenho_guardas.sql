-- Multiempresa Fase 4 — desempenho das guardas tenant_guard (medido em homologação).
--
-- Problema: as guardas RESTRICTIVE chamavam funções SECURITY DEFINER POR LINHA
-- (fp_pode_loja → fp_lojas_permitidas; fp_loja_de em plpgsql). Em homolog, com só 1.000 vendas,
-- SELECTs do dono saíram de ~0,4 ms para 400–1.100 ms.
--
-- Solução (mesma semântica):
--  * lojas/empresas permitidas viram ARRAY calculado UMA vez por consulta (InitPlan:
--    `(SELECT public.fp_lojas_permitidas_arr())`); ADMIN legado idem `(SELECT public.fp_admin_legado())`.
--  * loja "pai" de caixa/venda/produto via views em `fp_guarda` (dono postgres ⇒ sem RLS aninhada,
--    planejável por índice) em vez de fp_loja_de plpgsql. Demais tipos J: seguem com fp_loja_de
--    (volume baixo), mas já sem a chamada por linha de fp_pode_loja*.
--  * Expressão original guardada em internal.fp_guardas_originais (rollback restaura).
-- Aditiva. Rollback: rollback/20261019160000_multiempresa_fase4_desempenho_guardas.rollback.sql
-- (rodar ANTES dos rollbacks das fases 3 e 2).

CREATE OR REPLACE FUNCTION public.fp_lojas_permitidas_arr()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[]) FROM public.fp_lojas_permitidas(NULL) x;
$$;
CREATE OR REPLACE FUNCTION public.fp_empresas_arr()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[]) FROM public.fp_empresas_do_usuario() x;
$$;
REVOKE ALL ON FUNCTION public.fp_lojas_permitidas_arr() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fp_empresas_arr() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_lojas_permitidas_arr() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_empresas_arr() TO authenticated, service_role;

-- Schema NÃO exposto pelo PostgREST; só para as guardas resolverem a loja pai sem RLS aninhada.
CREATE SCHEMA IF NOT EXISTS fp_guarda;
REVOKE ALL ON SCHEMA fp_guarda FROM PUBLIC;
GRANT USAGE ON SCHEMA fp_guarda TO authenticated;
CREATE OR REPLACE VIEW fp_guarda.caixa AS SELECT c.id, c.loja_id FROM public.caixas c;
CREATE OR REPLACE VIEW fp_guarda.venda AS
  SELECT v.id, c.loja_id FROM public.vendas v LEFT JOIN public.caixas c ON c.id = v.caixa_id;
CREATE OR REPLACE VIEW fp_guarda.produto AS SELECT p.id, p.loja_id FROM public.produtos p;
REVOKE ALL ON fp_guarda.caixa, fp_guarda.venda, fp_guarda.produto FROM PUBLIC;
GRANT SELECT ON fp_guarda.caixa, fp_guarda.venda, fp_guarda.produto TO authenticated;

CREATE TABLE IF NOT EXISTS internal.fp_guardas_originais (
  tabela text PRIMARY KEY,
  qual text,
  with_check text,
  aplicada boolean NOT NULL,
  motivo text,
  em timestamptz NOT NULL DEFAULT now()
);

-- Reescreve a expressão (texto de pg_get_expr) para a forma rápida. Puro, testável.
CREATE OR REPLACE FUNCTION internal.fp_guarda_rapida(p_tabela text, p_expr text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  e text := p_expr;
  arg constant text := '((?:public\.)?fp_loja_de\(''[a-z_]+''::text, [a-z_]+\)|\([a-z_]+\)::uuid|[a-z_]+\.[a-z_]+|[a-z_]+)';
  lojas constant text := '(SELECT public.fp_lojas_permitidas_arr())::uuid[]';
  adm constant text := '(SELECT public.fp_admin_legado())';
BEGIN
  IF e IS NULL THEN RETURN NULL; END IF;
  -- Loja pai via caixa/venda: semi-join HASH (1 vez por consulta) — medido em homolog: paridade com "sem guarda".
  e := regexp_replace(e, '(?:public\.)?fp_pode_loja_nula\((?:public\.)?fp_loja_de\(''(caixa|venda)''::text, ([a-z_]+)\)\)',
         '(' || quote_ident(p_tabela) || '.\2 IN (SELECT fpv.id FROM fp_guarda.\1 fpv WHERE fpv.loja_id = ANY (' || lojas
         || ') OR (fpv.loja_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid))))'
         || ' OR (' || quote_ident(p_tabela) || '.\2 IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid))) OR ' || adm || ')', 'g');
  -- itens_venda (guarda da fase 1: EXISTS vendas⋈caixas com fp_pode_loja por linha) ⇒ mesmo semi-join, sem a folga de loja nula.
  IF p_tabela = 'itens_venda' AND e ~ 'JOIN caixas c' AND e ~ 'fp_pode_loja\(c\.loja_id, NULL::text\[\]\)' THEN
    e := '(itens_venda.venda_id IN (SELECT fpv.id FROM fp_guarda.venda fpv WHERE fpv.loja_id = ANY (' || lojas || ')) OR ' || adm || ')';
  END IF;
  e := regexp_replace(e, '(?:public\.)?fp_pode_loja_nula\(' || arg || '\)',
         '(COALESCE(\1 = ANY (' || lojas || '), (SELECT public.fp_pode_loja_nula(NULL::uuid))) OR ' || adm || ')', 'g');
  e := regexp_replace(e, '(?:public\.)?fp_pode_loja\(' || arg || ', NULL::text\[\]\)',
         '(COALESCE(\1 = ANY (' || lojas || '), false) OR ' || adm || ')', 'g');
  e := regexp_replace(e, '(?:public\.)?fp_pode_empresa\(([a-z_]+)\)',
         '(COALESCE(\1 = ANY ((SELECT public.fp_empresas_arr())::uuid[]), false) OR ' || adm || ')', 'g');
  e := regexp_replace(e, '(?:public\.)?fp_loja_de\(''(caixa|venda|produto)''::text, ([a-z_]+)\)',
         '(SELECT fpv.loja_id FROM fp_guarda.\1 fpv WHERE fpv.id = ' || quote_ident(p_tabela) || '.\2)', 'g');
  RETURN e;
END $$;

DO $$
DECLARE r record; nq text; nc text; resto text;
BEGIN
  FOR r IN
    SELECT p.tablename AS tabela, p.qual, p.with_check
      FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.policyname = 'tenant_guard'
       AND NOT EXISTS (SELECT 1 FROM internal.fp_guardas_originais o WHERE o.tabela = p.tablename AND o.aplicada)
  LOOP
    nq := internal.fp_guarda_rapida(r.tabela, r.qual);
    nc := internal.fp_guarda_rapida(r.tabela, r.with_check);
    resto := concat_ws(' ', nq, nc);
    -- Sobra de chamada por linha (padrão não reconhecido) ⇒ não mexe (seguro), registra.
    IF regexp_replace(resto, 'fp_pode_loja_nula\(NULL::uuid\)', '', 'g') ~ 'fp_pode_(loja|loja_nula|empresa)\(' THEN
      INSERT INTO internal.fp_guardas_originais (tabela, qual, with_check, aplicada, motivo)
      VALUES (r.tabela, r.qual, r.with_check, false, 'padrão não reconhecido')
      ON CONFLICT (tabela) DO UPDATE SET aplicada = false, motivo = excluded.motivo;
      RAISE NOTICE 'fase4: guarda de % não otimizada (padrão não reconhecido)', r.tabela;
      CONTINUE;
    END IF;
    INSERT INTO internal.fp_guardas_originais (tabela, qual, with_check, aplicada)
    VALUES (r.tabela, r.qual, r.with_check, true)
    ON CONFLICT (tabela) DO UPDATE SET qual = excluded.qual, with_check = excluded.with_check, aplicada = true, motivo = NULL;
    IF nq IS NOT NULL AND nc IS NOT NULL THEN
      EXECUTE format('ALTER POLICY tenant_guard ON public.%I USING (%s) WITH CHECK (%s)', r.tabela, nq, nc);
    ELSIF nq IS NOT NULL THEN
      EXECUTE format('ALTER POLICY tenant_guard ON public.%I USING (%s)', r.tabela, nq);
    ELSIF nc IS NOT NULL THEN
      EXECUTE format('ALTER POLICY tenant_guard ON public.%I WITH CHECK (%s)', r.tabela, nc);
    END IF;
  END LOOP;
END $$;

-- Índices de FK apontados pelo advisor (vínculos são lidos em toda guarda).
CREATE INDEX IF NOT EXISTS usuario_vinculos_empresa_idx ON public.usuario_vinculos (empresa_id);
CREATE INDEX IF NOT EXISTS usuario_vinculos_empresa_loja_idx ON public.usuario_vinculos (empresa_id, loja_id);
