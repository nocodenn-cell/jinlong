-- Sprint C2.10 (P0-5, achado Codex) — pagamento misto perdido no caminho
-- sync (pdv-local → sync-outbox). O caminho web preserva `vendas_pagamentos`
-- itemizado (via `p_pagamentos jsonb` em `finalizar_venda_transacional_
-- canonica_v4_unscoped`, desde B-P0.1/C1); `registrar_venda_com_itens` (o
-- RPC que o sync usa) só aceitava `p_forma_pagamento text` — um único
-- pagamento por venda, sempre.
--
-- CAUSA RAIZ REAL (investigada antes de escrever esta migration, não
-- suposta): `pdv-local` (cliente desktop Tauri) tem uma única coluna
-- `forma_pagamento TEXT NOT NULL` no seu SQLite local
-- (`pdv-local/src-tauri/src/db.rs`) — o app desktop genuinamente NÃO
-- CAPTURA pagamento misto hoje, em lugar nenhum, nem localmente. Não é
-- perda de dado em trânsito — é ausência de capacidade no cliente,
-- explicitamente fora do escopo desta sprint (Rust/Tauri, não backend).
--
-- CORREÇÃO NESTA SPRINT (só o que é backend, aditivo, não quebra o cliente
-- atual): `p_pagamentos jsonb DEFAULT NULL` — parâmetro NOVO, opcional.
--   * Se `p_pagamentos` vier NULL (todo tráfego real hoje, já que
--     pdv-local não o envia): comportamento IDÊNTICO ao anterior — 1 linha
--     em vendas_pagamentos com p_forma_pagamento/total_liquido.
--   * Se vier um array (para quando pdv-local for atualizado no futuro,
--     fora desta sprint): valida cada entrada contra `formas_pagamento`
--     (mesmo padrão do RPC web), soma tem que bater com o total_liquido
--     calculado, insere uma linha por forma — split real preservado.
-- Isso fecha a "origem do contrato": o snapshot fiscal do sync
-- (`fiscal_enqueue_after_venda_sync.ts`, mesmo commit) passa a LER
-- `vendas_pagamentos` diretamente (SSOT, mesma tabela que o caminho web já
-- usa) em vez de reconstruir um array de 1 elemento a partir do campo
-- escalar do payload — corrige os dois lados com a mesma mudança de fonte.
--
-- POSTGRES: adicionar um parâmetro (mesmo com DEFAULT) a uma função
-- existente via `CREATE OR REPLACE FUNCTION` cria uma NOVA sobrecarga (Postgres
-- identifica função pela assinatura completa de tipos, não por nome) — mesmo
-- diagnóstico já documentado nesta missão para `criar_produto_com_estoque_
-- inicial` (20260831110000) e `fiscal_enfileirar_documento_venda`
-- (20260819220100). Sobrecarga nova nasce com EXECUTE aberto a PUBLIC —
-- reafirma REVOKE/GRANT explicitamente. `sync-outbox/index.ts` (mesmo
-- commit) passa a chamar SEMPRE com os 12 parâmetros nomeados (incluindo
-- p_pagamentos, null quando ausente) — sem ambiguidade de overload.
-- Sobrecarga antiga (11 parâmetros, sem p_pagamentos) removida ao final:
-- confirmado por grep que `sync-outbox/index.ts` é o único chamador em
-- produção (os demais resultados de grep são scripts de teste/smoke e
-- artefatos gerados, não código de aplicação).
--
-- ROLLBACK: reaplicar a definição anterior (11 parâmetros, sem
-- p_pagamentos), disponível na migration 014_rpc_registrar_venda_com_itens.sql
-- + revisões posteriores (mais recente: 20260902100000).

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
  'Registra venda do caminho sync (pdv-local) com itens + pagamento(s). Sprint C2.10 (2026-09-03, P0-5): '
  'p_pagamentos jsonb opcional preserva split real quando o chamador enviar (mesma validação do RPC web); '
  'sem ele, comportamento idêntico ao anterior (1 pagamento via p_forma_pagamento).';

