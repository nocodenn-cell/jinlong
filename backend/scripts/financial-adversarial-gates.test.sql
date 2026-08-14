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

-- Loja determinística: a que tem produto precificado E os três perfis ativos.
-- Escolher "o primeiro GERENTE" torna a suíte dependente da ordem do seed —
-- `test:rls-scope` cria usuários numa loja sem produtos, e a suíte caía nela.
SELECT p.loja_id AS loja FROM public.produtos p
WHERE p.preco_varejo > 0
  AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id
              AND u.ativo AND u.perfil = 'GERENTE')
  AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id
              AND u.ativo AND u.perfil = 'OPERADOR')
  AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.loja_id = p.loja_id
              AND u.ativo AND u.perfil = 'DONO')
ORDER BY p.loja_id, p.id LIMIT 1 \gset

SELECT id AS gerente_id FROM public.usuarios
WHERE perfil = 'GERENTE' AND ativo = true AND loja_id = :'loja'::uuid LIMIT 1 \gset
SELECT id AS operador_id FROM public.usuarios
WHERE perfil = 'OPERADOR' AND ativo = true AND loja_id = :'loja'::uuid LIMIT 1 \gset
SELECT id AS dono_id FROM public.usuarios
WHERE perfil = 'DONO' AND ativo = true AND loja_id = :'loja'::uuid LIMIT 1 \gset
SELECT id AS produto FROM public.produtos
WHERE loja_id = :'loja'::uuid AND preco_varejo > 0 ORDER BY id LIMIT 1 \gset
SELECT preco_varejo AS preco_tabela FROM public.produtos WHERE id = :'produto' \gset

