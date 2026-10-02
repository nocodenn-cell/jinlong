-- PR-2D / C3 — passo 2/3: autoridade única, resolvedor de caixa pagador e cache derivado.
--
-- D-1: `calcular_valor_sistema_dinheiro_caixa` é a AUTORIDADE do dinheiro do caixa. Aqui ela passa a ter uma única
-- implementação (`internal.valor_sistema_dinheiro`, sem checagem de sessão) e a função pública apenas autoriza e
-- delega. Único termo alterado: a devolução em dinheiro (termo 7) é atribuída ao caixa que DESEMBOLSOU
-- (`devolucoes.caixa_desembolso_id`) e não depende do status atual da venda quando esse campo existe.
-- Linhas legadas (caixa_desembolso_id NULL) mantêm exatamente a regra antiga → o valor de todo caixa existente
-- não muda (gate: comparar os caixas antes/depois).
--
-- D-3 / D-8b: `internal.resolver_caixa_pagador` é o ponto único da regra 0/1/N (mesma semântica que AR/AP já usam):
--   elegível = ABERTO ∧ mesma loja do usuário ∧ (dono do caixa ∨ GERENTE/DONO/ADMIN).
--   0 elegíveis → <PREFIXO>_SEM_CAIXA_ABERTO ; 1 e sem p_caixa_id → o único ; ≥2 e sem p_caixa_id →
--   <PREFIXO>_CAIXA_OBRIGATORIO (nunca primeiro/último/mais recente) ; p_caixa_id fora do conjunto → _CAIXA_INVALIDO.
--
-- `internal.sincronizar_saldo_cache`: `caixas.saldo_atual` é CACHE derivado da autoridade (nunca fonte de decisão);
-- só é escrito para caixa ABERTO (caixa fechado é imutável).
--
-- Rollback: reaplicar a definição anterior de calcular_valor_sistema_dinheiro_caixa
-- (backend/supabase/rollback/20261001100100_...rollback.sql) e DROP das três funções internal.

