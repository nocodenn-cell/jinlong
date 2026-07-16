-- ============================================================
-- Migration 274 — CAPTURE de reconciliação (P0.1, 2ª varredura)
-- Versiona funções aplicadas em produção sem migration correspondente,
-- descobertas por inventário EXAUSTIVO (todas as 95 funções de public,
-- não só as suspeitas). Captura fiel de 2026-07-16. Idempotente
-- (CREATE OR REPLACE). 0 usos no código do app (WIP/legado — ver nota).
-- ============================================================

-- Depende de public.funcionarios_meta (migration 270) + public.comissoes_vendedores (existente).

CREATE OR REPLACE FUNCTION public.fn_listar_funcionarios_gerente(p_loja_id uuid, p_termo text DEFAULT NULL::text, p_status text DEFAULT 'todos'::text)
 RETURNS TABLE(id uuid, usuario_id uuid, nome_exibicao text, email text, cargo text, comissao_percentual numeric, comissao_tipo text, comissao_valor numeric, data_admissao date, ativo boolean, criado_em timestamp with time zone, criado_por_nome text)
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
BEGIN RETURN QUERY SELECT fm.id, fm.usuario_id, fm.nome_exibicao, fm.email, fm.cargo, fm.comissao_percentual, fm.comissao_tipo, fm.comissao_valor, fm.data_admissao, fm.ativo, fm.criado_em, u_criado.nome FROM public.funcionarios_meta fm LEFT JOIN public.usuarios u_criado ON u_criado.id = fm.criado_por WHERE fm.loja_id = p_loja_id AND (p_status = 'todos' OR (p_status = 'ativos' AND fm.ativo = true) OR (p_status = 'inativos' AND fm.ativo = false)) AND (p_termo IS NULL OR fm.nome_exibicao ILIKE '%' || p_termo || '%' OR fm.email ILIKE '%' || p_termo || '%') ORDER BY fm.nome_exibicao ASC; END;
$function$;

CREATE OR REPLACE FUNCTION public.resumo_comissoes_por_funcionario(p_loja_id uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS TABLE(funcionario_id uuid, nome text, total_vendas bigint, total_comissao numeric, total_pago numeric, total_pendente numeric, cargo text, data_admissao date)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
SELECT fm.usuario_id, fm.nome_exibicao, COUNT(c.id), SUM(c.valor_comissao), SUM(CASE WHEN c.status = 'pago' THEN c.valor_comissao ELSE 0 END), SUM(CASE WHEN c.status = 'pendente' THEN c.valor_comissao ELSE 0 END), fm.cargo, fm.data_admissao FROM public.funcionarios_meta fm LEFT JOIN public.usuarios u ON u.id = fm.usuario_id LEFT JOIN public.comissoes_vendedores c ON c.operador_id = u.id WHERE fm.loja_id = p_loja_id AND fm.ativo = true AND (p_de IS NULL OR DATE(c.created_at) >= p_de) AND (p_ate IS NULL OR DATE(c.created_at) <= p_ate) AND c.id IS NOT NULL GROUP BY fm.usuario_id, fm.nome_exibicao, fm.cargo, fm.data_admissao;
$function$;

CREATE OR REPLACE FUNCTION public.total_vendas_por_funcionario(p_loja_id uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS TABLE(funcionario_id uuid, nome text, total_vendas bigint, valor_total numeric, valor_medio numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
SELECT fm.usuario_id, fm.nome_exibicao, COUNT(v.id), SUM(v.total_liquido), AVG(v.total_liquido) FROM public.funcionarios_meta fm LEFT JOIN public.usuarios u ON u.id = fm.usuario_id LEFT JOIN public.vendas v ON v.operador_id = u.id WHERE fm.loja_id = p_loja_id AND fm.ativo = true AND (p_de IS NULL OR DATE(v.created_at) >= p_de) AND (p_ate IS NULL OR DATE(v.created_at) <= p_ate) AND v.id IS NOT NULL AND v.status = 'CONCLUIDA' GROUP BY fm.usuario_id, fm.nome_exibicao;
$function$;

-- ---------- órfã: sem tabela "estoque" simples correspondente ao uso legado ----------
-- baixar_estoque_venda usa public.estoque(quantidade_atual) — esquema legado/paralelo
-- ao fluxo canônico (decrementar_estoque_seguro). 0 usos em pdv-importados/core;
-- 1 referência em script solto. Capturada por fidelidade; NÃO É o fluxo oficial
-- (guard:rpc já confirma que a venda usa decrementar_estoque_seguro via v4).
CREATE OR REPLACE FUNCTION public.baixar_estoque_venda(p_loja_id uuid, p_itens jsonb)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  item RECORD;
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(p_itens) AS x(produto_id UUID, qtd INT)
  LOOP
    UPDATE estoque
    SET quantidade_atual = quantidade_atual - item.qtd
    WHERE produto_id = item.produto_id AND loja_id = p_loja_id AND quantidade_atual >= item.qtd;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque insuficiente para o produto %', item.produto_id;
    END IF;
  END LOOP;
END;
$function$;

-- ---------- diagnóstico self-referencial (gate de integridade) ----------
CREATE OR REPLACE FUNCTION public.caixa_integridade_gate_check()
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'trigger_206', EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'vendas'
        AND t.tgname = 'trg_vendas_caixa_aberto_bi'
        AND NOT t.tgisinternal
    ),
    'advisory_lock_v3', EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'finalizar_venda_transacional_canonica_v3'
        AND pg_get_functiondef(p.oid) LIKE '%pg_advisory_xact_lock%'
    )
  );
$function$;

-- ---------- helper de leitura para saldo de caixas ----------
CREATE OR REPLACE FUNCTION public.listar_valores_sistema_dinheiro_caixas(p_caixa_ids uuid[])
 RETURNS TABLE(caixa_id uuid, valor numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    t AS caixa_id,
    public.calcular_valor_sistema_dinheiro_caixa(t) AS valor
  FROM unnest(p_caixa_ids) AS t;
$function$;