-- Exatamente um caixa aberto na loja durante a suíte. Rollback desfaz.
UPDATE public.caixas SET status = 'FECHADO'
WHERE loja_id = :'loja'::uuid AND status = 'ABERTO';

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
-- GATE 9 — diagnósticos SECURITY DEFINER não são executáveis por authenticated
-- Regressão: GERENTE da loja B leu total_liquido de venda da loja A e a
-- contagem agregada de todas as vendas alheias.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE v_fn text; v_ok boolean;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['verificar_consistencia_venda', 'relatorio_consistencia_vendas'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_fn
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION 'GATE9_DIAGNOSTICO_EXPOSTO: % executavel por authenticated', v_fn;
    END IF;
  END LOOP;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 10 — AP: chave física carrega o escopo da conta
-- Regressão: duas contas distintas com a mesma chave legítima no mesmo caixa
-- colidiam e a segunda era recusada com PAGAMENTO_SANGRIA_CORRELACAO_EXISTENTE.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_forn uuid := gen_random_uuid();
  v_ap1 uuid := gen_random_uuid();
  v_ap2 uuid := gen_random_uuid();
  v_key text := 'gate10-mesma-chave';
  v_antes numeric; v_sangrias integer;
BEGIN
  INSERT INTO public.fornecedores(id, cnpj, nome, loja_id)
  VALUES (v_forn, 'G10-' || left(v_forn::text, 10), 'Fornecedor gate10', current_setting('t.loja')::uuid);
  INSERT INTO public.contas_pagar(id, fornecedor_id, loja_id, vencimento, valor_total, valor_pago)
  VALUES (v_ap1, v_forn, current_setting('t.loja')::uuid, current_date, 10, 0),
         (v_ap2, v_forn, current_setting('t.loja')::uuid, current_date, 10, 0);

  UPDATE public.usuarios SET perfil = 'DONO', loja_id = current_setting('t.loja')::uuid, ativo = true
   WHERE id = current_setting('t.dono')::uuid;
  PERFORM set_config('request.jwt.claim.sub', current_setting('t.dono'), true);

  SELECT saldo_atual INTO v_antes FROM public.caixas WHERE id = v_caixa;

  SET LOCAL ROLE authenticated;
  PERFORM * FROM public.registrar_pagamento_contas_pagar(v_ap1, 1, 'DINHEIRO', now(), NULL, v_key, v_caixa, 'TESTE_DB', NULL);
  PERFORM * FROM public.registrar_pagamento_contas_pagar(v_ap2, 1, 'DINHEIRO', now(), NULL, v_key, v_caixa, 'TESTE_DB', NULL);
  RESET ROLE;

  SELECT count(*) INTO v_sangrias FROM public.movimentacoes_caixa
   WHERE caixa_id = v_caixa AND idempotency_key LIKE '%' || v_key;
  IF v_sangrias <> 2 THEN
    RAISE EXCEPTION 'GATE10_COLISAO_DE_CHAVE sangrias=% (esperado 2)', v_sangrias;
  END IF;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_antes - 2 THEN
    RAISE EXCEPTION 'GATE10_SAIDA_FISICA_INCORRETA';
  END IF;

  -- replay da mesma conta+chave não pode gerar uma terceira sangria
  PERFORM set_config('request.jwt.claim.sub', current_setting('t.dono'), true);
  SET LOCAL ROLE authenticated;
  PERFORM * FROM public.registrar_pagamento_contas_pagar(v_ap1, 1, 'DINHEIRO', now(), NULL, v_key, v_caixa, 'TESTE_DB', NULL);
  RESET ROLE;
  SELECT count(*) INTO v_sangrias FROM public.movimentacoes_caixa
   WHERE caixa_id = v_caixa AND idempotency_key LIKE '%' || v_key;
  IF v_sangrias <> 2 THEN
    RAISE EXCEPTION 'GATE10_REPLAY_DUPLICOU_SANGRIA sangrias=%', v_sangrias;
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 11 — retry offline compara a identidade do carrinho, não só os totais
-- Regressão: payload B (produto/quantidade diferentes, mesmos totais) era
-- aceito como replay; nada era persistido e o sync seguia baixando o estoque
-- do payload descartado.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  v_op uuid := current_setting('t.operador')::uuid;
  v_venda uuid := gen_random_uuid();
  v_bruto numeric := v_preco * 2;
  v_itens_a jsonb;
  v_itens_ordem jsonb;
  v_itens_qtd jsonb;
  v_ok boolean;
  v_linhas integer;
BEGIN
  -- carrinho original: duas linhas de 1 unidade a preço de tabela
  v_itens_a := jsonb_build_array(
    jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
      'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco),
    jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
      'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco));

  PERFORM public.registrar_venda_com_itens(v_venda, v_caixa, v_op, 'DINHEIRO',
    v_bruto, 0, v_bruto, v_itens_a, NULL, NULL, NULL);

  -- mesmo carrinho reenviado: replay silencioso
  PERFORM public.registrar_venda_com_itens(v_venda, v_caixa, v_op, 'DINHEIRO',
    v_bruto, 0, v_bruto, v_itens_a, NULL, NULL, NULL);

  -- mesma composição em ordem diferente continua sendo replay (ordem não é semântica)
  SELECT jsonb_agg(e ORDER BY e->>'item_id' DESC) INTO v_itens_ordem
    FROM jsonb_array_elements(v_itens_a) e;
  PERFORM public.registrar_venda_com_itens(v_venda, v_caixa, v_op, 'DINHEIRO',
    v_bruto, 0, v_bruto, v_itens_ordem, NULL, NULL, NULL);

  -- MESMOS totais, composição de quantidade diferente: precisa ser recusado
  v_itens_qtd := jsonb_build_array(jsonb_build_object(
    'item_id', gen_random_uuid(), 'produto_id', v_prod,
    'quantidade', 2, 'preco_original', v_preco, 'preco_unitario', v_preco));
  v_ok := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(v_venda, v_caixa, v_op, 'DINHEIRO',
      v_bruto, 0, v_bruto, v_itens_qtd, NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%ERRO_RPC_RETRY_PAYLOAD_DIVERGENTE%';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE11_CARRINHO_DIFERENTE_ACEITO_COMO_REPLAY'; END IF;

  SELECT count(*) INTO v_linhas FROM public.itens_venda WHERE venda_id = v_venda;
  IF v_linhas <> 2 THEN
    RAISE EXCEPTION 'GATE11_ITENS_ORIGINAIS_ALTERADOS linhas=%', v_linhas;
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 12 — estorno/cancelamento AR e AP (P1-4)
-- Regressão: a Fase 1A provisionou ESTORNO/operacao_origem_id e nenhum fluxo
-- usava; o cancelamento de AP era UPDATE direto de status, deixando pagamento
-- registrado e sangria aplicada sem contrapartida.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_loja uuid := current_setting('t.loja')::uuid;
  v_outra uuid := current_setting('t.outra_loja')::uuid;
  v_uid uuid := current_setting('t.dono')::uuid;
  v_forn uuid := gen_random_uuid();
  v_cli uuid := gen_random_uuid();
  v_ap_par uuid := gen_random_uuid();
  v_ap_tot uuid := gen_random_uuid();
  v_ap_pix uuid := gen_random_uuid();
  v_tr_par uuid := gen_random_uuid();
  v_tr_tot uuid := gen_random_uuid();
  v_pag uuid; v_liq uuid; v_est uuid;
  v_saldo0 numeric; v_saldo numeric; v_ec numeric;
  v_status text; v_pago numeric; v_aberto numeric; v_n integer;
  v_ok boolean;
BEGIN
  UPDATE public.usuarios SET perfil = 'DONO', loja_id = v_loja, ativo = true WHERE id = v_uid;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

  INSERT INTO public.fornecedores(id, cnpj, nome, loja_id)
  VALUES (v_forn, 'G12-' || left(v_forn::text, 10), 'Fornecedor gate12', v_loja);
  INSERT INTO public.clientes(id, nome, loja_id) VALUES (v_cli, 'Cliente gate12', v_loja);
  INSERT INTO public.contas_pagar(id, fornecedor_id, loja_id, vencimento, valor_total, valor_pago)
  VALUES (v_ap_par, v_forn, v_loja, current_date, 100, 0),
         (v_ap_tot, v_forn, v_loja, current_date, 100, 0),
         (v_ap_pix, v_forn, v_loja, current_date, 100, 0);
  INSERT INTO public.contas_receber(id, cliente_id, valor_total, valor_aberto, status, loja_id)
  VALUES (v_tr_par, v_cli, 100, 100, 'ABERTO', v_loja),
         (v_tr_tot, v_cli, 100, 100, 'ABERTO', v_loja);

  SELECT saldo_atual INTO v_saldo0 FROM public.caixas WHERE id = v_caixa;

  -- [1][3][13] AP parcialmente paga em DINHEIRO -> cancelamento
  SELECT pagamento_id INTO v_pag FROM public.registrar_pagamento_contas_pagar(
    v_ap_par, 40, 'DINHEIRO', now(), NULL, 'g12-par', v_caixa, 'TESTE_DB', NULL);
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo0 - 40 THEN
    RAISE EXCEPTION 'GATE12_AP_PAGTO_NAO_DEBITOU';
  END IF;

  SELECT status, valor_pago, estornos_gerados INTO v_status, v_pago, v_n
  FROM public.cancelar_conta_pagar(v_ap_par, 'fornecedor cancelou', 'g12-cancel-par', 'TESTE_DB');
  IF v_status <> 'CANCELADO' OR v_pago <> 0 OR v_n <> 1 THEN
    RAISE EXCEPTION 'GATE12_AP_CANCEL_PARCIAL status=% pago=% estornos=%', v_status, v_pago, v_n;
  END IF;
  -- [3] dinheiro recomposto exatamente uma vez
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo0 THEN
    RAISE EXCEPTION 'GATE12_AP_ESTORNO_NAO_RECOMPOS_CAIXA';
  END IF;
  -- [13] auditoria liga fato original ao estorno, e o original é preservado
  IF NOT EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos
                 WHERE conta_id = v_ap_par AND operacao_tipo = 'ESTORNO'
                   AND operacao_origem_id = v_pag) THEN
    RAISE EXCEPTION 'GATE12_AP_ESTORNO_SEM_VINCULO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos
                 WHERE id = v_pag AND operacao_tipo = 'PAGAMENTO' AND valor = 40) THEN
    RAISE EXCEPTION 'GATE12_AP_FATO_ORIGINAL_ALTERADO';
  END IF;

  -- [8] retry do cancelamento é idempotente
  SELECT estornos_gerados INTO v_n
  FROM public.cancelar_conta_pagar(v_ap_par, 'fornecedor cancelou', 'g12-cancel-par', 'TESTE_DB');
  IF v_n <> 0 THEN RAISE EXCEPTION 'GATE12_AP_CANCEL_RETRY_DUPLICOU'; END IF;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo0 THEN
    RAISE EXCEPTION 'GATE12_AP_CANCEL_RETRY_MEXEU_NO_CAIXA';
  END IF;

  -- [9] segundo estorno do mesmo pagamento é recusado
  v_ok := false;
  BEGIN
    PERFORM * FROM public.estornar_pagamento_contas_pagar(v_pag, 'de novo', 'g12-2x', 'TESTE_DB');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%ESTORNO_AP_JA_ESTORNADO%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE12_AP_SEGUNDO_ESTORNO_ACEITO'; END IF;

  -- [2] AP totalmente paga -> cancelamento
  PERFORM * FROM public.registrar_pagamento_contas_pagar(
    v_ap_tot, 100, 'DINHEIRO', now(), NULL, 'g12-tot', v_caixa, 'TESTE_DB', NULL);
  SELECT status, valor_pago INTO v_status, v_pago
  FROM public.cancelar_conta_pagar(v_ap_tot, 'erro de lancamento', 'g12-cancel-tot', 'TESTE_DB');
  IF v_status <> 'CANCELADO' OR v_pago <> 0 THEN
    RAISE EXCEPTION 'GATE12_AP_CANCEL_TOTAL status=% pago=%', v_status, v_pago;
  END IF;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo0 THEN
    RAISE EXCEPTION 'GATE12_AP_CANCEL_TOTAL_CAIXA';
  END IF;

  -- [4] AP não físico: estorno não altera o contador
  SELECT pagamento_id INTO v_pag FROM public.registrar_pagamento_contas_pagar(
    v_ap_pix, 60, 'PIX', now(), NULL, 'g12-pix', NULL, 'TESTE_DB', NULL);
  SELECT saldo_atual INTO v_saldo FROM public.caixas WHERE id = v_caixa;
  PERFORM * FROM public.estornar_pagamento_contas_pagar(v_pag, 'estorno pix', 'g12-pix-est', 'TESTE_DB');
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo THEN
    RAISE EXCEPTION 'GATE12_AP_NAO_FISICO_ALTEROU_GAVETA';
  END IF;
  IF (SELECT valor_pago FROM public.contas_pagar WHERE id = v_ap_pix) <> 0 THEN
    RAISE EXCEPTION 'GATE12_AP_PIX_VALOR_PAGO_NAO_ZEROU';
  END IF;

  -- [5][7] AR parcialmente recebido em DINHEIRO -> estorno debita o contador 1x
  SELECT saldo_atual INTO v_saldo0 FROM public.caixas WHERE id = v_caixa;
  SELECT liquidacao_id INTO v_liq FROM public.registrar_liquidacao_receber(
    v_tr_par, 30, 'DINHEIRO', NULL, 'g12-ar-par', v_caixa, 'TESTE_DB');
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo0 + 30 THEN
    RAISE EXCEPTION 'GATE12_AR_RECEBIMENTO_NAO_CREDITOU';
  END IF;
  SELECT estorno_id, valor_aberto, status INTO v_est, v_aberto, v_status
  FROM public.estornar_liquidacao_receber(v_liq, 'cliente devolveu', 'g12-ar-par-est', 'TESTE_DB');
  IF v_aberto <> 100 OR v_status <> 'ABERTO' THEN
    RAISE EXCEPTION 'GATE12_AR_ESTORNO_TITULO aberto=% status=%', v_aberto, v_status;
  END IF;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo0 THEN
    RAISE EXCEPTION 'GATE12_AR_ESTORNO_NAO_DEBITOU_UMA_VEZ';
  END IF;
  -- [13] vínculo e preservação do fato original
  IF NOT EXISTS (SELECT 1 FROM public.liquidacoes_receber
                 WHERE id = v_est AND operacao_tipo = 'ESTORNO' AND operacao_origem_id = v_liq) THEN
    RAISE EXCEPTION 'GATE12_AR_ESTORNO_SEM_VINCULO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.liquidacoes_receber
                 WHERE id = v_liq AND operacao_tipo = 'RECEBIMENTO' AND valor = 30) THEN
    RAISE EXCEPTION 'GATE12_AR_FATO_ORIGINAL_ALTERADO';
  END IF;

  -- [8] retry do estorno AR pela mesma chave é replay
  SELECT idempotent_replay INTO v_ok
  FROM public.estornar_liquidacao_receber(v_liq, 'cliente devolveu', 'g12-ar-par-est', 'TESTE_DB');
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE12_AR_ESTORNO_RETRY_NAO_E_REPLAY'; END IF;
  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo0 THEN
    RAISE EXCEPTION 'GATE12_AR_ESTORNO_RETRY_MEXEU_NO_CAIXA';
  END IF;

  -- [9] segundo estorno do mesmo recebimento, chave nova -> recusado
  v_ok := false;
  BEGIN
    PERFORM * FROM public.estornar_liquidacao_receber(v_liq, 'de novo', 'g12-ar-2x', 'TESTE_DB');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%ESTORNO_AR_JA_ESTORNADO%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE12_AR_SEGUNDO_ESTORNO_ACEITO'; END IF;

  -- [6] AR totalmente recebido -> estorno devolve o título a ABERTO
  SELECT liquidacao_id INTO v_liq FROM public.registrar_liquidacao_receber(
    v_tr_tot, 100, 'PIX', NULL, 'g12-ar-tot', NULL, 'TESTE_DB');
  IF (SELECT status FROM public.contas_receber WHERE id = v_tr_tot) <> 'QUITADO' THEN
    RAISE EXCEPTION 'GATE12_AR_TOTAL_NAO_QUITOU';
  END IF;
  SELECT valor_aberto, status INTO v_aberto, v_status
  FROM public.estornar_liquidacao_receber(v_liq, 'estorno total', 'g12-ar-tot-est', 'TESTE_DB');
  IF v_aberto <> 100 OR v_status <> 'ABERTO' THEN
    RAISE EXCEPTION 'GATE12_AR_ESTORNO_TOTAL aberto=% status=%', v_aberto, v_status;
  END IF;

  -- [11] outra loja -> rejeitado (AR e AP)
  UPDATE public.usuarios SET loja_id = v_outra WHERE id = v_uid;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  v_ok := false;
  BEGIN
    PERFORM * FROM public.estornar_liquidacao_receber(v_liq, 'x', 'g12-cross-ar', 'TESTE_DB');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%ESTORNO_AR_LOJA_DIVERGENTE%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE12_AR_ESTORNO_CROSS_LOJA_ACEITO'; END IF;
  v_ok := false;
  BEGIN
    -- motivo com >= 2 caracteres para que a checagem de loja seja de fato a
    -- que rejeita, e não a validação de motivo obrigatório.
    PERFORM * FROM public.cancelar_conta_pagar(v_ap_pix, 'tentativa cross-loja', 'g12-cross-ap', 'TESTE_DB');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%CANCELAR_AP_LOJA%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE12_AP_CANCEL_CROSS_LOJA_ACEITO'; END IF;

  -- [12] usuário inativo -> rejeitado
  UPDATE public.usuarios SET loja_id = v_loja, ativo = false WHERE id = v_uid;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  v_ok := false;
  BEGIN
    PERFORM * FROM public.estornar_liquidacao_receber(v_liq, 'x', 'g12-inativo', 'TESTE_DB');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%ESTORNO_AR_PERFIL%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE12_AR_ESTORNO_INATIVO_ACEITO'; END IF;
  UPDATE public.usuarios SET ativo = true WHERE id = v_uid;