-- ── 1. Autoridade (implementação única) ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.valor_sistema_dinheiro(p_caixa_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result numeric(10,2);
BEGIN
  WITH vendas_din_split AS (
    SELECT COALESCE(sum(vp.valor), 0)::numeric(10,2) AS t
    FROM public.vendas_pagamentos vp JOIN public.vendas v ON v.id = vp.venda_id
    WHERE v.caixa_id = p_caixa_id AND v.status = 'CONCLUIDA' AND vp.forma_pagamento = 'DINHEIRO'
  ), vendas_din_legado AS (
    SELECT COALESCE(sum(v.total_liquido), 0)::numeric(10,2) AS t
    FROM public.vendas v
    WHERE v.caixa_id = p_caixa_id AND v.forma_pagamento = 'DINHEIRO' AND v.status = 'CONCLUIDA'
      AND NOT EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = v.id)
  ), vendas_din AS (
    SELECT public.round_abnt((SELECT t FROM vendas_din_split) + (SELECT t FROM vendas_din_legado), 2) AS t
  ), ar_din AS (
    SELECT COALESCE(sum(CASE
      WHEN lr.operacao_tipo = 'ESTORNO' THEN -lr.valor
      ELSE lr.valor END), 0)::numeric(10,2) AS t
    FROM public.liquidacoes_receber lr
    WHERE lr.caixa_id = p_caixa_id AND lr.forma_pagamento = 'DINHEIRO'
      AND COALESCE(lr.operacao_tipo, 'RECEBIMENTO') IN ('RECEBIMENTO', 'ESTORNO')
  ), mov_legado AS (
    SELECT
      COALESCE(sum(CASE WHEN m.tipo = 'SUPRIMENTO' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sup,
      COALESCE(sum(CASE WHEN m.tipo = 'SANGRIA' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sang
    FROM public.movimentos_caixa m
    WHERE m.caixa_id = p_caixa_id AND m.tipo IN ('SUPRIMENTO', 'SANGRIA')
  ), mov_tx AS (
    SELECT COALESCE(sum(CASE
      WHEN m.tipo = 'suprimento' AND m.forma_pagamento = 'dinheiro' THEN m.valor
      WHEN m.tipo = 'sangria' THEN -m.valor
      WHEN m.tipo = 'estorno' AND orig.tipo = 'sangria' THEN m.valor
      WHEN m.tipo = 'estorno' AND orig.tipo = 'suprimento' AND orig.forma_pagamento = 'dinheiro' THEN -m.valor
      ELSE 0 END), 0)::numeric(10,2) AS t
    FROM public.movimentacoes_caixa m
    LEFT JOIN public.movimentacoes_caixa orig ON orig.id = m.movimentacao_origem_id
    WHERE m.caixa_id = p_caixa_id AND m.status = 'aprovado' AND m.deleted_at IS NULL
  ), dev_din AS (
    -- Termo 7 (D-2): atribuído ao caixa que desembolsou; legado (NULL) = caixa da venda, só venda CONCLUIDA.
    SELECT COALESCE(sum(d.valor), 0)::numeric(10,2) AS t
    FROM public.devolucoes d JOIN public.vendas v ON v.id = d.venda_id
    WHERE d.forma_pagamento = 'DINHEIRO'
      AND COALESCE(d.caixa_desembolso_id, v.caixa_id) = p_caixa_id
      AND (d.caixa_desembolso_id IS NOT NULL OR v.status = 'CONCLUIDA')
  ), abertura AS (
    SELECT COALESCE(c.valor_inicial, 0)::numeric(10,2) AS t
    FROM public.caixas c WHERE c.id = p_caixa_id
  )
  SELECT public.round_abnt(
    COALESCE((SELECT t FROM abertura), 0)
    + (SELECT t FROM vendas_din)
    + (SELECT t FROM ar_din)
    + (SELECT sup FROM mov_legado) - (SELECT sang FROM mov_legado)
    + (SELECT t FROM mov_tx) - (SELECT t FROM dev_din), 2
  )::numeric(10,2) INTO v_result;

  RETURN v_result;
END;
$function$;

-- Função pública: mesma assinatura e mesma autorização; delega à implementação única.
CREATE OR REPLACE FUNCTION public.calcular_valor_sistema_dinheiro_caixa(p_caixa_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.caixas c
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = p_caixa_id AND c.loja_id = u.loja_id
        AND (c.operador_id = auth.uid() OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN'))
    ) THEN
      RAISE EXCEPTION 'Acesso negado ao caixa informado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN internal.valor_sistema_dinheiro(p_caixa_id);
END;
$function$;

-- ── 2. Resolvedor 0/1/N (ponto único da regra de elegibilidade) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.resolver_caixa_pagador(
  p_caixa_id uuid,
  p_uid uuid,
  p_prefixo text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loja uuid;
  v_perfil text;
  v_elegiveis uuid[];
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION '%', p_prefixo || '_AUTH';
  END IF;

  SELECT u.loja_id, u.perfil INTO v_loja, v_perfil FROM public.usuarios u WHERE u.id = p_uid;
  IF v_loja IS NULL THEN
    RAISE EXCEPTION '%', p_prefixo || '_SEM_PERMISSAO';
  END IF;

  -- Elegível = ABERTO ∧ mesma loja do usuário ∧ (dono do caixa ∨ perfil gerencial). A ordem do array é só
  -- para determinismo do teste; NUNCA é usada para escolher entre vários.
  SELECT COALESCE(array_agg(c.id ORDER BY c.id), ARRAY[]::uuid[]) INTO v_elegiveis
  FROM public.caixas c
  WHERE c.status = 'ABERTO'
    AND c.loja_id = v_loja
    AND (c.operador_id = p_uid OR v_perfil IN ('GERENTE', 'DONO', 'ADMIN'));

  IF cardinality(v_elegiveis) = 0 THEN
    RAISE EXCEPTION '%', p_prefixo || '_SEM_CAIXA_ABERTO';
  END IF;

  IF p_caixa_id IS NOT NULL THEN
    IF NOT (p_caixa_id = ANY (v_elegiveis)) THEN
      RAISE EXCEPTION '%', p_prefixo || '_CAIXA_INVALIDO';
    END IF;
    RETURN p_caixa_id;
  END IF;

  IF cardinality(v_elegiveis) = 1 THEN
    RETURN v_elegiveis[1];
  END IF;

  RAISE EXCEPTION '%', p_prefixo || '_CAIXA_OBRIGATORIO';
END;
$function$;

-- ── 3. Cache derivado (D-1): nunca autoridade; caixa fechado é imutável ─────────────────────────────
CREATE OR REPLACE FUNCTION internal.sincronizar_saldo_cache(p_caixa_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.caixas c
     SET saldo_atual = internal.valor_sistema_dinheiro(c.id)
   WHERE c.id = p_caixa_id AND c.status = 'ABERTO';
$function$;

-- As funções internal só são chamadas por outras funções SECURITY DEFINER (rodam como dono).
REVOKE ALL ON FUNCTION internal.valor_sistema_dinheiro(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal.resolver_caixa_pagador(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal.sincronizar_saldo_cache(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.valor_sistema_dinheiro(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION internal.resolver_caixa_pagador(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION internal.sincronizar_saldo_cache(uuid) TO service_role;

COMMENT ON FUNCTION internal.valor_sistema_dinheiro(uuid) IS
  'AUTORIDADE do dinheiro esperado no caixa (D-1). Implementação única; public.calcular_valor_sistema_dinheiro_caixa autoriza e delega.';
COMMENT ON FUNCTION internal.resolver_caixa_pagador(uuid, uuid, text) IS
  'Regra 0/1/N de caixa elegível (D-3/D-8b). Erros: <PREFIXO>_SEM_CAIXA_ABERTO | _CAIXA_OBRIGATORIO | _CAIXA_INVALIDO.';
COMMENT ON FUNCTION internal.sincronizar_saldo_cache(uuid) IS
  'caixas.saldo_atual = cache derivado da autoridade; só para caixa ABERTO. Nenhuma decisão financeira pode ler saldo_atual.';
