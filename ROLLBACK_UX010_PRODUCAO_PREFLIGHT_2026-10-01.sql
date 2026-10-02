-- ROLLBACK UX-010 (C1 + C2 + P-03) — projeto Supabase `jinlong` (kbabmewnahysfvlybiak)
-- Capturado por SELECT read-only em 2026-10-01, ANTES de qualquer aplicação.
-- Estado de produção na captura: última migration = 20260929162802; 20260930090000/090100/090200 AUSENTES.
-- NÃO EXECUTAR sem autorização. Este arquivo só restaura o estado anterior se C1/C2/P-03 tiverem sido aplicadas.
--
-- Baseline de produção na captura (para conferir o rollback):
--   kpis_venda_eventos_gerente(matriz) = faturado 5102.20 | concluidas 66 | ticket 77.31 | canceladas 10 | valor 2134.50
--   vendas: CONCLUIDA=240 (soma 14974.80), CANCELADA=10 (soma 2134.50); vendas_suspensas = 'false'

BEGIN;

-- ── 1. P-03: volta as duas RPCs de vendas para a versão ledger (sem predicado de identidade) ─────────
CREATE OR REPLACE FUNCTION public.kpis_venda_eventos_gerente(p_loja_id uuid, p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_formas_pagamento text[] DEFAULT NULL::text[])
 RETURNS TABLE(faturado numeric, qtd_concluidas bigint, ticket_medio numeric, qtd_canceladas bigint, valor_canceladas numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(e.total) FILTER (WHERE e.event_type = 'SALE_REGISTERED'), 0)::numeric(10,2) AS faturado,
    COUNT(*) FILTER (WHERE e.event_type = 'SALE_REGISTERED') AS qtd_concluidas,
    CASE WHEN COUNT(*) FILTER (WHERE e.event_type = 'SALE_REGISTERED') > 0 THEN
      ROUND(COALESCE(SUM(e.total) FILTER (WHERE e.event_type = 'SALE_REGISTERED'), 0)
        / COUNT(*) FILTER (WHERE e.event_type = 'SALE_REGISTERED'), 2)
      ELSE 0::numeric(10,2) END AS ticket_medio,
    COUNT(*) FILTER (WHERE e.event_type = 'SALE_CANCELLED') AS qtd_canceladas,
    COALESCE(SUM(e.total) FILTER (WHERE e.event_type = 'SALE_CANCELLED'), 0)::numeric(10,2) AS valor_canceladas
  FROM public.venda_eventos e
  WHERE e.loja_id = p_loja_id
    AND (p_inicio IS NULL OR e.occurred_at >= p_inicio)
    AND (p_fim IS NULL OR e.occurred_at <= p_fim)
    AND (p_formas_pagamento IS NULL OR e.forma_pagamento = ANY(p_formas_pagamento));
$function$;

