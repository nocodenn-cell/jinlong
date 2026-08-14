-- Gates adversariais do bloco financeiro.
--
-- Cada bloco reproduz um ataque ou uma regressão COMPROVADA na auditoria
-- adversarial de 2026-08-14 e falha se o comportamento voltar. Não testa que o
-- código existe: testa que a invariante é inviolável pelos caminhos oficiais e
-- pelos caminhos adversariais conhecidos.
--
-- Roda inteiro dentro de BEGIN/ROLLBACK. Exige o seed local determinístico.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/financial-adversarial-gates.test.sql

\set ON_ERROR_STOP on
BEGIN;

SELECT id AS gerente_id, loja_id AS loja FROM public.usuarios
WHERE perfil = 'GERENTE' AND ativo = true LIMIT 1 \gset
SELECT id AS operador_id FROM public.usuarios
WHERE perfil = 'OPERADOR' AND ativo = true LIMIT 1 \gset
SELECT id AS dono_id FROM public.usuarios
WHERE perfil = 'DONO' AND ativo = true LIMIT 1 \gset
SELECT id AS produto FROM public.produtos WHERE loja_id = :'loja'::uuid LIMIT 1 \gset
SELECT preco_varejo AS preco_tabela FROM public.produtos WHERE id = :'produto' \gset

SELECT gen_random_uuid() AS caixa, gen_random_uuid() AS outra_loja,
       gen_random_uuid() AS cliente, gen_random_uuid() AS titulo \gset

-- `operador_id` fica NULL: `uq_caixas_operador_aberto` impede um segundo caixa
-- ABERTO para o mesmo operador, e o seed já abre um para o OPERADOR.
INSERT INTO public.caixas(id, operador_id, loja_id, status, valor_inicial)
VALUES (:'caixa', NULL, :'loja', 'ABERTO', 1000);
INSERT INTO public.lojas(id, nome, codigo)
VALUES (:'outra_loja', 'Loja adversarial', 'ADV-' || left(:'outra_loja', 8));
INSERT INTO public.clientes(id, nome, loja_id) VALUES (:'cliente', 'Cliente adversarial', :'loja');
INSERT INTO public.contas_receber(id, cliente_id, valor_total, valor_aberto, status, loja_id)
VALUES (:'titulo', :'cliente', 500, 500, 'ABERTO', :'loja');
INSERT INTO public.estoque(produto_id, loja_id, quantidade_atual)
VALUES (:'produto', :'loja', 10000)
ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 10000;

