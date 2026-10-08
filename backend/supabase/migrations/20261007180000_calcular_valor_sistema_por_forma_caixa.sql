-- PR A — Fechamento por forma: read model canônico (somente leitura).
-- DINHEIRO = E(c) via internal.valor_sistema_dinheiro (sem segunda fórmula).
-- PIX/CARTAO_* = registrado Jinlong (vendas CONCLUIDA − devoluções filtradas).
-- FIADO como forma está desabilitado (CHECK); CR parcial = contas_receber, não linha de forma.
-- Não persiste saldo; não toca fechar_caixa; não é conciliação bancária.
-- Contrato: docs/regras-negocio/CONTRATO_FECHAMENTO_POR_FORMA.md
-- Rollback: DROP FUNCTION public.calcular_valor_sistema_por_forma_caixa(uuid);
--           DROP FUNCTION internal.valor_sistema_registrado_forma(uuid, text);

BEGIN;

CREATE OR REPLACE FUNCTION internal.valor_sistema_registrado_forma(
  p_caixa_id uuid,
  p_forma text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_forma text := upper(btrim(COALESCE(p_forma, '')));
  v_split numeric(10,2);
  v_legado numeric(10,2);
  v_dev numeric(10,2);
BEGIN
  IF v_forma NOT IN ('PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO') THEN
    RAISE EXCEPTION 'FORMA_REGISTRADA_INVALIDA'
      USING DETAIL = 'use PIX|CARTAO_DEBITO|CARTAO_CREDITO; DINHEIRO usa E(c); FIADO desabilitado';
  END IF;

  SELECT COALESCE(sum(vp.valor), 0)::numeric(10,2)
    INTO v_split
  FROM public.vendas_pagamentos vp
  JOIN public.vendas v ON v.id = vp.venda_id
  WHERE v.caixa_id = p_caixa_id
    AND v.status = 'CONCLUIDA'
    AND vp.forma_pagamento = v_forma;

  SELECT COALESCE(sum(v.total_liquido), 0)::numeric(10,2)
    INTO v_legado
  FROM public.vendas v
  WHERE v.caixa_id = p_caixa_id
    AND v.status = 'CONCLUIDA'
    AND v.forma_pagamento = v_forma
    AND NOT EXISTS (
      SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = v.id
    );

  SELECT COALESCE(sum(d.valor), 0)::numeric(10,2)
    INTO v_dev
  FROM public.devolucoes d
  JOIN public.vendas v ON v.id = d.venda_id
  WHERE d.forma_pagamento = v_forma
    AND COALESCE(d.caixa_desembolso_id, v.caixa_id) = p_caixa_id
    AND (d.caixa_desembolso_id IS NOT NULL OR v.status = 'CONCLUIDA');

  RETURN public.round_abnt(v_split + v_legado - v_dev, 2)::numeric(10,2);
END;
$function$;

COMMENT ON FUNCTION internal.valor_sistema_registrado_forma(uuid, text) IS
  'Registrado Jinlong por forma (PIX/cartões): vendas CONCLUIDA − devoluções. Sem abertura/mov/AR. Não é E(c).';

CREATE OR REPLACE FUNCTION public.calcular_valor_sistema_por_forma_caixa(p_caixa_id uuid)
RETURNS TABLE (
  forma_pagamento text,
  valor_sistema numeric(10,2),
  metrica text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_caixa_id IS NULL THEN
    RAISE EXCEPTION 'CAIXA_ID_OBRIGATORIO';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.caixas c WHERE c.id = p_caixa_id) THEN
    RAISE EXCEPTION 'CAIXA_NAO_ENCONTRADO';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.caixas c
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = p_caixa_id
        AND c.loja_id = u.loja_id
        AND (c.operador_id = auth.uid() OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN'))
    ) THEN
      RAISE EXCEPTION 'Acesso negado ao caixa informado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    f.forma::text,
    CASE
      WHEN f.forma = 'DINHEIRO' THEN internal.valor_sistema_dinheiro(p_caixa_id)
      ELSE internal.valor_sistema_registrado_forma(p_caixa_id, f.forma)
    END::numeric(10,2),
    CASE
      WHEN f.forma = 'DINHEIRO' THEN 'E_C_AUTORIDADE'::text
      ELSE 'REGISTRADO_JINLONG'::text
    END
  FROM (
    VALUES
      ('DINHEIRO'),
      ('PIX'),
      ('CARTAO_DEBITO'),
      ('CARTAO_CREDITO')
  ) AS f(forma);
END;
$function$;

COMMENT ON FUNCTION public.calcular_valor_sistema_por_forma_caixa(uuid) IS
  'Read model fechamento por forma. DINHEIRO=E(c); demais=registrado Jinlong. Não é conciliação bancária/adquirente.';

REVOKE ALL ON FUNCTION internal.valor_sistema_registrado_forma(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.valor_sistema_registrado_forma(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.calcular_valor_sistema_por_forma_caixa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_valor_sistema_por_forma_caixa(uuid)
  TO authenticated, service_role;

-- Prova estrutural: DINHEIRO deve delegar a E(c); proibido reimplementar abertura/mov na facade.
DO $prova$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(
    'public.calcular_valor_sistema_por_forma_caixa(uuid)'::regprocedure
  ) INTO def;

  IF position('internal.valor_sistema_dinheiro' in def) = 0 THEN
    RAISE EXCEPTION 'POR_FORMA PROVA FAIL: DINHEIRO deve chamar internal.valor_sistema_dinheiro';
  END IF;

  IF position('valor_inicial' in def) > 0 THEN
    RAISE EXCEPTION 'POR_FORMA PROVA FAIL: facade não pode recalcular E(c) (valor_inicial)';
  END IF;

  IF position('movimentacoes_caixa' in def) > 0
     OR position('movimentos_caixa' in def) > 0 THEN
    RAISE EXCEPTION 'POR_FORMA PROVA FAIL: facade não embute movimentação física';
  END IF;

  IF position('REGISTRADO_JINLONG' in def) = 0
     OR position('E_C_AUTORIDADE' in def) = 0 THEN
    RAISE EXCEPTION 'POR_FORMA PROVA FAIL: métricas E_C_AUTORIDADE/REGISTRADO_JINLONG obrigatórias';
  END IF;
END;
$prova$;

COMMIT;
