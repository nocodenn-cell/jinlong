CREATE OR REPLACE VIEW public.produtos_custos
WITH (security_invoker = off) AS
SELECT
  p.id AS produto_id,
  p.loja_id,
  p.preco_custo,
  p.preco_custo_medio
FROM public.produtos p
JOIN public.usuarios u
  ON u.id = (SELECT auth.uid())
 AND COALESCE(u.ativo, false)
 AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
 AND (u.perfil = 'ADMIN' OR u.loja_id = p.loja_id);

COMMENT ON VIEW public.produtos_custos IS
  'Custo de aquisição por produto, SOMENTE para GERENTE/DONO ativos da loja e ADMIN ativo (0 linhas para OPERADOR/inativo). Única via de leitura do custo para usuários autenticados; produtos.preco_custo tem SELECT revogado.';

REVOKE ALL ON public.produtos_custos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.produtos_custos TO authenticated, service_role;

DO $fn$
DECLARE
  v_sig text;
  v_def text;
  v_pos int;
  v_novo text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.dashboard_gerente_resumo(uuid,text)',
    'public.relatorio_margem_por_venda_periodo(date,date,text,integer)',
    'public.relatorio_produtos_sem_giro_periodo(uuid,timestamp with time zone,timestamp with time zone)',
    'public.relatorio_resumo_executivo_periodo(date,date,text)'
  ]
  LOOP
    v_def := pg_get_functiondef(v_sig::regprocedure);
    v_pos := position('p.preco_custo' IN v_def);
    IF v_pos = 0 THEN
      RAISE EXCEPTION '%: nenhuma referência a p.preco_custo — definição inesperada, abortado', v_sig;
    END IF;

    v_novo := left(v_def, v_pos - 1)
      || regexp_replace(
           substr(v_def, v_pos),
           '(JOIN public\.produtos p ON p\.id = \w+\.produto_id)',
           '\1 LEFT JOIN public.produtos_custos pc ON pc.produto_id = p.id'
         );
    v_novo := replace(v_novo, 'p.preco_custo', 'pc.preco_custo');

    IF (length(v_novo) - length(replace(v_novo, 'LEFT JOIN public.produtos_custos pc', ''))) / length('LEFT JOIN public.produtos_custos pc') <> 1 THEN
      RAISE EXCEPTION '%: esperado exatamente 1 junção com produtos_custos após a troca — abortado sem alterar nada', v_sig;
    END IF;
    IF position('p.preco_custo' IN v_novo) <> 0 OR v_novo = v_def THEN
      RAISE EXCEPTION '%: troca inconsistente — abortado sem alterar nada', v_sig;
    END IF;

    EXECUTE v_novo;
  END LOOP;
END
$fn$;

DROP POLICY IF EXISTS system_alerts_select_authenticated ON public.system_alerts;
DROP POLICY IF EXISTS system_alerts_select_gerencial ON public.system_alerts;
CREATE POLICY system_alerts_select_gerencial ON public.system_alerts
  FOR SELECT TO authenticated
  USING (public.auth_usuario_gerencial_loja(loja_id));

CREATE OR REPLACE FUNCTION public.pdv_registrar_alertas_margem_venda(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_loja uuid;
  v_operador uuid;
  v_ativo boolean;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  SELECT c.loja_id, v.operador_id
    INTO v_loja, v_operador
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE v.id = p_venda_id;

  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'VENDA_NAO_ENCONTRADA' USING ERRCODE = 'P0002';
  END IF;
  IF v_operador IS DISTINCT FROM v_uid AND NOT public.auth_usuario_gerencial_loja(v_loja) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(p.alertas_leves_ativos, false) INTO v_ativo FROM public.pdv_config p WHERE p.id = 1;
  IF NOT COALESCE(v_ativo, false) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('pdv_margem_negativa:' || p_venda_id::text, 0));

  FOR r IN
    SELECT iv.produto_id, iv.preco_unitario
    FROM public.itens_venda iv
    WHERE iv.venda_id = p_venda_id
      AND iv.custo_unitario_snap IS NOT NULL
      AND iv.preco_unitario < iv.custo_unitario_snap
      AND NOT EXISTS (
        SELECT 1 FROM public.system_alerts a
        WHERE a.tipo = 'margem_negativa' AND a.venda_id = p_venda_id AND a.produto_id = iv.produto_id
      )
  LOOP
    INSERT INTO public.system_alerts (tipo, produto_id, venda_id, loja_id, detalhe)
    VALUES ('margem_negativa', r.produto_id, p_venda_id, v_loja,
            jsonb_build_object('preco_unitario', r.preco_unitario, 'abaixo_do_custo', true));
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.pdv_registrar_alertas_margem_venda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_registrar_alertas_margem_venda(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.pdv_registrar_alertas_margem_venda(uuid) IS
  'Registra system_alerts margem_negativa para itens vendidos abaixo do custo (snapshot da venda). Retorna void de propósito: contagem/resultado seria um oráculo do custo para o OPERADOR. Idempotente e serializada por venda (advisory lock).';

NOTIFY pgrst, 'reload schema';