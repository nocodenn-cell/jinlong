-- F-1 (P1): a faixa de preço passa a ser resolvida pela QUANTIDADE REAL do item.
--
-- Problema comprovado na reauditoria adversarial:
--
--   produto: varejo 10,00 | atacado 7,00 a partir de 10 unidades
--   OFFLINE, 10 un x 10,00  ->  ACEITO, cobrado R$ 100,00
--   preço canônico da quantidade: R$ 70,00
--   sobrepreço: R$ 30,00 (43%), gravado como tipo_preco='VAREJO'
--   ONLINE, mesmo payload -> REJEITADO
--
-- Causa raiz: `internal.validar_precos_venda` resolvia o catálogo com
-- `calcular_preco_produto(produto, 1, loja)` — sempre quantidade 1. Isso ancora
-- corretamente o BRUTO (preço de tabela é o de varejo), mas nunca compara o
-- preço praticado com a faixa devida para a quantidade vendida. O cliente era
-- sobrecobrado.
--
-- Correção mínima: além da âncora do bruto, o preço unitário não pode exceder o
-- preço canônico resolvido para a quantidade real. Descontos para baixo seguem
-- permitidos e continuam sujeitos ao teto de
-- `trg_fn_itens_venda_limite_desconto`.
--
-- Reuso do SSOT: a resolução continua sendo `public.calcular_preco_produto`, a
-- mesma autoridade que a v4 consulta. Nenhuma regra de varejo/atacado é
-- reescrita aqui. A conversão da quantidade para inteiro usa
-- `GREATEST(1, FLOOR(qtd))`, idêntica à da v4 (migration 300).
--
-- Duas âncoras, propósitos distintos:
--   * `preco_original <= preço de tabela (qtd 1)`  -> impede inflar o bruto;
--   * `preco_unitario <= preço canônico (qtd real)` -> impede cobrar acima da
--     faixa devida, que é o defeito desta unidade.
--
-- ROLLBACK: restaurar o corpo de
-- 20260814105031_require_store_context_for_offline_sales.sql.

BEGIN;

CREATE OR REPLACE FUNCTION internal.validar_precos_venda(
  p_itens jsonb,
  p_loja_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_produto_id uuid;
  v_qtd numeric;
  v_qtd_int integer;
  v_orig numeric;
  v_unit numeric;
  v_ref numeric;
  v_canonico numeric;
  v_calc jsonb;
  v_eps constant numeric := 0.02;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto_id := NULLIF(v_item->>'produto_id', '')::uuid;
    v_orig := (v_item->>'preco_original')::numeric;
    v_unit := (v_item->>'preco_unitario')::numeric;
    v_qtd := (v_item->>'quantidade')::numeric;

    IF v_produto_id IS NULL OR v_orig IS NULL OR v_unit IS NULL OR v_qtd IS NULL THEN
      RAISE EXCEPTION 'VENDA_PRECO_ITEM_INVALIDO';
    END IF;

    -- 1) Acréscimo por item: proibido em qualquer tipo de preço.
    IF v_unit > v_orig + v_eps THEN
      RAISE EXCEPTION 'VENDA_PRECO_ACIMA_REFERENCIA:%', v_produto_id;
    END IF;

    -- 2) O produto tem de pertencer à loja do contexto da venda (F-2).
    IF NOT EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = v_produto_id AND p.loja_id = p_loja_id
    ) THEN
      RAISE EXCEPTION 'VENDA_PRODUTO_FORA_DA_LOJA:%', v_produto_id;
    END IF;

    -- 3) Âncora do bruto no preço de tabela (referência de varejo, quantidade 1).
    v_calc := public.calcular_preco_produto(v_produto_id, 1, p_loja_id);
    IF v_calc IS NULL OR v_calc->>'preco' IS NULL THEN
      RAISE EXCEPTION 'VENDA_PRECO_NAO_RESOLVIDO:%', v_produto_id;
    END IF;
    v_ref := (v_calc->>'preco')::numeric;
    IF v_orig > v_ref + v_eps THEN
      RAISE EXCEPTION 'VENDA_PRECO_ORIGINAL_ACIMA_TABELA:%', v_produto_id;
    END IF;

    -- 4) F-1: o praticado não pode exceder a faixa devida para a QUANTIDADE REAL.
    v_qtd_int := GREATEST(1, FLOOR(v_qtd))::integer;
    v_calc := public.calcular_preco_produto(v_produto_id, v_qtd_int, p_loja_id);
    IF v_calc IS NULL OR v_calc->>'preco' IS NULL THEN
      RAISE EXCEPTION 'VENDA_PRECO_NAO_RESOLVIDO:%', v_produto_id;
    END IF;
    v_canonico := (v_calc->>'preco')::numeric;
    IF v_unit > v_canonico + v_eps THEN
      RAISE EXCEPTION 'VENDA_PRECO_ACIMA_DA_FAIXA:%', v_produto_id;
    END IF;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION internal.validar_precos_venda(jsonb, uuid) IS
  'Invariante de preco compartilhada online/offline: proibe acrescimo por item, exige produto da loja, '
  'ancora o bruto no preco de tabela e impede cobrar acima da faixa devida para a quantidade real.';

REVOKE ALL ON FUNCTION internal.validar_precos_venda(jsonb, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