END $g$;

-- [10] fault injection: falha depois do efeito físico reverte o estorno inteiro
CREATE FUNCTION pg_temp.fail_estorno_ap() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN RAISE EXCEPTION 'GATE12_FALHA_INJETADA'; END $f$;
CREATE TRIGGER gate12_fail_estorno AFTER INSERT ON public.contas_pagar_pagamentos
FOR EACH ROW WHEN (NEW.operacao_tipo = 'ESTORNO' AND NEW.observacao = 'gate12-fault')
EXECUTE FUNCTION pg_temp.fail_estorno_ap();

DO $g$
DECLARE
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_loja uuid := current_setting('t.loja')::uuid;
  v_uid uuid := current_setting('t.dono')::uuid;
  v_forn uuid := gen_random_uuid();
  v_ap uuid := gen_random_uuid();
  v_pag uuid; v_saldo numeric; v_pago numeric; v_ok boolean := false;
BEGIN
  UPDATE public.usuarios SET perfil = 'DONO', loja_id = v_loja, ativo = true WHERE id = v_uid;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  INSERT INTO public.fornecedores(id, cnpj, nome, loja_id)
  VALUES (v_forn, 'G12F-' || left(v_forn::text, 9), 'Fornecedor fault', v_loja);
  INSERT INTO public.contas_pagar(id, fornecedor_id, loja_id, vencimento, valor_total, valor_pago)
  VALUES (v_ap, v_forn, v_loja, current_date, 50, 0);

  SELECT pagamento_id INTO v_pag FROM public.registrar_pagamento_contas_pagar(
    v_ap, 20, 'DINHEIRO', now(), NULL, 'g12-fault', v_caixa, 'TESTE_DB', NULL);
  SELECT saldo_atual INTO v_saldo FROM public.caixas WHERE id = v_caixa;
  SELECT valor_pago INTO v_pago FROM public.contas_pagar WHERE id = v_ap;

  BEGIN
    PERFORM * FROM public.estornar_pagamento_contas_pagar(v_pag, 'gate12-fault', 'g12-fault-est', 'TESTE_DB');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%GATE12_FALHA_INJETADA%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE12_FAULT_NAO_PROPAGOU'; END IF;

  IF (SELECT saldo_atual FROM public.caixas WHERE id = v_caixa) <> v_saldo THEN
    RAISE EXCEPTION 'GATE12_FAULT_CAIXA_NAO_REVERTEU';
  END IF;
  IF (SELECT valor_pago FROM public.contas_pagar WHERE id = v_ap) <> v_pago THEN
    RAISE EXCEPTION 'GATE12_FAULT_TITULO_NAO_REVERTEU';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos WHERE operacao_origem_id = v_pag) THEN
    RAISE EXCEPTION 'GATE12_FAULT_ESTORNO_PERSISTIU';
  END IF;