CREATE OR REPLACE FUNCTION public.listar_venda_eventos_gerente(p_loja_id uuid, p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_event_types text[] DEFAULT ARRAY['SALE_REGISTERED'::text], p_formas_pagamento text[] DEFAULT NULL::text[], p_offset integer DEFAULT 0, p_limit integer DEFAULT 21)
 RETURNS TABLE(event_id uuid, sale_id uuid, event_type text, occurred_at timestamp with time zone, total numeric, total_bruto numeric, forma_pagamento text, caixa_id uuid, operador_id uuid, items jsonb, qtd_itens_total numeric, qtd_itens_distintos integer, primeiro_produto text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    e.id AS event_id, e.sale_id, e.event_type, e.occurred_at,
    e.total, e.total_bruto, e.forma_pagamento, e.caixa_id, e.operador_id, e.items,
    COALESCE((SELECT SUM((it->>'quantidade')::numeric) FROM jsonb_array_elements(e.items) AS it), 0) AS qtd_itens_total,
    COALESCE(jsonb_array_length(e.items), 0) AS qtd_itens_distintos,
    e.items->0->>'nome' AS primeiro_produto
  FROM public.venda_eventos e
  WHERE e.loja_id = p_loja_id
    AND (p_inicio IS NULL OR e.occurred_at >= p_inicio)
    AND (p_fim IS NULL OR e.occurred_at <= p_fim)
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
    AND (p_formas_pagamento IS NULL OR e.forma_pagamento = ANY(p_formas_pagamento))
  ORDER BY e.occurred_at DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT GREATEST(p_limit, 1);
$function$;

-- ── 2. C1: registrar_system_alert volta a ser LANGUAGE sql, sem checagem de loja ─────────────────────
CREATE OR REPLACE FUNCTION public.registrar_system_alert(p_tipo text, p_produto_id uuid DEFAULT NULL::uuid, p_venda_id uuid DEFAULT NULL::uuid, p_loja_id uuid DEFAULT NULL::uuid, p_detalhe jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.system_alerts (tipo, produto_id, venda_id, loja_id, detalhe)
  VALUES (p_tipo, p_produto_id, p_venda_id, p_loja_id, p_detalhe);
$function$;

-- ── 3. C2: trigger de vendas volta a só validar o caixa (sem checar suspensão) ───────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_vendas_caixa_aberto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NEW.caixa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.status
  INTO v_status
  FROM public.caixas c
  WHERE c.id = NEW.caixa_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENDA_CAIXA_NAO_ENCONTRADO'
      USING HINT = 'O caixa_id informado não existe na tabela caixas.';
  END IF;

  IF v_status <> 'ABERTO' THEN
    RAISE EXCEPTION 'VENDA_CAIXA_FECHADO'
      USING HINT = 'Não é possível inserir ou reatribuir vendas a um caixa que não está ABERTO.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 4. C1: restaura EXECUTE de authenticated nas 6 funções revogadas (estado original: postgres, authenticated, service_role) ──
DO $rb$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.registrar_venda_evento(text,uuid,text,uuid,uuid,uuid,jsonb,numeric,numeric,text,boolean)',
    'public.ensure_venda_evento_registrado(uuid,text)',
    'public.shadow_validar_venda_engine_v4(jsonb)',
    'public.listar_valores_sistema_dinheiro_caixas(uuid[])',
    'public.proximo_numero_venda_em_espera(uuid)',
    'public.quantidade_devolvida_item_venda(uuid)'
  ]
  LOOP
    IF to_regprocedure(v_sig) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    END IF;
  END LOOP;
END
$rb$;
-- (service_role e postgres já mantêm EXECUTE; PUBLIC e anon NÃO tinham — não conceder.)

-- ── 5. C1: restaura privilégios padrão de funções novas ──────────────────────────────────────────────
-- Estado original: pg_default_acl (postgres, schema public, 'f') = postgres, anon, authenticated, service_role = X;
-- sem linha global (PUBLIC executava por padrão do Postgres).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── 6. OPCIONAL (só se as migrations foram registradas em supabase_migrations.schema_migrations) ─────
-- Mantém o histórico coerente com o estado revertido. É uma escrita: requer autorização própria.
-- DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20260930090000','20260930090100','20260930090200');

-- ── 7. Verificações pós-rollback (SELECT) ────────────────────────────────────────────────────────────
-- select faturado, qtd_concluidas, ticket_medio, qtd_canceladas, valor_canceladas
--   from public.kpis_venda_eventos_gerente('a0000001-0000-4000-8000-000000000001'::uuid, null, null, null);
--   -- esperado: 5102.20 | 66 | 77.31 | 10 | 2134.50
-- select proname, proacl::text from pg_proc where pronamespace='public'::regnamespace and proname in
--   ('registrar_venda_evento','ensure_venda_evento_registrado','shadow_validar_venda_engine_v4',
--    'listar_valores_sistema_dinheiro_caixas','proximo_numero_venda_em_espera','quantidade_devolvida_item_venda');
--   -- esperado: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- ── ACLs capturadas (referência) ─────────────────────────────────────────────────────────────────────
-- kpis_venda_eventos_gerente, listar_venda_eventos_gerente, registrar_system_alert:
--     {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- trg_fn_vendas_caixa_aberto: {postgres=X/postgres,service_role=X/postgres}
-- 6 funções da C1 (registrar_venda_evento, ensure_venda_evento_registrado, shadow_validar_venda_engine_v4,
--   listar_valores_sistema_dinheiro_caixas, proximo_numero_venda_em_espera, quantidade_devolvida_item_venda):
--     {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- auth_usuario_gerencial_loja, auth_usuario_loja_id: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- venda_eventos_items_from_sale: {postgres=X/postgres,service_role=X/postgres}
-- pg_default_acl (postgres, public, f): {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
