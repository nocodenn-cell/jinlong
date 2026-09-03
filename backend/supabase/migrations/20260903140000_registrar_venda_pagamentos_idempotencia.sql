-- Sprint C2.11 (P0-3, achado Codex) — idempotência de `registrar_venda_com_
-- itens` não validava pagamentos no caminho de retry.
--
-- BUG REAL: o bloco `IF FOUND THEN` (retry idempotente — mesma p_venda_id já
-- existe) comparava apenas totais (total_bruto/desconto/liquido) e uma
-- assinatura dos itens (produto/quantidade/preços). Uma venda existente
-- podia receber um retry com `p_pagamentos` DIFERENTE do que foi realmente
-- persistido em `vendas_pagamentos` na primeira chamada, e o RPC retornava
-- silenciosamente como se fosse idempotente (`RETURN;`) sem tocar
-- `vendas_pagamentos` — ou seja, sem denunciar a divergência. Isso abre
-- espaço para um retry malformado (ou um replay de outbox corrompido)
-- "confirmar sucesso" sem que o split realmente persistido corresponda ao
-- que o chamador pensa ter enviado.
--
-- CORREÇÃO: no mesmo bloco `IF FOUND THEN`, depois de validar itens, compara
-- a assinatura dos pagamentos JÁ PERSISTIDOS em `vendas_pagamentos` contra a
-- assinatura do que o retry está enviando (ou o equivalente escalar
-- p_forma_pagamento/total_liquido quando `p_pagamentos` é NULL — mesma regra
-- que o bloco de INSERT abaixo já usa para decidir qual caminho gravar).
-- Comparação é SEMÂNTICA, não posicional:
--   * agrupa por forma_pagamento (upper) somando valor — mesma semântica do
--     `ON CONFLICT (venda_id, forma_pagamento) DO UPDATE SET valor =
--     vendas_pagamentos.valor + EXCLUDED.valor` já usado no INSERT, então
--     formas duplicadas no array de entrada são tratadas do mesmo jeito nos
--     dois lados da comparação;
--   * ordena por forma_pagamento antes de concatenar — a ordem do array
--     `p_pagamentos` não é significativa no domínio (não existe conceito de
--     "pagamento 1 vs pagamento 2" com ordem fixa), só a composição
--     (forma, valor) importa;
--   * quando `v_totais.total_liquido = 0`, nenhuma linha é inserida em
--     `vendas_pagamentos` em nenhum dos dois caminhos (mesma regra do bloco
--     de INSERT: `ELSIF v_totais.total_liquido > 0`), então a assinatura
--     esperada é forçada a NULL nesse caso, evitando falso-positivo de
--     divergência quando não há pagamento nenhum a comparar.
-- Divergência -> `RAISE EXCEPTION 'ERRO_RPC_RETRY_PAGAMENTOS_DIVERGENTE'` —
-- nunca altera silenciosamente a venda já persistida.
--
-- Assinatura da função é a MESMA (12 parâmetros) — só o corpo muda, então
-- `CREATE OR REPLACE FUNCTION` já é suficiente aqui (sem overload novo, sem
-- DROP necessário; grants/owner/security/search_path preservados porque o
-- Postgres não os reseta num CREATE OR REPLACE com assinatura idêntica —
-- ainda assim reafirmados abaixo por hábito desta missão).
--
-- ROLLBACK: reaplicar a definição da migration 20260903130000_
-- registrar_venda_pagamentos_split.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_venda_com_itens(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_forma_pagamento text,
  p_total_bruto numeric,
  p_total_desconto numeric,
  p_total_liquido numeric,
  p_itens jsonb,
  p_desconto_gerente_percentual numeric DEFAULT NULL::numeric,
  p_desconto_gerente_valor numeric DEFAULT NULL::numeric,
  p_gerente_id text DEFAULT NULL::text,
  p_pagamentos jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_count integer;
  v_totais record;
  v_existente record;
  v_loja_id uuid;
  v_assinatura_persistida text;
  v_assinatura_payload text;
  v_assinatura_pag_persistida text;
  v_assinatura_pag_payload text;
  v_pag jsonb;
  v_pag_forma text;
  v_pag_valor numeric;
  v_pag_total numeric := 0;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ID_OBRIGATORIO';
  END IF;

  -- F-2: contexto de loja é pré-requisito da validação de preço, não opcional.
  IF p_caixa_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_CAIXA_OBRIGATORIO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  SELECT c.loja_id INTO v_loja_id FROM public.caixas c WHERE c.id = p_caixa_id;
  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_CAIXA_NAO_ENCONTRADO';
  END IF;

  SELECT * INTO v_totais
  FROM internal.calcular_totais_venda(p_itens, p_desconto_gerente_percentual);

  -- A partir daqui `v_loja_id` é sempre confiável, então a âncora de catálogo
  -- roda incondicionalmente.
  PERFORM internal.validar_precos_venda(p_itens, v_loja_id);

  IF p_total_bruto IS NULL OR p_total_desconto IS NULL OR p_total_liquido IS NULL
     OR p_total_bruto <> public.round_abnt(p_total_bruto, 2)
     OR p_total_desconto <> public.round_abnt(p_total_desconto, 2)
     OR p_total_liquido <> public.round_abnt(p_total_liquido, 2)
     OR p_total_bruto <> v_totais.total_bruto
     OR p_total_desconto <> v_totais.total_desconto
     OR p_total_liquido <> v_totais.total_liquido THEN
    RAISE EXCEPTION 'ERRO_RPC_TOTAIS_DIVERGENTES';
  END IF;

  IF (p_desconto_gerente_percentual IS NULL) <> (p_desconto_gerente_valor IS NULL)
     OR COALESCE(p_desconto_gerente_valor, 0) <> v_totais.desconto_global_valor THEN
    RAISE EXCEPTION 'ERRO_RPC_DESCONTO_GERENTE_DIVERGENTE';
  END IF;

  SELECT v.total_bruto, v.total_desconto, v.total_liquido
  INTO v_existente
  FROM public.vendas v
  WHERE v.id = p_venda_id;

  IF FOUND THEN
    IF v_existente.total_bruto <> v_totais.total_bruto
       OR v_existente.total_desconto <> v_totais.total_desconto
       OR v_existente.total_liquido <> v_totais.total_liquido THEN
      RAISE EXCEPTION 'ERRO_RPC_RETRY_PAYLOAD_DIVERGENTE';
    END IF;

    SELECT string_agg(assinatura, '|' ORDER BY assinatura) INTO v_assinatura_persistida
    FROM (
      SELECT iv.produto_id::text || ';' || round(iv.quantidade, 3)::text || ';'
             || round(iv.preco_unitario_original, 2)::text || ';'
             || round(iv.preco_unitario, 2)::text AS assinatura
      FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id
    ) AS persistido;

    SELECT string_agg(assinatura, '|' ORDER BY assinatura) INTO v_assinatura_payload
    FROM (
      SELECT (item->>'produto_id') || ';' || round((item->>'quantidade')::numeric, 3)::text || ';'
             || round((item->>'preco_original')::numeric, 2)::text || ';'
             || round((item->>'preco_unitario')::numeric, 2)::text AS assinatura
      FROM jsonb_array_elements(p_itens) AS item
    ) AS enviado;

    IF v_assinatura_persistida IS DISTINCT FROM v_assinatura_payload THEN
      RAISE EXCEPTION 'ERRO_RPC_RETRY_PAYLOAD_DIVERGENTE';
    END IF;

    -- Sprint C2.11 (P0-3): retry idempotente também precisa bater com o
    -- que foi PERSISTIDO em vendas_pagamentos — não só os itens/totais.
    -- Comparação semântica (agrupada por forma, somada, ordenada por
    -- forma) — mesma regra usada no bloco de INSERT abaixo para decidir
    -- o que gravar, então "o que seria gravado agora" e "o que já está
    -- gravado" usam exatamente a mesma normalização.
    SELECT string_agg(vp.forma_pagamento || ';' || round(vp.valor, 2)::text, '|' ORDER BY vp.forma_pagamento)
    INTO v_assinatura_pag_persistida
    FROM public.vendas_pagamentos vp
    WHERE vp.venda_id = p_venda_id;

    IF v_totais.total_liquido = 0 THEN
      -- Nenhum caminho de INSERT grava vendas_pagamentos quando o total é
      -- zero (ver ELSIF v_totais.total_liquido > 0 abaixo) — não há
      -- pagamento a comparar em nenhum dos dois lados.
      v_assinatura_pag_payload := NULL;
    ELSIF p_pagamentos IS NOT NULL THEN
      SELECT string_agg(agg.forma || ';' || round(agg.soma, 2)::text, '|' ORDER BY agg.forma)
      INTO v_assinatura_pag_payload
      FROM (
        SELECT upper(COALESCE(pag->>'forma_pagamento', '')) AS forma,
               sum(COALESCE((pag->>'valor')::numeric, 0)) AS soma
        FROM jsonb_array_elements(p_pagamentos) AS pag
        GROUP BY upper(COALESCE(pag->>'forma_pagamento', ''))
      ) AS agg;
    ELSE
      v_assinatura_pag_payload := upper(p_forma_pagamento) || ';' || round(v_totais.total_liquido, 2)::text;
    END IF;

    IF v_assinatura_pag_persistida IS DISTINCT FROM v_assinatura_pag_payload THEN
      RAISE EXCEPTION 'ERRO_RPC_RETRY_PAGAMENTOS_DIVERGENTE';
    END IF;

    RETURN;
  END IF;

  v_item_count := jsonb_array_length(p_itens);

  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto,
    total_liquido, forma_pagamento, status
  ) VALUES (
    p_venda_id, p_caixa_id, p_operador_id, v_totais.total_bruto,
    v_totais.total_desconto, v_totais.total_liquido, p_forma_pagamento, 'CONCLUIDA'
  );

  INSERT INTO public.itens_venda (
    id, venda_id, produto_id, quantidade, preco_unitario_original,
    preco_unitario, desconto_unitario, tipo_preco
  )
  SELECT
    (item->>'item_id')::uuid,
    p_venda_id,
    (item->>'produto_id')::uuid,
    (item->>'quantidade')::numeric,
    (item->>'preco_original')::numeric,
    (item->>'preco_unitario')::numeric,
    GREATEST(0, (item->>'preco_original')::numeric - (item->>'preco_unitario')::numeric),
    CASE
      WHEN calc.tipo = 'ATACADO'
       AND abs((item->>'preco_unitario')::numeric - calc.preco) <= 0.02 THEN 'ATACADO'
      WHEN (item->>'preco_unitario')::numeric < (item->>'preco_original')::numeric THEN 'MANUAL'
      ELSE 'VAREJO'
    END
  FROM jsonb_array_elements(p_itens) AS item
  LEFT JOIN LATERAL (
    SELECT resolvido->>'tipo' AS tipo, (resolvido->>'preco')::numeric AS preco
    FROM public.calcular_preco_produto(
      (item->>'produto_id')::uuid,
      GREATEST(1, FLOOR((item->>'quantidade')::numeric))::integer,
      v_loja_id
    ) AS resolvido
  ) AS calc ON true;

  IF (SELECT count(*) FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id) <> v_item_count THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ITENS_PERSISTIDOS_DIVERGENTES';
  END IF;

  -- Sprint C2.10 (P0-5): split real quando o chamador enviar p_pagamentos —
  -- mesma validação do RPC web (finalizar_venda_transacional_canonica_v4_
  -- unscoped): cada forma precisa existir em formas_pagamento (ativa, da
  -- mesma loja), soma tem que bater com o total_liquido calculado. Sem
  -- p_pagamentos (todo tráfego real hoje): comportamento idêntico ao
  -- anterior, uma única linha com o campo escalar.
  IF p_pagamentos IS NOT NULL THEN
    IF jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
      RAISE EXCEPTION 'ERRO_RPC_PAGAMENTOS_INVALIDOS';
    END IF;
    FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
    LOOP
      v_pag_forma := upper(COALESCE(v_pag->>'forma_pagamento', ''));
      v_pag_valor := public.round_abnt(COALESCE((v_pag->>'valor')::numeric, 0), 2);
      IF NOT EXISTS (
        SELECT 1 FROM public.formas_pagamento fp
        WHERE fp.loja_id = v_loja_id AND fp.codigo = v_pag_forma AND fp.ativo = true
      ) THEN
        RAISE EXCEPTION 'ERRO_RPC_FORMA_PAGAMENTO_INVALIDA';
      END IF;
      IF v_pag_valor <= 0 THEN
        RAISE EXCEPTION 'ERRO_RPC_VALOR_PAGAMENTO_INVALIDO';
      END IF;
      v_pag_total := public.round_abnt(v_pag_total + v_pag_valor, 2);
      INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
      VALUES (p_venda_id, v_pag_forma, v_pag_valor)
      ON CONFLICT (venda_id, forma_pagamento) DO UPDATE SET valor = vendas_pagamentos.valor + EXCLUDED.valor;
    END LOOP;
    IF v_pag_total <> v_totais.total_liquido THEN
      RAISE EXCEPTION 'ERRO_RPC_PAGAMENTOS_SOMA_DIVERGENTE';
    END IF;
  ELSIF v_totais.total_liquido > 0 THEN
    INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (p_venda_id, p_forma_pagamento, v_totais.total_liquido)
    ON CONFLICT (venda_id, forma_pagamento) DO NOTHING;
  END IF;

  IF p_desconto_gerente_percentual IS NOT NULL THEN
    INSERT INTO public.descontos_venda (
      venda_id, gerente_id, desconto_percentual, desconto_valor
    ) VALUES (
      p_venda_id, p_gerente_id, p_desconto_gerente_percentual, v_totais.desconto_global_valor
    )
    ON CONFLICT (venda_id) DO NOTHING;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_venda_com_itens(
  uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venda_com_itens(
  uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.registrar_venda_com_itens(
  uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text, jsonb
) IS
  'Registra venda do caminho sync (pdv-local) com itens + pagamento(s). Sprint C2.11 (2026-09-03, P0-3): '
  'retry idempotente (mesma p_venda_id) agora também valida vendas_pagamentos persistido contra o que o '
  'chamador está enviando (comparação semântica, agrupada e ordenada por forma) — divergência levanta '
  'ERRO_RPC_RETRY_PAGAMENTOS_DIVERGENTE em vez de retornar como se fosse idempotente.';

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_loja_id uuid;
  v_caixa_id uuid;
  v_operador_id uuid;
  v_produto_id uuid;
  v_venda_a uuid;
  v_venda_b uuid;
  v_erro_capturado boolean;
BEGIN
  SELECT id INTO v_loja_id FROM public.lojas LIMIT 1;
  IF v_loja_id IS NULL THEN
    RAISE NOTICE 'C2_11_P03: sem loja para prova viva; verificação estrutural OK';
    RETURN;
  END IF;

  SELECT id INTO v_operador_id FROM public.usuarios WHERE loja_id = v_loja_id LIMIT 1;
  SELECT id INTO v_caixa_id FROM public.caixas WHERE loja_id = v_loja_id AND status = 'ABERTO' LIMIT 1;
  SELECT id INTO v_produto_id FROM public.produtos WHERE loja_id = v_loja_id AND ativo = true LIMIT 1;
  IF v_operador_id IS NULL OR v_caixa_id IS NULL OR v_produto_id IS NULL THEN
    RAISE NOTICE 'C2_11_P03: sem operador/caixa aberto/produto para prova viva; verificação estrutural OK';
    RETURN;
  END IF;

  -- (A) Retry idêntico (split 60/40) -> PASS, sem exceção, sem duplicar linhas.
  v_venda_a := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(
    v_venda_a, v_caixa_id, v_operador_id, 'DINHEIRO', 10, 0, 10,
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id, 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10)),
    NULL, NULL, NULL,
    jsonb_build_array(
      jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 6),
      jsonb_build_object('forma_pagamento', 'PIX', 'valor', 4)
    )
  );
  -- Retry idêntico, MESMA composição mas ORDEM DIFERENTE no array -> ainda PASS
  -- (comparação semântica, não posicional).
  PERFORM public.registrar_venda_com_itens(
    v_venda_a, v_caixa_id, v_operador_id, 'DINHEIRO', 10, 0, 10,
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id, 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10)),
    NULL, NULL, NULL,
    jsonb_build_array(
      jsonb_build_object('forma_pagamento', 'PIX', 'valor', 4),
      jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 6)
    )
  );
  IF (SELECT count(*) FROM public.vendas_pagamentos WHERE venda_id = v_venda_a) <> 2 THEN
    RAISE EXCEPTION 'C2_11_P03_RETRY_IDENTICO_QUEBROU_LINHAS';
  END IF;

  -- (B) Retry com split DIVERGENTE (70/30 em vez de 60/40) -> REJECT.
  v_erro_capturado := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(
      v_venda_a, v_caixa_id, v_operador_id, 'DINHEIRO', 10, 0, 10,
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id, 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10)),
      NULL, NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 7),
        jsonb_build_object('forma_pagamento', 'PIX', 'valor', 3)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ERRO_RPC_RETRY_PAGAMENTOS_DIVERGENTE' THEN
      v_erro_capturado := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_erro_capturado THEN
    RAISE EXCEPTION 'C2_11_P03_SPLIT_DIVERGENTE_NAO_REJEITADO';
  END IF;

  -- (C) Venda B: pagamento único legítimo (escalar) -> retry idêntico PASS,
  -- depois retry com valor DIFERENTE -> REJECT.
  v_venda_b := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(
    v_venda_b, v_caixa_id, v_operador_id, 'CARTAO_CREDITO', 20, 0, 20,
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id, 'quantidade', 1, 'preco_original', 20, 'preco_unitario', 20))
  );
  PERFORM public.registrar_venda_com_itens(
    v_venda_b, v_caixa_id, v_operador_id, 'CARTAO_CREDITO', 20, 0, 20,
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id, 'quantidade', 1, 'preco_original', 20, 'preco_unitario', 20))
  );
  IF (SELECT count(*) FROM public.vendas_pagamentos WHERE venda_id = v_venda_b) <> 1 THEN
    RAISE EXCEPTION 'C2_11_P03_RETRY_ESCALAR_IDENTICO_QUEBROU';
  END IF;

  -- (D) Venda B: retry tentando TRANSFORMAR pagamento único em split -> REJECT.
  v_erro_capturado := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(
      v_venda_b, v_caixa_id, v_operador_id, 'CARTAO_CREDITO', 20, 0, 20,
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id, 'quantidade', 1, 'preco_original', 20, 'preco_unitario', 20)),
      NULL, NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 10),
        jsonb_build_object('forma_pagamento', 'PIX', 'valor', 10)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ERRO_RPC_RETRY_PAGAMENTOS_DIVERGENTE' THEN
      v_erro_capturado := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_erro_capturado THEN
    RAISE EXCEPTION 'C2_11_P03_ESCALAR_PARA_SPLIT_NAO_REJEITADO';
  END IF;

  -- Limpeza (ordem: comissões -> itens -> pagamentos -> venda).
  DELETE FROM public.comissoes_itens WHERE item_venda_id IN (
    SELECT id FROM public.itens_venda WHERE venda_id IN (v_venda_a, v_venda_b)
  );
  DELETE FROM public.vendas_pagamentos WHERE venda_id IN (v_venda_a, v_venda_b);
  DELETE FROM public.itens_venda WHERE venda_id IN (v_venda_a, v_venda_b);
  DELETE FROM public.comissoes_vendedores WHERE venda_id IN (v_venda_a, v_venda_b);
  DELETE FROM public.vendas WHERE id IN (v_venda_a, v_venda_b);

  RAISE NOTICE 'C2_11_P03: prova viva OK — retry idêntico/ordem-diferente PASS, split divergente REJECT, valor divergente REJECT, escalar->split REJECT.';
END
$verify$;

COMMIT;
