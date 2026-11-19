-- JL-GO-LIVE-01 (2026-11-04): título ou caixa fora do escopo do usuário responde igual a inexistente.
--
-- Causa: os wrappers públicos de liquidação de contas a receber e de pagamento de contas a pagar chamavam
-- fp_assert_loja antes da regra interna. Para recurso de outra loja, o wrapper lançava ACESSO_LOJA_NEGADO; para
-- recurso inexistente, a regra interna devolvia o "não encontrado". A diferença revelava a existência do recurso.
--
-- Contrato (decisão do proprietário): para título ou caixa fora do escopo, a resposta é a mesma de inexistente:
--   título (contas a receber)  -> LIQUIDACAO_TITULO
--   conta (contas a pagar)     -> PAGAMENTO_CONTA_NAO_ENCONTRADA
--   caixa (contas a receber)   -> LIQUIDACAO_CAIXA_INVALIDO
--   caixa (contas a pagar)     -> PAGAMENTO_CAIXA_INVALIDO
-- A regra interna continua decidindo o resto (perfil, valor, idempotência, caixa da loja do título).
-- Não há relaxamento: sem escopo, nada é gravado; sem identidade ou em contexto de servidor, o comportamento é o anterior.
--
-- ROLLBACK: backend/supabase/rollback/20261104180000_go_live01_titulo_caixa_fora_do_escopo.rollback.sql

BEGIN;

-- Verdadeiro se o recurso não existe, se não há identidade/contexto que exija checagem, ou se a loja do recurso
-- está no escopo do usuário. Não lança erro: quem decide a resposta é o wrapper, com o código de inexistente.
CREATE OR REPLACE FUNCTION internal.fp_recurso_no_escopo(p_tipo text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_loja uuid;
BEGIN
  IF p_id IS NULL OR coalesce(internal.fp_contexto_servidor(), false) OR auth.uid() IS NULL THEN
    RETURN true;
  END IF;
  v_loja := public.fp_loja_de(p_tipo, p_id);
  IF v_loja IS NULL THEN
    RETURN true; -- inexistente: a regra interna responde "não encontrado"
  END IF;
  RETURN public.fp_pode_loja(v_loja, NULL);
END
$$;

REVOKE ALL ON FUNCTION internal.fp_recurso_no_escopo(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_liquidacao_receber(
  p_titulo_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_observacao text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_caixa_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT 'UI_FINANCEIRO'::text
)
RETURNS TABLE(liquidacao_id uuid, titulo_id uuid, valor numeric, valor_aberto numeric, status text, caixa_id uuid, idempotent_replay boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Perfil primeiro (mesmo critério da regra interna): a negação por perfil não depende do recurso.
  IF auth.uid() IS NOT NULL AND NOT coalesce(internal.fp_contexto_servidor(), false) AND NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'LIQUIDACAO_PERFIL' USING ERRCODE = 'P0001';
  END IF;
  IF NOT internal.fp_recurso_no_escopo('conta_receber', p_titulo_id) THEN
    RAISE EXCEPTION 'LIQUIDACAO_TITULO' USING ERRCODE = 'P0001';
  END IF;
  IF NOT internal.fp_recurso_no_escopo('caixa', p_caixa_id) THEN
    RAISE EXCEPTION 'LIQUIDACAO_CAIXA_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT * FROM internal.registrar_liquidacao_receber(
    p_titulo_id => p_titulo_id, p_valor => p_valor, p_forma_pagamento => p_forma_pagamento,
    p_observacao => p_observacao, p_idempotency_key => p_idempotency_key,
    p_caixa_id => p_caixa_id, p_origem => p_origem);
END
$$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_contas_pagar(
  p_conta_id uuid,
  p_valor numeric,
  p_forma text,
  p_data timestamp with time zone DEFAULT now(),
  p_observacao text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_caixa_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT 'UI_FINANCEIRO'::text,
  p_autorizacao_token text DEFAULT NULL::text
)
RETURNS TABLE(pagamento_id uuid, conta_id uuid, valor numeric, valor_pago numeric, status text, caixa_id uuid, movimentacao_caixa_id uuid, idempotent_replay boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Perfil primeiro (mesmo critério da regra interna): a negação por perfil não depende do recurso.
  IF auth.uid() IS NOT NULL AND NOT coalesce(internal.fp_contexto_servidor(), false) AND NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'PAGAMENTO_PERFIL' USING ERRCODE = 'P0001';
  END IF;
  IF NOT internal.fp_recurso_no_escopo('conta_pagar', p_conta_id) THEN
    RAISE EXCEPTION 'PAGAMENTO_CONTA_NAO_ENCONTRADA' USING ERRCODE = 'P0001';
  END IF;
  IF NOT internal.fp_recurso_no_escopo('caixa', p_caixa_id) THEN
    RAISE EXCEPTION 'PAGAMENTO_CAIXA_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT * FROM internal.registrar_pagamento_contas_pagar(
    p_conta_id => p_conta_id, p_valor => p_valor, p_forma => p_forma, p_data => p_data,
    p_observacao => p_observacao, p_idempotency_key => p_idempotency_key, p_caixa_id => p_caixa_id,
    p_origem => p_origem, p_autorizacao_token => p_autorizacao_token);
END
$$;

-- Produto fora do escopo responde igual a inexistente (regra 2): sem ACESSO_LOJA_NEGADO, que revelaria o produto.
CREATE OR REPLACE FUNCTION public.atualizar_produto_com_faixa_atacado(
  p_produto_id uuid,
  p_payload jsonb,
  p_ator_id uuid DEFAULT NULL::uuid,
  p_faixa jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Escopo de produto é por empresa (Padrão A: DONO/ADMIN global dentro da empresa). Fora da empresa, o guard
  -- lança ACESSO_LOJA_NEGADO (42501); aqui vira a mesma resposta de inexistente. A regra de loja do GERENTE
  -- continua no corpo interno, que já responde ATUALIZAR_PRODUTO_NAO_ENCONTRADO.
  BEGIN
    PERFORM public.fp_assert_produto(p_produto_id, 'atualizar_produto_com_faixa_atacado.p_produto_id');
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_NAO_ENCONTRADO' USING ERRCODE = 'P0001';
  END;
  RETURN internal.atualizar_produto_com_faixa_atacado(
    p_produto_id => p_produto_id, p_payload => p_payload, p_ator_id => p_ator_id, p_faixa => p_faixa);
END
$$;

COMMIT;
