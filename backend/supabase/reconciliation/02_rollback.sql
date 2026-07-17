-- P0 Rollback — reverte 248/252/256. DESTRUTIVO. Só com confirmação + após PITR snapshot.
-- Preferir SEMPRE fix-forward; usar isto apenas se a aplicação falhar ou precisar reverter.
-- Ordem: reverso da aplicação (256 -> 252 -> 248). Wrap manualmente em transação por bloco.

-- ============ 256 rollback ============
DROP FUNCTION IF EXISTS public.pdv_diagnostico_pre_producao();
-- (se houver overload com args, dropar pela assinatura exata via \df pdv_diagnostico_pre_producao)

-- ============ 252 rollback ============
DROP FUNCTION IF EXISTS public.trg_finance_context_via_conta() CASCADE;
DROP FUNCTION IF EXISTS public.trg_finance_context_via_pagamento() CASCADE;
DROP FUNCTION IF EXISTS public.sincronizar_finance_context_venda(uuid) CASCADE;  -- ajustar assinatura via \df
DROP TABLE IF EXISTS public.venda_finance_context;  -- só se aceitável perder o espelho (é derivável)

-- ============ 248 rollback ============
-- 1) Restaurar o check de venda_eventos ao estado PRE-248 (capturado 2026-07-16):
ALTER TABLE public.venda_eventos DROP CONSTRAINT IF EXISTS venda_eventos_event_type_check;
ALTER TABLE public.venda_eventos
  ADD CONSTRAINT venda_eventos_event_type_check
  CHECK ((event_type = ANY (ARRAY['SALE_REGISTERED'::text, 'SALE_CANCELLED'::text])));

-- 2) Restaurar v_kardex_unificado ao estado PRE-248 (captura fiel de produção 2026-07-16):
CREATE OR REPLACE VIEW public.v_kardex_unificado AS
 SELECT 'mel:'::text || m.id::text AS evento_id,
    m.created_at AS ocorrido_em, m.loja_id, m.produto_id, m.quantidade_delta,
    'movimentos_estoque_log'::text AS origem, m.tipo_codigo,
    COALESCE(m.venda_id, m.id) AS referencia_id, m.usuario_id, m.observacao
   FROM movimentos_estoque_log m
UNION ALL
 SELECT (('eb:'::text || eb.venda_id::text) || ':'::text) || eb.produto_id::text AS evento_id,
    eb.created_at AS ocorrido_em, c.loja_id, eb.produto_id,
    (- COALESCE(eb.quantidade, ivsum.qtd, 0::numeric))::numeric(10,3) AS quantidade_delta,
    'estoque_baixas'::text AS origem, 'SAIDA_VENDA'::text AS tipo_codigo,
    eb.venda_id AS referencia_id, v.operador_id AS usuario_id, NULL::text AS observacao
   FROM estoque_baixas eb
     JOIN vendas v ON v.id = eb.venda_id
     JOIN caixas c ON c.id = v.caixa_id
     LEFT JOIN LATERAL ( SELECT sum(iv.quantidade)::numeric(10,3) AS qtd
           FROM itens_venda iv WHERE iv.venda_id = eb.venda_id AND iv.produto_id = eb.produto_id) ivsum ON true
  WHERE NOT (EXISTS ( SELECT 1 FROM movimentos_estoque_log mel
          WHERE mel.venda_id = eb.venda_id AND mel.produto_id = eb.produto_id AND mel.tipo_codigo = 'SAIDA_VENDA'::text))
UNION ALL
 SELECT (('erc:'::text || erc.venda_id::text) || ':'::text) || erc.produto_id::text AS evento_id,
    erc.created_at AS ocorrido_em, c.loja_id, erc.produto_id, erc.quantidade AS quantidade_delta,
    'estoque_reposicoes_cancelamento'::text AS origem, 'ENTRADA_CANCELAMENTO_VENDA'::text AS tipo_codigo,
    erc.venda_id AS referencia_id, vca.operador_id AS usuario_id, vca.motivo AS observacao
   FROM estoque_reposicoes_cancelamento erc
     JOIN vendas v ON v.id = erc.venda_id
     JOIN caixas c ON c.id = v.caixa_id
     LEFT JOIN vendas_canceladas_auditoria vca ON vca.venda_id = erc.venda_id;

