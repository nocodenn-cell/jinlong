-- Desconto comercial no dinheiro (até 10%) pelo operador, sem token de gerente.
-- Motivo: AUTORIZACAO_COMERCIAL. Acima de 10% continua exigindo gerente.
-- 100% DINHEIRO continua garantido por trg_descontos_venda_exige_pagamento_dinheiro.
BEGIN;
CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.desconto_comercial_operador_ok(
  p_token text,
  p_percentual numeric,
  p_motivo public.motivo_desconto_enum_tipo
) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_token IS NULL
    AND p_percentual IS NOT NULL
    AND p_percentual > 0
    AND p_percentual <= 10
    AND p_motivo = 'AUTORIZACAO_COMERCIAL'::public.motivo_desconto_enum_tipo
$$;
REVOKE ALL ON FUNCTION internal.desconto_comercial_operador_ok(text, numeric, public.motivo_desconto_enum_tipo)
  FROM PUBLIC, anon, authenticated;

-- Wrapper: passa o percentual comercial ao cálculo de totais mesmo sem token.
DO $$
DECLARE
  fonte text;
  proc regprocedure := 'public.finalizar_venda_transacional_canonica_v4(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid,public.motivo_desconto_enum_tipo,text,text)'::regprocedure;
BEGIN
  SELECT pg_get_functiondef(proc) INTO fonte;
  IF strpos(fonte, 'desconto_comercial_operador_ok') > 0 THEN RETURN; END IF;
  IF strpos(fonte, 'CASE WHEN p_desconto_gerente_token IS NULL THEN NULL ELSE p_desconto_gerente_percentual END') = 0 THEN
    RAISE EXCEPTION 'Desconto comercial: expressão de totais no wrapper não encontrada.';
  END IF;
  fonte := replace(
    fonte,
    'CASE WHEN p_desconto_gerente_token IS NULL THEN NULL ELSE p_desconto_gerente_percentual END',
    'CASE WHEN p_desconto_gerente_token IS NOT NULL THEN p_desconto_gerente_percentual WHEN internal.desconto_comercial_operador_ok(p_desconto_gerente_token, p_desconto_gerente_percentual, p_motivo_desconto) THEN p_desconto_gerente_percentual ELSE NULL END'
  );
  EXECUTE fonte;
END $$;

-- Unscoped: libera autenticação, cálculo e auditoria do desconto comercial.
DO $$
DECLARE
  fonte text;
  proc regprocedure := 'public.finalizar_venda_transacional_canonica_v4_unscoped(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid,public.motivo_desconto_enum_tipo,text,text)'::regprocedure;
  marca_auth text := 'p_strict_manager_discount_auth AND v_has_gerente_desconto AND p_desconto_gerente_token IS NULL';
  marca_auth2 text := 'ELSIF p_strict_manager_discount_auth AND v_has_gerente_desconto THEN';
  marca_calc text := 'IF p_desconto_gerente_token IS NOT NULL THEN
    v_desconto_gerente_valor := public.round_abnt((v_total_liquido_base_calc * p_desconto_gerente_percentual) / 100, 2);
  END IF;';
BEGIN
  SELECT pg_get_functiondef(proc) INTO fonte;
  IF strpos(fonte, 'desconto_comercial_operador_ok') > 0 THEN RETURN; END IF;

  IF strpos(fonte, marca_auth) = 0 THEN
    RAISE EXCEPTION 'Desconto comercial: guarda de token (1) não encontrada.';
  END IF;
  fonte := replace(
    fonte,
    marca_auth,
    'p_strict_manager_discount_auth AND v_has_gerente_desconto AND p_desconto_gerente_token IS NULL AND NOT internal.desconto_comercial_operador_ok(p_desconto_gerente_token, p_desconto_gerente_percentual, p_motivo_desconto)'
  );

  IF strpos(fonte, marca_auth2) > 0 THEN
    fonte := replace(
      fonte,
      marca_auth2,
      'ELSIF p_strict_manager_discount_auth AND v_has_gerente_desconto AND NOT internal.desconto_comercial_operador_ok(p_desconto_gerente_token, p_desconto_gerente_percentual, p_motivo_desconto) THEN'
    );
  END IF;

  IF strpos(fonte, marca_calc) = 0 THEN
    RAISE EXCEPTION 'Desconto comercial: cálculo do valor não encontrado.';
  END IF;
  fonte := replace(
    fonte,
    marca_calc,
    'IF p_desconto_gerente_token IS NOT NULL OR internal.desconto_comercial_operador_ok(p_desconto_gerente_token, p_desconto_gerente_percentual, p_motivo_desconto) THEN
    v_desconto_gerente_valor := public.round_abnt((v_total_liquido_base_calc * p_desconto_gerente_percentual) / 100, 2);
  END IF;'
  );

  -- Após gravar desconto com token, grava também o caminho comercial (sem token).
  IF strpos(fonte, 'motivo_descricao_livre = EXCLUDED.motivo_descricao_livre') = 0 THEN
    RAISE EXCEPTION 'Desconto comercial: âncora pós-auditoria não encontrada.';
  END IF;
  fonte := regexp_replace(
    fonte,
    'motivo_descricao_livre = EXCLUDED\.motivo_descricao_livre;\s*END IF;',
    $r$motivo_descricao_livre = EXCLUDED.motivo_descricao_livre;
  END IF;
  IF p_desconto_gerente_token IS NULL AND internal.desconto_comercial_operador_ok(p_desconto_gerente_token, p_desconto_gerente_percentual, p_motivo_desconto) THEN
    INSERT INTO public.descontos_venda (
      venda_id, gerente_id, desconto_percentual, desconto_valor, operador_id,
      aplicado_em, motivo_desconto, motivo_descricao_livre
    ) VALUES (
      p_venda_id, v_uid::text, p_desconto_gerente_percentual,
      v_desconto_gerente_valor, v_uid, now(), 'AUTORIZACAO_COMERCIAL', p_motivo_descricao
    )
    ON CONFLICT (venda_id) DO UPDATE SET
      gerente_id = EXCLUDED.gerente_id,
      desconto_percentual = EXCLUDED.desconto_percentual,
      desconto_valor = EXCLUDED.desconto_valor,
      operador_id = EXCLUDED.operador_id,
      aplicado_em = EXCLUDED.aplicado_em,
      motivo_desconto = EXCLUDED.motivo_desconto,
      motivo_descricao_livre = EXCLUDED.motivo_descricao_livre;
  END IF;$r$,
    1
  );

  EXECUTE fonte;
END $$;

DO $verify$
DECLARE
  w text := pg_get_functiondef('public.finalizar_venda_transacional_canonica_v4(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid,public.motivo_desconto_enum_tipo,text,text)'::regprocedure);
  u text := pg_get_functiondef('public.finalizar_venda_transacional_canonica_v4_unscoped(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid,public.motivo_desconto_enum_tipo,text,text)'::regprocedure);
BEGIN
  IF strpos(w, 'desconto_comercial_operador_ok') = 0 THEN
    RAISE EXCEPTION 'VERIFY: wrapper sem desconto comercial do operador';
  END IF;
  IF strpos(u, 'desconto_comercial_operador_ok') = 0 THEN
    RAISE EXCEPTION 'VERIFY: unscoped sem desconto comercial do operador';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';
COMMIT;