DO $$
BEGIN
  IF to_regprocedure('public.registrar_venda_com_itens(uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.registrar_venda_com_itens(uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text)';
    RAISE NOTICE 'C2_10_P05: sobrecarga legada de 11 args removida — ambiguidade fechada, permissão consolidada numa função só.';
  ELSE
    RAISE NOTICE 'C2_10_P05: sobrecarga de 11 args ausente — nada a remover.';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_loja_id uuid;
  v_caixa_id uuid;
  v_operador_id uuid;
  v_produto_id uuid;
  v_venda_escalar uuid := gen_random_uuid();
  v_venda_mista uuid := gen_random_uuid();
  v_qtd_pag integer;
BEGIN
  -- B2 (go-live): o autoteste roda dentro de um sub-bloco que SEMPRE termina
  -- com a exceção sentinela VRB01. O Postgres desfaz tudo o que o sub-bloco
  -- gravou (vendas, itens, pagamentos, estoque, saldo, kardex, comissões,
  -- documentos fiscais, eventos). As asserções continuam valendo: qualquer
  -- outra exceção (inclusive as RAISE do teste) não é capturada e aborta a
  -- migration, como antes. Os RETURN de pré-condição vêm antes de qualquer
  -- escrita, então não deixam efeito.
  BEGIN
  SELECT id INTO v_loja_id FROM public.lojas LIMIT 1;
  IF v_loja_id IS NULL THEN
    RAISE NOTICE 'C2_10_P05: sem loja para prova viva; verificação estrutural (overload) já OK';
    RETURN;
  END IF;

  SELECT id INTO v_operador_id FROM public.usuarios WHERE loja_id = v_loja_id LIMIT 1;
  SELECT id INTO v_caixa_id FROM public.caixas WHERE loja_id = v_loja_id AND status = 'ABERTO' LIMIT 1;
  IF v_operador_id IS NULL OR v_caixa_id IS NULL THEN
    RAISE NOTICE 'C2_10_P05: sem operador/caixa aberto/produto para prova viva; verificação estrutural (overload) já OK';
    RETURN;
  END IF;

  -- Preço controlado: a prova não depende do catálogo real da loja.
  -- O produto e todas as escritas da prova são desfeitos pela sentinela.
  INSERT INTO public.produtos (nome, loja_id, preco_varejo, ativo, origem, tem_nf)
  VALUES ('AUTOTEST C2.10 split (rollback)', v_loja_id, 20, true, 'china_manual', false)
  RETURNING id INTO v_produto_id;

  -- Caminho escalar (sem p_pagamentos) — comportamento idêntico ao anterior.
  PERFORM public.registrar_venda_com_itens(
    v_venda_escalar, v_caixa_id, v_operador_id, 'DINHEIRO', 10, 0, 10,
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id, 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10))
  );
  SELECT count(*) INTO v_qtd_pag FROM public.vendas_pagamentos WHERE venda_id = v_venda_escalar;
  IF v_qtd_pag <> 1 THEN
    RAISE EXCEPTION 'C2_10_P05_CAMINHO_ESCALAR_QUEBROU: % linhas', v_qtd_pag;
  END IF;

  -- Caminho misto (p_pagamentos com 2 formas) — split real preservado.
  PERFORM public.registrar_venda_com_itens(
    v_venda_mista, v_caixa_id, v_operador_id, 'DINHEIRO', 10, 0, 10,
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_produto_id, 'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10)),
    NULL, NULL, NULL,
    jsonb_build_array(
      jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 6),
      jsonb_build_object('forma_pagamento', 'PIX', 'valor', 4)
    )
  );
  SELECT count(*) INTO v_qtd_pag FROM public.vendas_pagamentos WHERE venda_id = v_venda_mista;
  IF v_qtd_pag <> 2 THEN
    RAISE EXCEPTION 'C2_10_P05_SPLIT_NAO_PRESERVADO: % linhas (esperado 2)', v_qtd_pag;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendas_pagamentos WHERE venda_id = v_venda_mista AND forma_pagamento = 'DINHEIRO' AND valor = 6) THEN
    RAISE EXCEPTION 'C2_10_P05_VALOR_DINHEIRO_ERRADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendas_pagamentos WHERE venda_id = v_venda_mista AND forma_pagamento = 'PIX' AND valor = 4) THEN
    RAISE EXCEPTION 'C2_10_P05_VALOR_PIX_ERRADO';
  END IF;

  -- Limpeza (ordem: comissões geradas por trigger na criação dos itens ->
  -- itens -> pagamentos -> venda).
  DELETE FROM public.comissoes_itens WHERE item_venda_id IN (
    SELECT id FROM public.itens_venda WHERE venda_id IN (v_venda_escalar, v_venda_mista)
  );
  DELETE FROM public.vendas_pagamentos WHERE venda_id IN (v_venda_escalar, v_venda_mista);
  DELETE FROM public.itens_venda WHERE venda_id IN (v_venda_escalar, v_venda_mista);
  DELETE FROM public.comissoes_vendedores WHERE venda_id IN (v_venda_escalar, v_venda_mista);
  DELETE FROM public.vendas WHERE id IN (v_venda_escalar, v_venda_mista);
  DELETE FROM public.produtos WHERE id = v_produto_id;
  RAISE EXCEPTION 'VERIFY_ROLLBACK_SENTINELA' USING ERRCODE = 'VRB01';
  EXCEPTION WHEN SQLSTATE 'VRB01' THEN
    RAISE NOTICE '20260903130000: autoteste concluído; efeitos desfeitos (rollback do sub-bloco)';
  END;
END
$verify$;

COMMIT;