SELECT set_config('t.caixa', :'caixa', true),
       set_config('t.titulo', :'titulo', true),
       set_config('t.produto', :'produto', true),
       set_config('t.loja', :'loja', true),
       set_config('t.outra_loja', :'outra_loja', true),
       set_config('t.gerente', :'gerente_id', true),
       set_config('t.operador', :'operador_id', true),
       set_config('t.dono', :'dono_id', true),
       set_config('t.preco', :'preco_tabela', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 1 — `caixas.saldo_atual` não é gravável por clientes autenticados
-- Regressão: OPERADOR gravou 999999.00 e GERENTE gravou 0.00 via PostgREST.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_ator text;
  v_uid uuid;
BEGIN
  FOREACH v_ator IN ARRAY ARRAY['OPERADOR', 'GERENTE', 'DONO', 'ADMIN'] LOOP
    v_uid := CASE WHEN v_ator = 'OPERADOR' THEN current_setting('t.operador')::uuid
                  ELSE current_setting('t.dono')::uuid END;
    UPDATE public.usuarios SET perfil = v_ator WHERE id = v_uid;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    BEGIN
      SET LOCAL ROLE authenticated;
      EXECUTE format('UPDATE public.caixas SET saldo_atual = 999999 WHERE id = %L',
                     current_setting('t.caixa'));
      RESET ROLE;
      RAISE EXCEPTION 'GATE1_FALHOU_% escreveu saldo_atual diretamente', v_ator;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
    END;
  END LOOP;
  UPDATE public.usuarios SET perfil = 'GERENTE' WHERE id = current_setting('t.gerente')::uuid;
  UPDATE public.usuarios SET perfil = 'DONO' WHERE id = current_setting('t.dono')::uuid;
  UPDATE public.usuarios SET perfil = 'OPERADOR' WHERE id = current_setting('t.operador')::uuid;
END $g$;

-- Abertura determinística: o contador nasce igual ao valor inicial.
DO $g$
DECLARE v_id uuid; v_saldo numeric; v_ini numeric;
BEGIN
  INSERT INTO public.caixas(operador_id, loja_id, status, valor_inicial, saldo_atual)
  VALUES (NULL, current_setting('t.loja')::uuid, 'FECHADO', 250, 999999)
  RETURNING id INTO v_id;
  SELECT saldo_atual, valor_inicial INTO v_saldo, v_ini FROM public.caixas WHERE id = v_id;
  IF v_saldo <> v_ini OR v_saldo <> 250 THEN
    RAISE EXCEPTION 'GATE1_ABERTURA saldo_atual=% valor_inicial=% (esperado 250/250)', v_saldo, v_ini;
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 2 — `recalcular_saldo_caixa` não existe mais
-- Regressão: writer legado apagava vendas e AR do contador.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'recalcular_saldo_caixa') THEN
    RAISE EXCEPTION 'GATE2_WRITER_LEGADO_VOLTOU';
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 3 — venda offline em DINHEIRO credita o contador, sem crédito duplo
-- GATE 4 — contador físico == E(c) em cada passo
-- Regressão: offline não creditava; contador 160 x E(c) 200.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_venda uuid := gen_random_uuid();
  v_antes numeric; v_depois numeric; v_ec numeric; v_preco numeric;
  v_itens jsonb;
