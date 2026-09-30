-- C1 (auditoria JINLONG 2026-09-30): fecha a classe "SECURITY DEFINER exposto a authenticated sem identidade".
--
-- Causa-raiz (provada em produção):
--   * ACL padrão do schema public (pg_default_acl, dono postgres) concede EXECUTE a anon/authenticated/
--     service_role em TODA função nova → funções de backend nascem públicas ao usuário logado. Isto explica
--     o drift: migrations antigas revogavam, produção ficou com `authenticated` (ex.: registrar_venda_evento).
--   * 19 funções SECURITY DEFINER acessíveis a `authenticated` sem auth.uid()/jwt (3 escrevem).
--
-- Correção sem criar API nova: (1) revoga o que só o backend (service_role) usa; (2) prende à identidade as
-- que o app usa, reutilizando auth_usuario_gerencial_loja / auth_usuario_loja_id; (3) torna o padrão
-- fail-closed para funções futuras. Assinaturas e nomes preservados.

-- ── 1. Somente backend (service_role): sem consumidor autenticado no repo ────────────────────────────
-- registrar_venda_evento: chamada só por outras SECDEF (cancelar/devolver) — roda como dono, não precisa de grant.
-- ensure_venda_evento_registrado: chamada por sync-outbox (service_role) e dev-tools (admin client).
-- shadow_validar_venda_engine_v4 / listar_valores_sistema_dinheiro_caixas: sem chamador (ver 20260819230000).
DO $c1_revoke$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.registrar_venda_evento(text,uuid,text,uuid,uuid,uuid,jsonb,numeric,numeric,text,boolean)',
    'public.ensure_venda_evento_registrado(uuid,text)',
    'public.shadow_validar_venda_engine_v4(jsonb)',
    'public.listar_valores_sistema_dinheiro_caixas(uuid[])',
    -- Helpers internos: únicos chamadores em produção são funções SECURITY DEFINER (rodam como dono):
    -- colocar_venda_em_espera → proximo_numero_venda_em_espera; devolver_ou_trocar_venda e
    -- internal.comissao_quantidade_efetiva → quantidade_devolvida_item_venda. Sem uso em TS, RLS ou views.
    -- Ambas recebiam ids controlados pelo cliente (operador / item de venda) sem checar loja.
    'public.proximo_numero_venda_em_espera(uuid)',
    'public.quantidade_devolvida_item_venda(uuid)'
  ]
  LOOP
    IF to_regprocedure(v_sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    END IF;
  END LOOP;
END
$c1_revoke$;

-- ── 2. Usadas pelo app: amarrar à identidade (mesmo nome, mesma assinatura) ─────────────────────────
-- Leitura gerencial de eventos: só quem é GERENTE/DONO/ADMIN da loja pedida (service_role segue livre).
CREATE OR REPLACE FUNCTION public.listar_venda_eventos_gerente(
  p_loja_id uuid,
  p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_event_types text[] DEFAULT ARRAY['SALE_REGISTERED'::text],
  p_formas_pagamento text[] DEFAULT NULL::text[],
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 21
)
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
    AND (auth.role() = 'service_role' OR public.auth_usuario_gerencial_loja(p_loja_id))
    AND (p_inicio IS NULL OR e.occurred_at >= p_inicio)
    AND (p_fim IS NULL OR e.occurred_at <= p_fim)
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
    AND (p_formas_pagamento IS NULL OR e.forma_pagamento = ANY(p_formas_pagamento))
  ORDER BY e.occurred_at DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT GREATEST(p_limit, 1);
$function$;

CREATE OR REPLACE FUNCTION public.kpis_venda_eventos_gerente(
  p_loja_id uuid,
  p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_formas_pagamento text[] DEFAULT NULL::text[]
)
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
    AND (auth.role() = 'service_role' OR public.auth_usuario_gerencial_loja(p_loja_id))
    AND (p_inicio IS NULL OR e.occurred_at >= p_inicio)
    AND (p_fim IS NULL OR e.occurred_at <= p_fim)
    AND (p_formas_pagamento IS NULL OR e.forma_pagamento = ANY(p_formas_pagamento));
$function$;

-- Alertas do PDV: o servidor chama com a sessão do operador. A loja passa a ser a do usuário logado;
-- p_loja_id de outra loja é recusado (antes: qualquer usuário gravava alerta em qualquer loja).
CREATE OR REPLACE FUNCTION public.registrar_system_alert(
  p_tipo text,
  p_produto_id uuid DEFAULT NULL::uuid,
  p_venda_id uuid DEFAULT NULL::uuid,
  p_loja_id uuid DEFAULT NULL::uuid,
  p_detalhe jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loja uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_loja := p_loja_id;
  ELSE
    v_loja := public.auth_usuario_loja_id();
    IF v_loja IS NULL THEN
      RAISE EXCEPTION 'NAO_AUTORIZADO';
    END IF;
    IF p_loja_id IS NOT NULL AND p_loja_id <> v_loja THEN
      RAISE EXCEPTION 'LOJA_NAO_PERMITIDA';
    END IF;
  END IF;

  INSERT INTO public.system_alerts (tipo, produto_id, venda_id, loja_id, detalhe)
  VALUES (p_tipo, p_produto_id, p_venda_id, v_loja, p_detalhe);
END;
$function$;

-- ── 3. Fail-closed para o futuro ─────────────────────────────────────────────────────────────────────
-- Funções novas deixam de nascer executáveis por anon/authenticated. Cada migration passa a conceder
-- EXECUTE explicitamente ao que o app realmente chama (convenção já usada em 20260731201100).
-- Não altera funções existentes (CREATE OR REPLACE preserva ACL).
-- O EXECUTE implícito de PUBLIC vem do default GLOBAL (sem IN SCHEMA); revogar só no schema não o remove
-- (provado: função nova continuava executável por authenticated). Por isso os dois comandos.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