-- 3) Remover coluna e função novas:
ALTER TABLE public.devolucoes DROP COLUMN IF EXISTS operacao_id;
DROP FUNCTION IF EXISTS public.devolver_ou_trocar_venda CASCADE;      -- ajustar assinatura via \df
DROP FUNCTION IF EXISTS public.quantidade_devolvida_item_venda CASCADE;
-- cancelar_venda_transacional foi CREATE OR REPLACE em 248: restaurar corpo PRE-248.
-- Corpo real capturado via pg_get_functiondef em produção (jinlong) em 2026-07-17,
-- imediatamente antes de aplicar a 248. Diferença chave vs. pós-248: esta versão NÃO
-- chama registrar_venda_evento no final (a 248 adiciona esse ledger event).
CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional(p_venda_id uuid, p_motivo text, p_operador_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(venda_id uuid, status_venda text, valor_estornado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_venda record;
  v_caixa record;
  v_item record;
  v_valor_estornado numeric(10,2) := 0;
  v_tem_split boolean := false;
  v_forma_auditoria text;
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_AUTH';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_MOTIVO_OBRIGATORIO';
  END IF;

  SELECT v.*
  INTO v_venda
  FROM public.vendas v
  WHERE v.id = p_venda_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_NAO_ENCONTRADA';
  END IF;
  IF v_venda.status = 'CANCELADA' THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_JA_CANCELADA';
  END IF;

  SELECT c.*
  INTO v_caixa
  FROM public.caixas c
  WHERE c.id = v_venda.caixa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = v_uid
      AND u.loja_id = v_caixa.loja_id
      AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_SEM_PERMISSAO';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id LIMIT 1
  )
  INTO v_tem_split;

  FOR v_item IN
    SELECT iv.produto_id, iv.quantidade
    FROM public.itens_venda iv
    WHERE iv.venda_id = p_venda_id
  LOOP
    PERFORM 1
    FROM public.estoque e
    WHERE e.produto_id = v_item.produto_id
      AND e.loja_id = v_caixa.loja_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_ESTOQUE_NAO_ENCONTRADO';
    END IF;

    UPDATE public.estoque e
    SET
      quantidade_atual = e.quantidade_atual + v_item.quantidade,
      version = e.version + 1,
      updated_at = now()
    WHERE e.produto_id = v_item.produto_id
      AND e.loja_id = v_caixa.loja_id;

    INSERT INTO public.estoque_reposicoes_cancelamento (venda_id, produto_id, quantidade)
    VALUES (p_venda_id, v_item.produto_id, v_item.quantidade)
    ON CONFLICT (venda_id, produto_id) DO NOTHING;
  END LOOP;

  IF v_tem_split THEN
    SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
    INTO v_valor_estornado
    FROM public.vendas_pagamentos vp
    WHERE vp.venda_id = p_venda_id;
    v_valor_estornado := ROUND(v_valor_estornado, 2);

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    SELECT
      p_venda_id,
      ROUND(SUM(vp.valor), 2),
      vp.forma_pagamento,
      v_motivo,
      v_uid
    FROM public.vendas_pagamentos vp
    WHERE vp.venda_id = p_venda_id
    GROUP BY vp.forma_pagamento;

    IF v_valor_estornado > 0 THEN
      UPDATE public.caixas c
      SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
      WHERE c.id = v_caixa.id
        AND (c.saldo_atual - v_valor_estornado) >= 0;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE';
      END IF;
    END IF;

    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := ROUND(COALESCE(v_venda.total_liquido, 0), 2);

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid)
    ON CONFLICT DO NOTHING;

    UPDATE public.caixas c
    SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
    WHERE c.id = v_caixa.id
      AND (c.saldo_atual - v_valor_estornado) >= 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE';
    END IF;

    v_forma_auditoria := v_venda.forma_pagamento;
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (
      p_venda_id,
      ROUND(COALESCE(v_venda.total_liquido, 0), 2),
      v_venda.forma_pagamento,
      v_motivo,
      v_uid
    );
    v_valor_estornado := 0;
    v_forma_auditoria := v_venda.forma_pagamento;
  END IF;

  UPDATE public.vendas
  SET status = 'CANCELADA'
  WHERE id = p_venda_id;

  INSERT INTO public.vendas_canceladas_auditoria (
    venda_id,
    caixa_id,
    operador_id,
    motivo,
    forma_pagamento,
    valor_estornado
  )
  VALUES (
    p_venda_id,
    v_caixa.id,
    v_uid,
    v_motivo,
    v_forma_auditoria,
    CASE WHEN v_tem_split THEN (
      SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
      FROM public.vendas_pagamentos vp
      WHERE vp.venda_id = p_venda_id
    )
    WHEN v_venda.forma_pagamento = 'DINHEIRO' THEN ROUND(COALESCE(v_venda.total_liquido, 0), 2)
    ELSE 0::numeric(10,2)
    END
  )
  ON CONFLICT (venda_id) DO NOTHING;

  RETURN QUERY
  SELECT p_venda_id, 'CANCELADA'::text, v_valor_estornado;
END;
$function$;

-- 4) Índices e tabelas novas (só se vazias):
DROP INDEX IF EXISTS public.uq_devolucoes_operacao_forma;
-- (uq_devolucoes_venda_dinheiro_legacy: 248 recriou; avaliar restaurar uq_devolucoes_venda_dinheiro)
DROP TABLE IF EXISTS public.estoque_reposicoes_devolucao;
DROP TABLE IF EXISTS public.venda_pos_venda_itens;
DROP TABLE IF EXISTS public.venda_pos_venda_operacoes;

-- Após rollback, rodar 01_validation.sql (esperar todos = false) e confirmar fluxo de venda intacto.