BEGIN
  v_preco := current_setting('t.preco')::numeric;
  SELECT saldo_atual INTO v_antes FROM public.caixas WHERE id = v_caixa;

  v_itens := jsonb_build_array(jsonb_build_object(
    'item_id', gen_random_uuid(), 'produto_id', current_setting('t.produto')::uuid,
    'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco));

  PERFORM public.registrar_venda_com_itens(v_venda, v_caixa,
    current_setting('t.operador')::uuid, 'DINHEIRO', v_preco, 0, v_preco, v_itens, NULL, NULL, NULL);

  SELECT saldo_atual INTO v_depois FROM public.caixas WHERE id = v_caixa;
  IF v_depois <> v_antes + v_preco THEN
    RAISE EXCEPTION 'GATE3_OFFLINE_NAO_CREDITOU antes=% depois=% esperado=%',
      v_antes, v_depois, v_antes + v_preco;
  END IF;

  -- retry: mesmo comando não pode creditar de novo
  PERFORM public.registrar_venda_com_itens(v_venda, v_caixa,
    current_setting('t.operador')::uuid, 'DINHEIRO', v_preco, 0, v_preco, v_itens, NULL, NULL, NULL);
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_depois THEN
    RAISE EXCEPTION 'GATE3_RETRY_CREDITOU_DUPLICADO';
  END IF;
  IF (SELECT count(*) FROM public.vendas_pagamentos WHERE venda_id = v_venda) <> 1 THEN
    RAISE EXCEPTION 'GATE3_RETRY_DUPLICOU_FATO_DE_PAGAMENTO';
  END IF;

  -- GATE 4: contador reconciliado com o esperado em espécie
  SELECT public.calcular_valor_sistema_dinheiro_caixa(v_caixa) INTO v_ec;
  IF v_ec <> v_depois THEN
    RAISE EXCEPTION 'GATE4_CONTADOR_DIVERGE_DO_ESPERADO contador=% E(c)=%', v_depois, v_ec;
  END IF;
END $g$;

-- Formas não físicas não podem tocar a gaveta.
DO $g$
DECLARE
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_antes numeric; v_forma text; v_preco numeric := current_setting('t.preco')::numeric;
BEGIN
  SELECT saldo_atual INTO v_antes FROM public.caixas WHERE id = v_caixa;
  FOREACH v_forma IN ARRAY ARRAY['PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO'] LOOP
    PERFORM public.registrar_venda_com_itens(gen_random_uuid(), v_caixa,
      current_setting('t.operador')::uuid, v_forma, v_preco, 0, v_preco,
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(),
        'produto_id', current_setting('t.produto')::uuid, 'quantidade', 1,
        'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  END LOOP;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_antes THEN
    RAISE EXCEPTION 'GATE3_FORMA_NAO_FISICA_ALTEROU_GAVETA';
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 5 — invariante de preço: acréscimo e bruto acima da tabela
-- Regressão: offline gravou produto de 89,90 por 5.000,00; acréscimo
-- compensado (10->11 + 10->9) passava nos dois escritores.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  v_ok boolean;
BEGIN
  -- acréscimo por item
  v_ok := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(gen_random_uuid(), v_caixa,
      current_setting('t.operador')::uuid, 'DINHEIRO', v_preco, 0, v_preco + 10,
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
        'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco + 10)), NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE5_ACRESCIMO_ACEITO'; END IF;

  -- acréscimo compensado entre dois itens (cabeçalho idêntico ao honesto)
  v_ok := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(gen_random_uuid(), v_caixa,
      current_setting('t.operador')::uuid, 'DINHEIRO', v_preco * 2, 0, v_preco * 2,
      jsonb_build_array(
        jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod, 'quantidade', 1,
          'preco_original', v_preco, 'preco_unitario', v_preco + 5),
        jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod, 'quantidade', 1,
          'preco_original', v_preco, 'preco_unitario', v_preco - 5)), NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE5_ACRESCIMO_COMPENSADO_ACEITO'; END IF;

  -- bruto acima do preço de tabela
  v_ok := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(gen_random_uuid(), v_caixa,
      current_setting('t.operador')::uuid, 'DINHEIRO', 5000, 0, 5000,
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
        'quantidade', 1, 'preco_original', 5000, 'preco_unitario', 5000)), NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE5_BRUTO_ACIMA_DA_TABELA_ACEITO'; END IF;

  -- o validador canônico é o mesmo objeto usado pelos dois escritores
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'internal' AND p.proname = 'validar_precos_venda') THEN
    RAISE EXCEPTION 'GATE5_VALIDADOR_CANONICO_AUSENTE';
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 6 — AR: escopo de loja para TODOS os perfis, inclusive ADMIN
-- Regressão: ADMIN da outra loja liquidou título e creditou caixa alheio.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_perfil text;
  v_uid uuid := current_setting('t.dono')::uuid;
  v_titulo uuid := current_setting('t.titulo')::uuid;
  v_ok boolean;
  v_msg text;
BEGIN
  -- mesma loja: GERENTE, DONO e ADMIN podem
  FOREACH v_perfil IN ARRAY ARRAY['GERENTE', 'DONO', 'ADMIN'] LOOP
    UPDATE public.usuarios SET perfil = v_perfil, loja_id = current_setting('t.loja')::uuid,
           ativo = true WHERE id = v_uid;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM * FROM public.registrar_liquidacao_receber(v_titulo, 1, 'PIX', NULL,
      'gate6-ok-' || v_perfil, NULL, 'TESTE_DB');
    RESET ROLE;
  END LOOP;

  -- outra loja: NINGUÉM pode
  FOREACH v_perfil IN ARRAY ARRAY['GERENTE', 'DONO', 'ADMIN'] LOOP
    UPDATE public.usuarios SET perfil = v_perfil, loja_id = current_setting('t.outra_loja')::uuid,
           ativo = true WHERE id = v_uid;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    v_ok := false;
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM * FROM public.registrar_liquidacao_receber(v_titulo, 1, 'PIX', NULL,
        'gate6-cross-' || v_perfil, NULL, 'TESTE_DB');
      RESET ROLE;
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE; v_msg := SQLERRM;
      v_ok := v_msg LIKE '%LIQUIDACAO_LOJA_DIVERGENTE%';
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'GATE6_CROSS_LOJA_% permitido (msg=%)', v_perfil, COALESCE(v_msg, 'sem erro');
    END IF;
  END LOOP;

  -- usuário inativo: rejeitado
  UPDATE public.usuarios SET perfil = 'ADMIN', loja_id = current_setting('t.loja')::uuid,
         ativo = false WHERE id = v_uid;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM * FROM public.registrar_liquidacao_receber(v_titulo, 1, 'PIX', NULL,
      'gate6-inativo', NULL, 'TESTE_DB');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_ok := SQLERRM LIKE '%LIQUIDACAO_PERFIL%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE6_USUARIO_INATIVO_PERMITIDO'; END IF;

  -- OPERADOR: rejeitado por perfil
  UPDATE public.usuarios SET ativo = true WHERE id = v_uid;
  PERFORM set_config('request.jwt.claim.sub', current_setting('t.operador'), true);
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM * FROM public.registrar_liquidacao_receber(v_titulo, 1, 'PIX', NULL,
      'gate6-operador', NULL, 'TESTE_DB');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_ok := SQLERRM LIKE '%LIQUIDACAO_PERFIL%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE6_OPERADOR_PERMITIDO'; END IF;

  UPDATE public.usuarios SET perfil = 'DONO', loja_id = current_setting('t.loja')::uuid,
         ativo = true WHERE id = v_uid;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 7 — fault injection: falha depois do efeito físico reverte tudo
-- ═══════════════════════════════════════════════════════════════════════════
CREATE FUNCTION pg_temp.fail_ar() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN RAISE EXCEPTION 'GATE7_FALHA_INJETADA'; END $f$;
CREATE TRIGGER gate7_fail_ar AFTER INSERT ON public.liquidacoes_receber
FOR EACH ROW WHEN (NEW.idempotency_key = 'gate7-rollback')
EXECUTE FUNCTION pg_temp.fail_ar();

DO $g$
DECLARE
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_saldo_antes numeric; v_aberto_antes numeric; v_ok boolean := false;
BEGIN
  SELECT saldo_atual INTO v_saldo_antes FROM public.caixas WHERE id = v_caixa;
  SELECT valor_aberto INTO v_aberto_antes FROM public.contas_receber
   WHERE id = current_setting('t.titulo')::uuid;

  PERFORM set_config('request.jwt.claim.sub', current_setting('t.dono'), true);
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM * FROM public.registrar_liquidacao_receber(current_setting('t.titulo')::uuid,
      10, 'DINHEIRO', NULL, 'gate7-rollback', v_caixa, 'TESTE_DB');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    v_ok := SQLERRM LIKE '%GATE7_FALHA_INJETADA%';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE7_FALHA_NAO_PROPAGOU'; END IF;

  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo_antes THEN
    RAISE EXCEPTION 'GATE7_CONTADOR_NAO_REVERTEU';
  END IF;
  IF (SELECT valor_aberto FROM public.contas_receber
       WHERE id = current_setting('t.titulo')::uuid) <> v_aberto_antes THEN
    RAISE EXCEPTION 'GATE7_TITULO_NAO_REVERTEU';
  END IF;
END $g$;

DROP TRIGGER gate7_fail_ar ON public.liquidacoes_receber;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 8 — reconciliação final: contador == E(c) ao fim de toda a bateria
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE v_saldo numeric; v_ec numeric;
BEGIN
  SELECT saldo_atual, public.calcular_valor_sistema_dinheiro_caixa(id)
    INTO v_saldo, v_ec FROM public.caixas WHERE id = current_setting('t.caixa')::uuid;
  IF v_saldo <> v_ec THEN
    RAISE EXCEPTION 'GATE8_RECONCILIACAO_FINAL contador=% E(c)=%', v_saldo, v_ec;
  END IF;
END $g$;

SELECT 'FINANCIAL ADVERSARIAL GATES: OK' AS resultado;

ROLLBACK;
