-- P0-3: venda offline passa a produzir o MESMO fato de pagamento da venda online.
--
-- Problema comprovado: o crédito do contador físico nasce do trigger
-- `trg_creditar_saldo_caixa_venda_dinheiro`, que dispara em `vendas_pagamentos`.
-- A v4 online insere essa linha; `registrar_venda_com_itens` (sync-outbox) não.
-- Resultado medido no mesmo caixa:
--
--   abertura        contador 100.00   E(c) 100.00
--   online  +60     contador 160.00   E(c) 160.00
--   offline +40     contador 160.00   E(c) 200.00   <- divergência 40.00
--
-- Consequência provada: uma sangria legítima de R$180,00 (dinheiro físico real
-- R$200,00) é recusada com MOV_CAIXA_SALDO_INSUFICIENTE. Como AP em espécie
-- (Fase 2B) sai obrigatoriamente por `registrar_movimentacao`, pagamentos AP
-- legítimos ficam bloqueados em qualquer loja que venda offline.
--
-- Correção mínima: o escritor offline grava o fato canônico `vendas_pagamentos`.
-- Nenhum novo `UPDATE caixas SET saldo_atual` é criado — o crédito continua
-- saindo do único trigger existente, a partir do mesmo fato dos dois caminhos.
--
-- Sem dupla contagem, verificado nos três consumidores:
--   * E(c): `vendas_din_split` passa a contar a venda e `vendas_din_legado` a
--     exclui pelo `NOT EXISTS (vendas_pagamentos)` que já existia;
--   * contador: um único trigger, uma única linha por (venda, forma);
--   * `cancelar_venda_transacional`: `v_tem_split = EXISTS(vendas_pagamentos)`
--     seleciona ramos MUTUAMENTE EXCLUSIVOS. A venda offline migra do ramo
--     `ELSIF forma='DINHEIRO'` (que debitava `total_liquido`) para o ramo split
--     (que debita a soma DINHEIRO de `vendas_pagamentos`) — mesmo valor.
--
-- Efeito colateral desejado: `verificar_consistencia_venda` deixa de acusar
-- `sem_pagamento`/`pagamentos_saldo_divergentes` em toda venda sincronizada.
--
-- Idempotência: o guard de replay por `venda_id` já retorna antes de qualquer
-- INSERT; o `ON CONFLICT` sobre `uq_vendas_pagamentos_venda_forma` é a segunda
-- barreira contra crédito duplicado em retry.
--
-- ROLLBACK: restaurar o corpo de 20260813232133_sale_totals_invariant.sql.

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
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_desconto_gerente_valor numeric DEFAULT NULL,
  p_gerente_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_item_count integer;
  v_totais record;
  v_existente record;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ID_OBRIGATORIO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  SELECT * INTO v_totais
  FROM internal.calcular_totais_venda(p_itens, p_desconto_gerente_percentual);

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
    CASE WHEN (item->>'preco_unitario')::numeric < (item->>'preco_original')::numeric
      THEN 'ATACADO' ELSE 'VAREJO' END
  FROM jsonb_array_elements(p_itens) AS item;

  IF (SELECT count(*) FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id) <> v_item_count THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ITENS_PERSISTIDOS_DIVERGENTES';
  END IF;

  -- P0-3: mesmo fato de pagamento do caminho online. O crédito do contador
  -- físico é consequência do trigger em `vendas_pagamentos`, nunca um UPDATE
  -- próprio deste escritor.
  IF v_totais.total_liquido > 0 THEN
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

COMMENT ON FUNCTION public.registrar_venda_com_itens IS
  'Escritor offline: totaliza no PostgreSQL, rejeita divergencia de um centavo, '
  'grava o mesmo fato de pagamento do caminho online e preserva retry sem mutacao.';

COMMIT;