END $g$;

DROP TRIGGER gate12_fail_estorno ON public.contas_pagar_pagamentos;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 13 — F-2: venda offline exige contexto de loja confiável
-- Regressão: `caixa_id = NULL` desligava a âncora de catálogo e um produto de
-- R$10,00 foi gravado a R$5.000,00. `calcular_preco_produto` não filtra loja,
-- então produto de outra loja também passava.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_loja uuid := current_setting('t.loja')::uuid;
  v_outra uuid := current_setting('t.outra_loja')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  v_op uuid := current_setting('t.operador')::uuid;
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_cx_outra uuid := gen_random_uuid();
  v_vendas_antes bigint;
  v_ok boolean;


BEGIN
  INSERT INTO public.caixas(id, operador_id, loja_id, status, valor_inicial)
  VALUES (v_cx_outra, NULL, v_outra, 'ABERTO', 0);
  SELECT count(*) INTO v_vendas_antes FROM public.vendas;

  -- caixa_id NULL precisa ser recusado, não silenciosamente sem âncora
  v_ok := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(gen_random_uuid(), NULL, v_op, 'DINHEIRO',
      5000, 0, 5000,
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
        'quantidade', 1, 'preco_original', 5000, 'preco_unitario', 5000)), NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%ERRO_RPC_VENDA_CAIXA_OBRIGATORIO%';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE13_CAIXA_NULL_ACEITO'; END IF;

  -- caixa inexistente
  v_ok := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(gen_random_uuid(), gen_random_uuid(), v_op, 'DINHEIRO',
      v_preco, 0, v_preco,
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
        'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%ERRO_RPC_VENDA_CAIXA_NAO_ENCONTRADO%';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE13_CAIXA_INEXISTENTE_ACEITO'; END IF;

  -- produto de outra loja
  v_ok := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(gen_random_uuid(), v_cx_outra, v_op, 'DINHEIRO',
      v_preco, 0, v_preco,
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
        'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%VENDA_PRODUTO_FORA_DA_LOJA%';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE13_PRODUTO_DE_OUTRA_LOJA_ACEITO'; END IF;

  -- nenhuma das rejeições pode ter deixado venda gravada
  IF (SELECT count(*) FROM public.vendas) <> v_vendas_antes THEN
    RAISE EXCEPTION 'GATE13_EFEITO_PARCIAL_APOS_REJEICAO';
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 14 — F-1: faixa de preço resolvida pela QUANTIDADE REAL
-- Regressão: a validação resolvia o catálogo com quantidade 1, então 10 un ao
-- preço de varejo passavam quando a faixa de atacado já valia — cliente
-- sobrecobrado em 43%.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_loja uuid := current_setting('t.loja')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  v_op uuid := current_setting('t.operador')::uuid;
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_atacado numeric := round(current_setting('t.preco')::numeric * 0.7, 2);
  v_canon numeric;
  v_ok boolean;
BEGIN
  INSERT INTO public.precos_atacado(id, produto_id, loja_id, quantidade_minima, preco_unitario, ativo)
  VALUES (gen_random_uuid(), v_prod, v_loja, 10, v_atacado, true);

  -- a faixa precisa de fato ser resolvida pela quantidade
  v_canon := (public.calcular_preco_produto(v_prod, 10, v_loja)->>'preco')::numeric;
  IF v_canon <> v_atacado THEN
    RAISE EXCEPTION 'GATE14_FIXTURE_SEM_FAIXA canonico=% esperado=%', v_canon, v_atacado;
  END IF;

  -- ATAQUE: 10 unidades cobradas ao preço de varejo
  v_ok := false;
  BEGIN
    PERFORM public.registrar_venda_com_itens(gen_random_uuid(), v_caixa, v_op, 'DINHEIRO',
      round(v_preco * 10, 2), 0, round(v_preco * 10, 2),
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
        'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%VENDA_PRECO_ACIMA_DA_FAIXA%';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE14_SOBREPRECO_NA_FAIXA_ACEITO'; END IF;

  -- venda legítima na faixa continua passando e é rotulada ATACADO
  DECLARE v_v uuid := gen_random_uuid(); v_tipo text;
  BEGIN
    PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_op, 'DINHEIRO',
      round(v_preco * 10, 2), round((v_preco - v_atacado) * 10, 2), round(v_atacado * 10, 2),
      jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
        'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_atacado)), NULL, NULL, NULL);
    SELECT tipo_preco INTO v_tipo FROM public.itens_venda WHERE venda_id = v_v LIMIT 1;
    IF v_tipo <> 'ATACADO' THEN
      RAISE EXCEPTION 'GATE14_FAIXA_LEGITIMA_ROTULADA_% (esperado ATACADO)', v_tipo;
    END IF;
  END;

  -- abaixo do mínimo a faixa não vale: varejo continua correto
  PERFORM public.registrar_venda_com_itens(gen_random_uuid(), v_caixa, v_op, 'DINHEIRO',
    round(v_preco * 9, 2), 0, round(v_preco * 9, 2),
    jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', v_prod,
      'quantidade', 9, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 15 — FIN-298-03: comissão nasce na venda concluída, exatamente uma vez
-- Regressão: `trg_registrar_comissao` era `AFTER UPDATE OF status` e os dois
-- escritores inserem a venda já CONCLUIDA — comissões geradas: 0 nos dois
-- caminhos.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_loja uuid := current_setting('t.loja')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  v_op uuid := current_setting('t.operador')::uuid;
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_voff uuid := gen_random_uuid();
  v_vtrans uuid := gen_random_uuid();
  v_itens jsonb;
  v_n integer;
BEGIN
  INSERT INTO public.configuracoes_gerais(chave, valor, tipo_dado)
  VALUES ('comissao_padrao_percentual', '5', 'percent')
  ON CONFLICT (chave) DO UPDATE SET valor = '5';

  v_itens := jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(),
    'produto_id', v_prod, 'quantidade', 1,
    'preco_original', v_preco, 'preco_unitario', v_preco));

  -- venda offline que entra já CONCLUIDA precisa gerar comissão
  PERFORM public.registrar_venda_com_itens(v_voff, v_caixa, v_op, 'DINHEIRO',
    v_preco, 0, v_preco, v_itens, NULL, NULL, NULL);
  SELECT count(*) INTO v_n FROM public.comissoes_vendedores WHERE venda_id = v_voff;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'GATE15_OFFLINE_CONCLUIDA_SEM_COMISSAO comissoes=%', v_n;
  END IF;

  -- retry não pode duplicar
  PERFORM public.registrar_venda_com_itens(v_voff, v_caixa, v_op, 'DINHEIRO',
    v_preco, 0, v_preco, v_itens, NULL, NULL, NULL);
  SELECT count(*) INTO v_n FROM public.comissoes_vendedores WHERE venda_id = v_voff;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE15_RETRY_DUPLICOU_COMISSAO comissoes=%', v_n; END IF;

  -- venda que nasce em outro estado e só depois é concluída
  INSERT INTO public.vendas(id, caixa_id, operador_id, total_bruto, total_desconto,
    total_liquido, forma_pagamento, status)
  -- PIX: uma venda inserida direto, sem linha em `vendas_pagamentos`, cairia no
  -- ramo legado de E(c) e divergiria do contador. Forma nao fisica isola o gate.
  VALUES (v_vtrans, v_caixa, v_op, v_preco, 0, v_preco, 'PIX', 'CANCELADA');
  INSERT INTO public.itens_venda(id, venda_id, produto_id, quantidade,
    preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco)
  VALUES (gen_random_uuid(), v_vtrans, v_prod, 1, v_preco, v_preco, 0, 'VAREJO');

  SELECT count(*) INTO v_n FROM public.comissoes_vendedores WHERE venda_id = v_vtrans;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GATE15_COMISSAO_EM_VENDA_NAO_CONCLUIDA'; END IF;

  UPDATE public.vendas SET status = 'CONCLUIDA' WHERE id = v_vtrans;
  SELECT count(*) INTO v_n FROM public.comissoes_vendedores WHERE venda_id = v_vtrans;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE15_TRANSICAO_SEM_COMISSAO comissoes=%', v_n; END IF;

  -- segundo UPDATE para CONCLUIDA não duplica
  UPDATE public.vendas SET status = 'CONCLUIDA' WHERE id = v_vtrans;
  SELECT count(*) INTO v_n FROM public.comissoes_vendedores WHERE venda_id = v_vtrans;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE15_SEGUNDO_UPDATE_DUPLICOU comissoes=%', v_n; END IF;

  -- invariante global: 1 venda concluída com itens = 1 comissão
  SELECT count(*) INTO v_n
  FROM public.vendas v
  WHERE v.status = 'CONCLUIDA'
    AND EXISTS (SELECT 1 FROM public.itens_venda i WHERE i.venda_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM public.comissoes_vendedores c WHERE c.venda_id = v.id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GATE15_VENDAS_CONCLUIDAS_SEM_COMISSAO=%', v_n;
  END IF;
END $g$;

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
