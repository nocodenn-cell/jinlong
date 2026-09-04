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
-- Escolher "o primeiro GERENTE" torna a suíte dependente da ordem do seed --
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
WHERE loja_id = :'loja'::uuid
  AND preco_varejo > 0
  AND preco_custo IS NOT NULL
  -- Gate 21 cria deliberadamente uma regra por margem 50–100. Produtos
  -- sintéticos do teste RLS podem ter custo NULL e não são fixtures válidas
  -- para provar o congelamento histórico dessa regra.
  AND ((preco_varejo - preco_custo) / preco_varejo * 100) BETWEEN 50 AND 100
ORDER BY id LIMIT 1 \gset
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
-- (REMOVIDO) bloco de limpeza que precedia o GATE 9
-- ═══════════════════════════════════════════════════════════════════════════
-- Existia aqui um `DO` que executava, imediatamente antes do GATE 9:
--
--   REVOKE EXECUTE ON FUNCTION public.relatorio_consistencia_vendas(...)
--     FROM PUBLIC, anon, authenticated;
--   REVOKE EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid)
--     FROM PUBLIC, anon, authenticated;
--
-- A justificativa era "o CI pode não ter aplicado a migration 20260818000001".
--
-- O efeito real era outro: o bloco **consertava exatamente a condição que o
-- GATE 9 asserta em seguida**, tornando o gate incapaz de falhar. Conceder
-- `EXECUTE` a PUBLIC antes de rodar a suíte não a quebrava — o cleanup
-- revogava, e o GATE 9 passava. Um gate que se auto-repara não é regressão,
-- é decoração: ele passaria mesmo com o vazamento aberto em produção.
--
-- Verificado em 2026-08-19: com o bloco presente, `GRANT EXECUTE ... TO PUBLIC`
-- seguido de `npm run test:financial` NÃO produzia `GATE9_DIAGNOSTICO_EXPOSTO`.
--
-- A justificativa também caducou: `20260819000000` está aplicada em produção
-- (ledger 307) e no banco local reconstruído do repositório. Se um ambiente
-- não tiver a migration, o GATE 9 **deve** falhar — é essa a informação.
-- ═══════════════════════════════════════════════════════════════════════════

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
DECLARE v_fn text; v_papel text; v_acl text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['verificar_consistencia_venda', 'relatorio_consistencia_vendas'] LOOP
    -- Papéis alcancaveis pelo cliente. `anon` entra junto de `authenticated`:
    -- uma funcao SECURITY DEFINER sem guarda exposta a `anon` e pior, nao
    -- melhor, e o REVOKE de 20260819000000 fecha os dois.
    FOREACH v_papel IN ARRAY ARRAY['authenticated', 'anon'] LOOP
      IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_fn
          AND has_function_privilege(v_papel, p.oid, 'EXECUTE')
      ) THEN
        RAISE EXCEPTION 'GATE9_DIAGNOSTICO_EXPOSTO: % executavel por %', v_fn, v_papel;
      END IF;
    END LOOP;

    -- A concessao a PUBLIC e a causa raiz que a 20260818000001 nao removeu:
    -- toda funcao nasce com EXECUTE para PUBLIC, e revogar so de
    -- `authenticated` deixa o acesso vivo POR HERANCA. Checar os papeis acima
    -- ja pega o sintoma, mas so olhar a ACL prova que a concessao sumiu — e e
    -- isso que impede a regressao de voltar por uma funcao recem-criada, cuja
    -- ACL default (`proacl IS NULL`) tambem concede a PUBLIC.
    FOR v_acl IN
      SELECT coalesce(p.proacl::text, '<default: PUBLIC>')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_fn
        AND (p.proacl IS NULL OR EXISTS (
          SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%'
        ))
    LOOP
      RAISE EXCEPTION
        'GATE9_DIAGNOSTICO_EXPOSTO: % ainda concede EXECUTE a PUBLIC (acl=%)', v_fn, v_acl;
    END LOOP;
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
-- GATE 16 — F-3: `authenticated` não pode TRUNCATE (ignora RLS)
-- GATE 17 — F-4: `caixas` não é apagável fisicamente por ator de aplicação
-- Regressão: TRUNCATE caixas CASCADE apagou 24 tabelas, incluindo a auditoria
-- de cancelamento; e DONO/GERENTE/ADMIN apagavam caixa aberto sem movimento.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_tab text;
  v_n integer;
BEGIN
  -- GATE 16: nenhuma tabela do schema público pode conceder TRUNCATE aos
  -- papéis de aplicação. Checagem por catálogo cobre tabelas futuras.
  SELECT count(*) INTO v_n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND privilege_type = 'TRUNCATE'
    AND grantee IN ('authenticated', 'anon');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GATE16_TRUNCATE_CONCEDIDO em % grant(s)', v_n;
  END IF;

  -- GATE 17: DELETE em caixas fora do alcance dos papéis de aplicação.
  SELECT count(*) INTO v_n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'caixas'
    AND privilege_type = 'DELETE'
    AND grantee IN ('authenticated', 'anon');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GATE17_DELETE_CAIXAS_CONCEDIDO em % grant(s)', v_n;
  END IF;

  -- os fluxos legítimos continuam: leitura e mudança de status
  SELECT count(*) INTO v_n
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'caixas'
    AND privilege_type = 'SELECT' AND grantee = 'authenticated';
  IF v_n = 0 THEN RAISE EXCEPTION 'GATE17_LEITURA_DE_CAIXAS_QUEBRADA'; END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 18 — DB-05: ajustes pós-venda de comissão
-- Regressão: cancelamento e devolução não produziam nenhuma compensação, e a
-- comissão continuava valendo o total da venda original.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_loja uuid := current_setting('t.loja')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  v_op uuid := current_setting('t.operador')::uuid;
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_v uuid; v_item uuid; v_oper uuid;
  v_com numeric; v_aj numeric; v_liq numeric; v_saldo numeric; v_n integer;
  v_bruto numeric := round(v_preco * 10, 2);
  -- O GATE 14 cria faixa de atacado para este produto: 10 unidades tem preco
  -- canonico proprio. Vender ao preco de tabela seria (corretamente) recusado
  -- pelo F-1, entao a fixture usa o preco devido para a quantidade.
  v_unit numeric := (public.calcular_preco_produto(
    current_setting('t.produto')::uuid, 10, current_setting('t.loja')::uuid)->>'preco')::numeric;
  v_liquido numeric := round(v_unit * 10, 2);
BEGIN
  INSERT INTO public.configuracoes_gerais(chave, valor, tipo_dado)
  VALUES ('comissao_padrao_percentual', '5', 'percent')
  ON CONFLICT (chave) DO UPDATE SET valor = '5';

  -- ---------------------------------------------------------------- devolução parcial
  v_v := gen_random_uuid(); v_item := gen_random_uuid(); v_oper := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_op, 'DINHEIRO',
    v_bruto, round(v_bruto - v_liquido, 2), v_liquido,
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_unit)), NULL, NULL, NULL);
  SELECT valor_comissao INTO v_com FROM public.comissoes_vendedores WHERE venda_id = v_v;
  IF COALESCE(v_com, 0) <= 0 THEN RAISE EXCEPTION 'GATE18_SEM_COMISSAO_ORIGINAL'; END IF;

  SET CONSTRAINTS ALL DEFERRED;  -- cada operacao volta ao modo deferido
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_oper, 'g18-dev-' || v_oper::text, v_v, 'DEVOLUCAO', 'devolucao parcial',
    round(v_unit * 4, 2), round(v_unit * 4, 2), 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_oper, v_item, v_prod, 4, v_unit, round(v_unit * 4, 2));

  SET CONSTRAINTS ALL IMMEDIATE;  -- DB-05B: ajuste e deferido ate o commit
  SELECT total_ajustes, valor_liquido INTO v_aj, v_liq
  FROM public.comissoes_vendedores_liquidas WHERE venda_id = v_v;
  -- 40% devolvido: o ajuste segue os ITENS, não uma proporção artificial
  IF v_aj <> round(v_com * 0.4, 2) OR v_liq <> round(v_com * 0.6, 2) THEN
    RAISE EXCEPTION 'GATE18_DEVOLUCAO_PARCIAL ajuste=% liquido=% (esperado % e %)',
      v_aj, v_liq, round(v_com * 0.4, 2), round(v_com * 0.6, 2);
  END IF;

  -- retry do MESMO fato não duplica
  PERFORM public.processar_ajuste_comissao_venda(v_v, 'DEVOLUCAO', v_oper);
  SELECT count(*) INTO v_n FROM public.comissoes_ajustes WHERE venda_id = v_v;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE18_RETRY_DEVOLUCAO_DUPLICOU n=%', v_n; END IF;

  -- segunda devolução leva o líquido a zero, de forma incremental
  v_oper := gen_random_uuid();
  SET CONSTRAINTS ALL DEFERRED;  -- cada operacao volta ao modo deferido
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_oper, 'g18-dev2-' || v_oper::text, v_v, 'DEVOLUCAO', 'devolucao do restante',
    round(v_unit * 6, 2), round(v_unit * 6, 2), 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_oper, v_item, v_prod, 6, v_unit, round(v_unit * 6, 2));

  SET CONSTRAINTS ALL IMMEDIATE;  -- DB-05B: ajuste e deferido ate o commit
  SELECT total_ajustes, valor_liquido INTO v_aj, v_liq
  FROM public.comissoes_vendedores_liquidas WHERE venda_id = v_v;
  IF v_aj <> v_com OR v_liq <> 0 THEN
    RAISE EXCEPTION 'GATE18_DEVOLUCAO_TOTAL ajuste=% liquido=% (esperado % e 0)', v_aj, v_liq, v_com;
  END IF;
  -- o fato original nunca é alterado
  IF (SELECT valor_comissao FROM public.comissoes_vendedores WHERE venda_id = v_v) <> v_com THEN
    RAISE EXCEPTION 'GATE18_FATO_ORIGINAL_ALTERADO';
  END IF;

  -- ---------------------------------------------------------------- cancelamento
  v_v := gen_random_uuid(); v_item := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_op, 'PIX',  -- nao fisica: o UPDATE cru de status nao
    -- estorna a gaveta como a RPC real faria, e o GATE 8 compara contador x E(c)
    v_bruto, round(v_bruto - v_liquido, 2), v_liquido,
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_unit)), NULL, NULL, NULL);
  SELECT valor_comissao INTO v_com FROM public.comissoes_vendedores WHERE venda_id = v_v;

  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = v_v;
  SET CONSTRAINTS ALL IMMEDIATE;  -- DB-05B: ajuste e deferido ate o commit
  SELECT total_ajustes, valor_liquido INTO v_aj, v_liq
  FROM public.comissoes_vendedores_liquidas WHERE venda_id = v_v;
  IF v_aj <> v_com OR v_liq <> 0 THEN
    RAISE EXCEPTION 'GATE18_CANCELAMENTO ajuste=% liquido=% (esperado % e 0)', v_aj, v_liq, v_com;
  END IF;

  -- retry e segundo cancelamento não duplicam
  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = v_v;
  PERFORM public.processar_ajuste_comissao_venda(v_v, 'CANCELAMENTO', v_v);
  SELECT count(*) INTO v_n FROM public.comissoes_ajustes WHERE venda_id = v_v;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE18_RETRY_CANCELAMENTO_DUPLICOU n=%', v_n; END IF;

  -- ---------------------------------------------------------------- comissão já paga
  v_v := gen_random_uuid(); v_item := gen_random_uuid(); v_oper := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_op, 'DINHEIRO',
    v_bruto, round(v_bruto - v_liquido, 2), v_liquido,
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_unit)), NULL, NULL, NULL);
  SELECT valor_comissao INTO v_com FROM public.comissoes_vendedores WHERE venda_id = v_v;
  UPDATE public.comissoes_vendedores SET status = 'pago', pago_em = now(), pago_por = v_op
   WHERE venda_id = v_v;

  SET CONSTRAINTS ALL DEFERRED;  -- cada operacao volta ao modo deferido
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_oper, 'g18-paga-' || v_oper::text, v_v, 'DEVOLUCAO', 'devolucao apos pagamento',
    round(v_unit * 4, 2), round(v_unit * 4, 2), 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_oper, v_item, v_prod, 4, v_unit, round(v_unit * 4, 2));

  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT total_ajustes, saldo_a_compensar INTO v_aj, v_saldo
  FROM public.comissoes_vendedores_liquidas WHERE venda_id = v_v;
  -- o pagamento nunca é reescrito
  IF (SELECT status FROM public.comissoes_vendedores WHERE venda_id = v_v) <> 'pago'
     OR (SELECT pago_em FROM public.comissoes_vendedores WHERE venda_id = v_v) IS NULL
     OR (SELECT valor_comissao FROM public.comissoes_vendedores WHERE venda_id = v_v) <> v_com THEN
    RAISE EXCEPTION 'GATE18_PAGAMENTO_REESCRITO';
  END IF;
  IF v_saldo <> -v_aj THEN
    RAISE EXCEPTION 'GATE18_SALDO_A_COMPENSAR saldo=% ajuste=%', v_saldo, v_aj;
  END IF;

  -- ---------------------------------------------------------------- auditoria
  IF NOT EXISTS (
    SELECT 1 FROM public.comissoes_ajustes a
    JOIN public.comissoes_vendedores c ON c.id = a.comissao_id
    WHERE a.venda_id = v_v AND a.origem_id = v_oper AND a.tipo = 'DEVOLUCAO'
      AND a.idempotency_key = 'DEVOLUCAO:' || v_oper::text
  ) THEN
    RAISE EXCEPTION 'GATE18_TRILHA_DE_AUDITORIA_INCOMPLETA';
  END IF;

  -- nenhum ajuste pode existir sem comissão de origem
  IF EXISTS (SELECT 1 FROM public.comissoes_ajustes a
             WHERE NOT EXISTS (SELECT 1 FROM public.comissoes_vendedores c WHERE c.id = a.comissao_id)) THEN
    RAISE EXCEPTION 'GATE18_AJUSTE_ORFAO';
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 19 — DB-05A: pagamento líquido consome o ajuste negativo
-- Regressão DB05-F1: `marcar_comissoes_pagas` pagava a linha positiva
-- integral e o `saldo_a_compensar` era só informativo. O cenário obrigatório
-- do handoff é +5 / pago 5 / -2 / +5 -> próximo pagamento tem de ser 3.
-- Usa o fluxo canônico real, nunca UPDATE status='pago'.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_loja uuid := current_setting('t.loja')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  -- Vendedor proprio: o OPERADOR ja acumula ajustes dos gates anteriores e a
  -- liquidacao (corretamente) consumiria esse debito, mascarando o cenario.
  v_op uuid := current_setting('t.dono')::uuid;
  v_ger uuid := current_setting('t.gerente')::uuid;
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_unit numeric := (public.calcular_preco_produto(v_prod, 10, v_loja)->>'preco')::numeric;
  v_v1 uuid := gen_random_uuid(); v_v2 uuid := gen_random_uuid();
  v_i1 uuid := gen_random_uuid(); v_i2 uuid := gen_random_uuid();
  v_o uuid := gen_random_uuid();
  v_c1 uuid; v_c2 uuid; r record;
  v_bruto numeric := round(v_preco * 10, 2);
  v_liq numeric := round(v_unit * 10, 2);
  v_com numeric; v_aj numeric; v_esperado numeric;
BEGIN
  INSERT INTO public.configuracoes_gerais(chave, valor, tipo_dado)
  VALUES ('comissao_padrao_percentual', '5', 'percent')
  ON CONFLICT (chave) DO UPDATE SET valor = '5';
  PERFORM set_config('request.jwt.claim.sub', v_ger::text, true);

  PERFORM public.registrar_venda_com_itens(v_v1, v_caixa, v_op, 'DINHEIRO',
    v_bruto, round(v_bruto - v_liq, 2), v_liq,
    jsonb_build_array(jsonb_build_object('item_id', v_i1, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_unit)), NULL, NULL, NULL);
  SELECT id, valor_comissao INTO v_c1, v_com FROM public.comissoes_vendedores WHERE venda_id = v_v1;
  IF COALESCE(v_com, 0) <= 0 THEN RAISE EXCEPTION 'GATE19_SEM_COMISSAO'; END IF;

  -- pagamento 1: nada a compensar
  SELECT * INTO r FROM public.liquidar_comissoes(v_loja, v_op, ARRAY[v_c1], 'g19-lote1-' || v_v1::text);
  IF r.valor_liquido <> v_com OR r.valor_compensado <> 0 THEN
    RAISE EXCEPTION 'GATE19_PAGAMENTO1 bruto=% comp=% liq=%', r.valor_bruto, r.valor_compensado, r.valor_liquido;
  END IF;

  -- devolução de 40% depois de pago -> ajuste
  SET CONSTRAINTS ALL DEFERRED;  -- cada operacao volta ao modo deferido
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_o, 'g19-dev-' || v_o::text, v_v1, 'DEVOLUCAO', 'devolucao apos pagamento',
    round(v_unit * 4, 2), round(v_unit * 4, 2), 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_o, v_i1, v_prod, 4, v_unit, round(v_unit * 4, 2));

  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT COALESCE(SUM(valor), 0) INTO v_aj FROM public.comissoes_ajustes WHERE venda_id = v_v1;
  IF v_aj <= 0 THEN RAISE EXCEPTION 'GATE19_SEM_AJUSTE'; END IF;

  -- nova comissão do mesmo valor
  PERFORM public.registrar_venda_com_itens(v_v2, v_caixa, v_op, 'DINHEIRO',
    v_bruto, round(v_bruto - v_liq, 2), v_liq,
    jsonb_build_array(jsonb_build_object('item_id', v_i2, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_unit)), NULL, NULL, NULL);
  SELECT id INTO v_c2 FROM public.comissoes_vendedores WHERE venda_id = v_v2;

  -- pagamento 2: TEM de compensar o ajuste
  SELECT * INTO r FROM public.liquidar_comissoes(v_loja, v_op, ARRAY[v_c2], 'g19-lote2-' || v_v2::text);
  v_esperado := round(v_com - v_aj, 2);
  IF r.valor_compensado <> v_aj OR r.valor_liquido <> v_esperado THEN
    RAISE EXCEPTION 'GATE19_PAGAMENTO_NAO_COMPENSOU bruto=% comp=% liq=% (esperado comp=% liq=%)',
      r.valor_bruto, r.valor_compensado, r.valor_liquido, v_aj, v_esperado;
  END IF;

  -- o débito foi totalmente absorvido
  IF (SELECT ajuste_nao_compensado FROM public.comissoes_saldo_operador
      WHERE loja_id = v_loja AND operador_id = v_op) <> 0 THEN
    RAISE EXCEPTION 'GATE19_SALDO_RESIDUAL';
  END IF;

  -- retry do lote não paga de novo
  SELECT * INTO r FROM public.liquidar_comissoes(v_loja, v_op, ARRAY[v_c2], 'g19-lote2-' || v_v2::text);
  IF NOT r.idempotent_replay THEN RAISE EXCEPTION 'GATE19_RETRY_NAO_E_REPLAY'; END IF;
  IF (SELECT count(*) FROM public.comissoes_pagamentos) <> 2 THEN
    RAISE EXCEPTION 'GATE19_RETRY_CRIOU_LOTE';
  END IF;

  -- trilha: cada comissão aponta o lote que a pagou e o consumo é explícito
  IF (SELECT pagamento_id FROM public.comissoes_vendedores WHERE id = v_c1) IS NULL
     OR (SELECT pagamento_id FROM public.comissoes_vendedores WHERE id = v_c2) IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.comissoes_pagamentos_ajustes) THEN
    RAISE EXCEPTION 'GATE19_TRILHA_INCOMPLETA';
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 20 — DB-05B: devolução multi-item processa TODOS os itens
-- Regressão DB05-F2: `devolver_ou_trocar_venda` insere os itens num FOR LOOP,
-- uma instrução por item. O gatilho por instrução disparava no primeiro item e
-- criava a chave, e os demais caíam no retorno antecipado de idempotência.
-- Provado: venda de 2 itens com base 200 e comissão 10,00 devolvida
-- integralmente gerava ajuste de apenas 5,00 — metade da comissão ficava.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_loja uuid := current_setting('t.loja')::uuid;
  v_op uuid := current_setting('t.operador')::uuid;
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_pa uuid; v_pb uuid;
  v_v uuid := gen_random_uuid();
  v_ia uuid := gen_random_uuid(); v_ib uuid := gen_random_uuid();
  v_o uuid := gen_random_uuid(); v_o2 uuid := gen_random_uuid();
  v_com numeric; v_aj numeric; v_liq numeric; v_n integer;
  v_pa_preco numeric; v_pb_preco numeric; v_bruto numeric;
BEGIN
  INSERT INTO public.configuracoes_gerais(chave, valor, tipo_dado)
  VALUES ('comissao_padrao_percentual', '5', 'percent')
  ON CONFLICT (chave) DO UPDATE SET valor = '5';

  -- dois produtos distintos, sem faixa de atacado, para isolar o multi-item
  SELECT id INTO v_pa FROM public.produtos WHERE loja_id = v_loja AND preco_varejo > 0 ORDER BY id LIMIT 1;
  SELECT id INTO v_pb FROM public.produtos
   WHERE loja_id = v_loja AND preco_varejo > 0 AND id <> v_pa ORDER BY id LIMIT 1;
  IF v_pb IS NULL THEN RAISE EXCEPTION 'GATE20_FIXTURE_PRECISA_DE_DOIS_PRODUTOS'; END IF;
  DELETE FROM public.precos_atacado WHERE produto_id IN (v_pa, v_pb);
  INSERT INTO public.estoque(produto_id, loja_id, quantidade_atual)
  VALUES (v_pa, v_loja, 10000), (v_pb, v_loja, 10000)
  ON CONFLICT (produto_id, loja_id) DO UPDATE SET quantidade_atual = 10000;
  SELECT preco_varejo INTO v_pa_preco FROM public.produtos WHERE id = v_pa;
  SELECT preco_varejo INTO v_pb_preco FROM public.produtos WHERE id = v_pb;
  v_bruto := round(v_pa_preco * 2 + v_pb_preco * 3, 2);

  PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_op, 'DINHEIRO',
    v_bruto, 0, v_bruto,
    jsonb_build_array(
      jsonb_build_object('item_id', v_ia, 'produto_id', v_pa, 'quantidade', 2,
        'preco_original', v_pa_preco, 'preco_unitario', v_pa_preco),
      jsonb_build_object('item_id', v_ib, 'produto_id', v_pb, 'quantidade', 3,
        'preco_original', v_pb_preco, 'preco_unitario', v_pb_preco)),
    NULL, NULL, NULL);
  SELECT valor_comissao INTO v_com FROM public.comissoes_vendedores WHERE venda_id = v_v;
  IF COALESCE(v_com, 0) <= 0 THEN RAISE EXCEPTION 'GATE20_SEM_COMISSAO'; END IF;

  -- UMA operação, os dois itens em instruções separadas (como a RPC real faz)
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_o, 'g20-' || v_o::text, v_v, 'DEVOLUCAO', 'devolucao integral multi-item',
    v_bruto, v_bruto, 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_o, v_ia, v_pa, 2, v_pa_preco, round(v_pa_preco * 2, 2));
  -- nada pode ter sido processado ainda: a operação não está completa
  IF EXISTS (SELECT 1 FROM public.comissoes_ajustes WHERE venda_id = v_v) THEN
    RAISE EXCEPTION 'GATE20_PROCESSOU_ANTES_DA_OPERACAO_COMPLETA';
  END IF;
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_o, v_ib, v_pb, 3, v_pb_preco, round(v_pb_preco * 3, 2));

  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT count(*), COALESCE(SUM(valor), 0) INTO v_n, v_aj
  FROM public.comissoes_ajustes WHERE venda_id = v_v;
  SELECT valor_liquido INTO v_liq FROM public.comissoes_vendedores_liquidas WHERE venda_id = v_v;

  -- um único ajuste lógico, cobrindo os DOIS itens, líquido exatamente zero
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE20_AJUSTES_ESPERADO_1 n=%', v_n; END IF;
  IF v_aj <> v_com THEN
    RAISE EXCEPTION 'GATE20_AJUSTE_PARCIAL ajuste=% (esperado %) — segundo item ignorado', v_aj, v_com;
  END IF;
  IF v_liq <> 0 THEN RAISE EXCEPTION 'GATE20_LIQUIDO_NAO_ZEROU liquido=%', v_liq; END IF;

  -- fato original intacto
  IF (SELECT valor_comissao FROM public.comissoes_vendedores WHERE venda_id = v_v) <> v_com THEN
    RAISE EXCEPTION 'GATE20_FATO_ORIGINAL_ALTERADO';
  END IF;

  -- repetir a MESMA operação não altera contagem nem valores
  PERFORM public.processar_ajuste_comissao_venda(v_v, 'DEVOLUCAO', v_o);
  SELECT count(*), COALESCE(SUM(valor), 0) INTO v_n, v_aj
  FROM public.comissoes_ajustes WHERE venda_id = v_v;
  IF v_n <> 1 OR v_aj <> v_com THEN
    RAISE EXCEPTION 'GATE20_RETRY_ALTEROU n=% total=%', v_n, v_aj;
  END IF;

  -- uma operação distinta posterior não colide, e nada além do original é devolvido
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_o2, 'g20b-' || v_o2::text, v_v, 'DEVOLUCAO', 'operacao distinta',
    0, 0, 'DINHEIRO', v_op, v_caixa);
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT COALESCE(SUM(valor), 0) INTO v_aj FROM public.comissoes_ajustes WHERE venda_id = v_v;
  IF v_aj > v_com THEN
    RAISE EXCEPTION 'GATE20_AJUSTE_ULTRAPASSOU_ORIGINAL total=% original=%', v_aj, v_com;
  END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 21 — DB-05C: snapshot histórico da comissão por item
-- Regressão DB05-F4, falsificada empiricamente antes da correção: comissão
-- original a 5% (R$44,95 sobre R$899,00); depois da venda, custo, regra de
-- funcionário e percentual global mudam; devolução de 40%. O ajuste obtido
-- era R$0,00 — a comissão "efetiva" era recalculada com dados ATUAIS e
-- superava a original, zerando o alvo. O ajuste correto é R$17,98.
--
-- Três variações separadas, cada uma isolando UM vazamento possível:
--   21a. custo do produto muda (afeta a margem, que escolhe a regra)
--   21b. o percentual da própria regra vigente muda
--   21c. o percentual global (fallback) muda
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_loja uuid := current_setting('t.loja')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_op uuid := current_setting('t.operador')::uuid;
  v_ger uuid := current_setting('t.gerente')::uuid;
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  v_func uuid;
  v_regra uuid;
  v_custo_original numeric;
  v_v uuid; v_item uuid; v_oper uuid;
  v_com numeric; v_aj numeric; v_esperado numeric;
  v_origem_snapshot text;
BEGIN
  SELECT preco_custo INTO v_custo_original FROM public.produtos WHERE id = v_prod;

  -- Vincula o OPERADOR a um funcionário com regra própria por_margem, para
  -- que a mudança de custo (21a) tenha algo real para desviar.
  v_func := gen_random_uuid();
  INSERT INTO public.funcionarios(id, loja_id, nome, ativo)
  VALUES (v_func, v_loja, 'Funcionario gate21', true);
  UPDATE public.usuarios SET funcionario_id = v_func WHERE id = v_op;

  -- Faixa estreita (50-100): a margem original do produto do gate cai dentro
  -- dela; um aumento de custo que ainda respeite o preço de venda (guarda
  -- PRODUTO_VAREJO_ABAIXO_CUSTO) derruba a margem para fora da faixa.
  v_regra := gen_random_uuid();
  INSERT INTO public.comissoes_regras_funcionario(
    id, funcionario_id, loja_id, tipo_regra, margem_minima, margem_maxima,
    percentual, created_by)
  VALUES (v_regra, v_func, v_loja, 'por_margem', 50, 100, 5, v_ger);

  -- ---------------------------------------------------------------- 21a: custo
  v_v := gen_random_uuid(); v_item := gen_random_uuid(); v_oper := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_op, 'DINHEIRO',
    round(v_preco * 10, 2), 0, round(v_preco * 10, 2),
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  SELECT valor_comissao INTO v_com FROM public.comissoes_vendedores WHERE venda_id = v_v;
  IF COALESCE(v_com, 0) <= 0 THEN RAISE EXCEPTION 'GATE21A_SEM_COMISSAO_ORIGINAL'; END IF;

  SELECT origem_regra INTO v_origem_snapshot
  FROM public.comissoes_itens WHERE venda_id = v_v;
  IF v_origem_snapshot IS NULL THEN
    RAISE EXCEPTION 'GATE21A_SEM_SNAPSHOT';
  END IF;
  IF v_origem_snapshot <> 'REGRA_MARGEM' THEN
    RAISE EXCEPTION 'GATE21A_FIXTURE_NAO_USOU_REGRA_MARGEM origem=%', v_origem_snapshot;
  END IF;

  -- Custo sobe (ainda abaixo do preço de venda): a margem cai de ~57% para
  -- ~11%. Se fosse recalculada agora, sairia da faixa 50-100 da regra e
  -- cairia no fallback global.
  UPDATE public.produtos SET preco_custo = round(v_preco * 0.89, 2) WHERE id = v_prod;

  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_oper, 'g21a-' || v_oper::text, v_v, 'DEVOLUCAO', 'devolucao apos custo mudar',
    round(v_preco * 4, 2), round(v_preco * 4, 2), 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_oper, v_item, v_prod, 4, v_preco, round(v_preco * 4, 2));
  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT COALESCE(SUM(valor), 0) INTO v_aj FROM public.comissoes_ajustes WHERE venda_id = v_v;
  v_esperado := round(v_com * 0.4, 2);
  IF v_aj <> v_esperado THEN
    RAISE EXCEPTION 'GATE21A_CUSTO_VAZOU ajuste=% esperado=% (comissao original=%)', v_aj, v_esperado, v_com;
  END IF;

  UPDATE public.produtos SET preco_custo = v_custo_original WHERE id = v_prod;

  -- ---------------------------------------------------------------- 21b: percentual da regra
  v_v := gen_random_uuid(); v_item := gen_random_uuid(); v_oper := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_op, 'DINHEIRO',
    round(v_preco * 10, 2), 0, round(v_preco * 10, 2),
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  SELECT valor_comissao INTO v_com FROM public.comissoes_vendedores WHERE venda_id = v_v;
  IF COALESCE(v_com, 0) <= 0 THEN RAISE EXCEPTION 'GATE21B_SEM_COMISSAO_ORIGINAL'; END IF;

  -- A MESMA regra (mesmo id) muda de percentual depois da venda.
  UPDATE public.comissoes_regras_funcionario SET percentual = 25 WHERE id = v_regra;

  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_oper, 'g21b-' || v_oper::text, v_v, 'DEVOLUCAO', 'devolucao apos regra mudar',
    round(v_preco * 4, 2), round(v_preco * 4, 2), 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_oper, v_item, v_prod, 4, v_preco, round(v_preco * 4, 2));
  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT COALESCE(SUM(valor), 0) INTO v_aj FROM public.comissoes_ajustes WHERE venda_id = v_v;
  v_esperado := round(v_com * 0.4, 2);
  IF v_aj <> v_esperado THEN
    RAISE EXCEPTION 'GATE21B_REGRA_VAZOU ajuste=% esperado=% (comissao original=%)', v_aj, v_esperado, v_com;
  END IF;

  UPDATE public.comissoes_regras_funcionario SET percentual = 5 WHERE id = v_regra;

  -- ---------------------------------------------------------------- 21c: percentual global
  -- Desvincula o funcionário para cair no fallback global nesta venda.
  UPDATE public.usuarios SET funcionario_id = NULL WHERE id = v_op;
  INSERT INTO public.configuracoes_gerais(chave, valor, tipo_dado)
  VALUES ('comissao_padrao_percentual', '5', 'percent')
  ON CONFLICT (chave) DO UPDATE SET valor = '5';

  v_v := gen_random_uuid(); v_item := gen_random_uuid(); v_oper := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_op, 'DINHEIRO',
    round(v_preco * 10, 2), 0, round(v_preco * 10, 2),
    jsonb_build_array(jsonb_build_object('item_id', v_item, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  SELECT valor_comissao INTO v_com FROM public.comissoes_vendedores WHERE venda_id = v_v;
  IF COALESCE(v_com, 0) <= 0 THEN RAISE EXCEPTION 'GATE21C_SEM_COMISSAO_ORIGINAL'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.comissoes_itens WHERE venda_id = v_v AND origem_regra = 'GLOBAL'
  ) THEN
    RAISE EXCEPTION 'GATE21C_FIXTURE_NAO_USOU_FALLBACK_GLOBAL';
  END IF;

  UPDATE public.configuracoes_gerais SET valor = '10' WHERE chave = 'comissao_padrao_percentual';

  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_oper, 'g21c-' || v_oper::text, v_v, 'DEVOLUCAO', 'devolucao apos config global mudar',
    round(v_preco * 4, 2), round(v_preco * 4, 2), 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_oper, v_item, v_prod, 4, v_preco, round(v_preco * 4, 2));
  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT COALESCE(SUM(valor), 0) INTO v_aj FROM public.comissoes_ajustes WHERE venda_id = v_v;
  v_esperado := round(v_com * 0.4, 2);
  IF v_aj <> v_esperado THEN
    RAISE EXCEPTION 'GATE21C_CONFIG_GLOBAL_VAZOU ajuste=% esperado=% (comissao original=%)', v_aj, v_esperado, v_com;
  END IF;

  UPDATE public.configuracoes_gerais SET valor = '5' WHERE chave = 'comissao_padrao_percentual';
  UPDATE public.usuarios SET funcionario_id = v_func WHERE id = v_op;

  -- ---------------------------------------------------------------- integridade do snapshot
  -- Toda linha de comissoes_itens tem um comissoes_vendedores correspondente,
  -- e a soma dos itens bate com o cabeçalho para todas as vendas deste gate.
  IF EXISTS (
    SELECT 1 FROM public.comissoes_itens ci
    WHERE NOT EXISTS (SELECT 1 FROM public.comissoes_vendedores cv WHERE cv.id = ci.comissao_id)
  ) THEN
    RAISE EXCEPTION 'GATE21_ITEM_ORFAO';
  END IF;
  IF EXISTS (
    SELECT cv.id FROM public.comissoes_vendedores cv
    JOIN public.comissoes_itens ci ON ci.comissao_id = cv.id
    GROUP BY cv.id, cv.valor_comissao
    HAVING cv.valor_comissao <> SUM(ci.valor_comissao)
  ) THEN
    RAISE EXCEPTION 'GATE21_CABECALHO_DIVERGE_DO_SNAPSHOT';
  END IF;

  -- desfaz o vínculo entre funcionário e usuário para não vazar nos gates seguintes
  UPDATE public.usuarios SET funcionario_id = NULL WHERE id = v_op;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 22 — DB-05D: cancelamento não depende da ordem acidental entre a
-- apuração da comissão original e o próprio cancelamento.
-- Regressão DB05-F3, falsificada empiricamente antes da correção:
--   Ordem A (venda -> comissão automática -> cancelamento):
--     comissões=1 (R$4,50), ajustes=1 (R$4,50), líquido 0.
--   Ordem B (venda -> [apuração original ainda não rodou] -> cancelamento
--            -> processamento atrasado):
--     comissões=0, ajustes=0 -- o fato desaparecia por inteiro, sem
--     pendência, fila ou reconciliação que o restaurasse.
-- Usa PIX (forma não física) nos dois ramos para não interferir no GATE 8.
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_loja uuid := current_setting('t.loja')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_op uuid := current_setting('t.operador')::uuid;
  v_ger uuid := current_setting('t.gerente')::uuid;
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  v_va uuid := gen_random_uuid(); v_ia uuid := gen_random_uuid();
  v_vb uuid := gen_random_uuid(); v_ib uuid := gen_random_uuid();
  v_vc uuid := gen_random_uuid(); v_ic uuid := gen_random_uuid();
  v_vd uuid := gen_random_uuid();
  v_com_a numeric; v_aj_a numeric; v_n_com_a integer; v_n_aj_a integer;
  v_com_b numeric; v_aj_b numeric; v_n_com_b integer; v_n_aj_b integer;
  v_n integer; v_ok boolean;
BEGIN
  INSERT INTO public.configuracoes_gerais(chave, valor, tipo_dado)
  VALUES ('comissao_padrao_percentual', '5', 'percent')
  ON CONFLICT (chave) DO UPDATE SET valor = '5';

  -- ---------------------------------------------------------- Ordem A
  -- venda -> comissão (criada automaticamente pelo gatilho de itens,
  -- "cancelamento depois do snapshot") -> cancelamento
  PERFORM public.registrar_venda_com_itens(v_va, v_caixa, v_op, 'PIX',
    v_preco, 0, v_preco,
    jsonb_build_array(jsonb_build_object('item_id', v_ia, 'produto_id', v_prod,
      'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);

  SELECT count(*) INTO v_n FROM public.comissoes_vendedores WHERE venda_id = v_va;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE22A_COMISSAO_NAO_NASCEU_AUTOMATICAMENTE'; END IF;

  PERFORM public.cancelar_venda_transacional(v_va, 'gate22 ordem A', v_ger);

  SELECT count(*), COALESCE(SUM(valor_comissao),0) INTO v_n_com_a, v_com_a
    FROM public.comissoes_vendedores WHERE venda_id = v_va;
  SELECT count(*), COALESCE(SUM(valor),0) INTO v_n_aj_a, v_aj_a
    FROM public.comissoes_ajustes WHERE venda_id = v_va;
  IF v_n_com_a <> 1 OR v_n_aj_a <> 1 OR v_com_a <> v_aj_a THEN
    RAISE EXCEPTION 'GATE22A_ESTADO_INESPERADO comissoes=% (%) ajustes=% (%)',
      v_n_com_a, v_com_a, v_n_aj_a, v_aj_a;
  END IF;
  -- o fato original nunca é alterado, mesmo depois do cancelamento
  IF (SELECT valor_comissao FROM public.comissoes_vendedores WHERE venda_id = v_va) <> v_com_a THEN
    RAISE EXCEPTION 'GATE22A_FATO_ORIGINAL_ALTERADO';
  END IF;
  -- nenhuma comissão positiva residual: líquido zero
  IF (SELECT valor_liquido FROM public.comissoes_vendedores_liquidas WHERE venda_id = v_va) <> 0 THEN
    RAISE EXCEPTION 'GATE22A_RESIDUAL_APOS_CANCELAMENTO';
  END IF;

  -- retry do cancelamento (segunda tentativa oficial) é rejeitado, e um
  -- retry direto do ajuste não duplica
  v_ok := false;
  BEGIN
    PERFORM public.cancelar_venda_transacional(v_va, 'gate22 ordem A retry', v_ger);
  EXCEPTION WHEN OTHERS THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE22A_RECANCELAMENTO_ACEITO'; END IF;
  PERFORM public.processar_ajuste_comissao_venda(v_va, 'CANCELAMENTO', v_va);
  SELECT count(*) INTO v_n FROM public.comissoes_ajustes WHERE venda_id = v_va;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE22A_RETRY_AJUSTE_DUPLICOU n=%', v_n; END IF;

  -- ---------------------------------------------------------- Ordem B
  -- venda -> [apuração original ainda NÃO aconteceu: gatilho de itens
  -- desabilitado para simular "cancelamento antes do snapshot" -- a mesma
  -- janela em que uma falha silenciosa de cálculo ou loja/operador
  -- irresolúvel deixaria a venda CONCLUIDA sem comissão] -> cancelamento
  -- -> processamento atrasado (retry manual, simulando reconciliação)
  ALTER TABLE public.itens_venda DISABLE TRIGGER trg_itens_venda_comissao;

  INSERT INTO public.vendas(id, caixa_id, operador_id, total_bruto, total_desconto,
    total_liquido, forma_pagamento, status)
  VALUES (v_vb, v_caixa, v_op, v_preco, 0, v_preco, 'PIX', 'CONCLUIDA');
  INSERT INTO public.itens_venda(id, venda_id, produto_id, quantidade,
    preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco)
  VALUES (v_ib, v_vb, v_prod, 1, v_preco, v_preco, 0, 'VAREJO');

  ALTER TABLE public.itens_venda ENABLE TRIGGER trg_itens_venda_comissao;

  SELECT count(*) INTO v_n FROM public.comissoes_vendedores WHERE venda_id = v_vb;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GATE22B_FIXTURE_INVALIDA_COMISSAO_JA_EXISTIA'; END IF;

  -- cancelamento ANTES de qualquer apuração original existir
  PERFORM public.cancelar_venda_transacional(v_vb, 'gate22 ordem B', v_ger);

  -- processamento atrasado: o cancelamento já deve ter fechado o fato; esta
  -- chamada tem de ser um no-op (o guard de status='CONCLUIDA' bloqueia)
  PERFORM public.processar_comissao_venda(v_vb);
  -- segundo processamento atrasado, para provar que não há efeito cumulativo
  PERFORM public.processar_comissao_venda(v_vb);

  SELECT count(*), COALESCE(SUM(valor_comissao),0) INTO v_n_com_b, v_com_b
    FROM public.comissoes_vendedores WHERE venda_id = v_vb;
  SELECT count(*), COALESCE(SUM(valor),0) INTO v_n_aj_b, v_aj_b
    FROM public.comissoes_ajustes WHERE venda_id = v_vb;

  -- Ordem A e Ordem B convergem: mesma contagem, mesmo valor, mesma trilha
  IF v_n_com_a <> v_n_com_b OR v_com_a <> v_com_b OR v_n_aj_a <> v_n_aj_b OR v_aj_a <> v_aj_b THEN
    RAISE EXCEPTION 'GATE22B_ORDEM_DIVERGE_DA_ORDEM_A comA=%(%) comB=%(%) ajA=%(%) ajB=%(%)',
      v_n_com_a, v_com_a, v_n_com_b, v_com_b, v_n_aj_a, v_aj_a, v_n_aj_b, v_aj_b;
  END IF;
  IF (SELECT valor_liquido FROM public.comissoes_vendedores_liquidas WHERE venda_id = v_vb) <> 0 THEN
    RAISE EXCEPTION 'GATE22B_RESIDUAL_APOS_CANCELAMENTO';
  END IF;
  -- trilha de auditoria: ajuste aponta para a venda como origem do cancelamento
  IF NOT EXISTS (
    SELECT 1 FROM public.comissoes_ajustes a
    WHERE a.venda_id = v_vb AND a.tipo = 'CANCELAMENTO' AND a.origem_id = v_vb
      AND a.idempotency_key = 'CANCELAMENTO:' || v_vb::text
  ) THEN
    RAISE EXCEPTION 'GATE22B_TRILHA_DE_AUDITORIA_INCOMPLETA';
  END IF;

  -- segundo processamento direto de internal.apurar_comissao_original não duplica nada
  PERFORM internal.apurar_comissao_original(v_vb);
  SELECT count(*) INTO v_n FROM public.comissoes_itens WHERE venda_id = v_vb;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE22B_SEGUNDO_PROCESSAMENTO_DUPLICOU_ITEM n=%', v_n; END IF;

  -- ---------------------------------------------------------- venda já cancelada, nunca elegível
  -- Regressão a NÃO reintroduzir: GATE 15 prova que uma venda que nasce
  -- CANCELADA (nunca foi CONCLUIDA) não gera comissão. Este gatilho de
  -- cancelamento é AFTER UPDATE, então nunca dispara para este INSERT --
  -- e um processamento atrasado direto também deve continuar bloqueado.
  v_vc := gen_random_uuid();
  INSERT INTO public.vendas(id, caixa_id, operador_id, total_bruto, total_desconto,
    total_liquido, forma_pagamento, status)
  VALUES (v_vc, v_caixa, v_op, v_preco, 0, v_preco, 'PIX', 'CANCELADA');
  INSERT INTO public.itens_venda(id, venda_id, produto_id, quantidade,
    preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco)
  VALUES (v_ic, v_vc, v_prod, 1, v_preco, v_preco, 0, 'VAREJO');

  PERFORM public.processar_comissao_venda(v_vc);
  SELECT count(*) INTO v_n FROM public.comissoes_vendedores WHERE venda_id = v_vc;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GATE22C_VENDA_NASCIDA_CANCELADA_GEROU_COMISSAO'; END IF;
  SELECT count(*) INTO v_n FROM public.comissoes_ajustes WHERE venda_id = v_vc;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GATE22C_VENDA_NASCIDA_CANCELADA_GEROU_AJUSTE'; END IF;

  -- ---------------------------------------------------------- venda sem comissão elegível
  -- venda CONCLUIDA, operador válido, mas SEM nenhum item: nada para
  -- congelar. Cancelamento não pode gerar comissão nem ajuste, e não pode
  -- lançar erro.
  v_vd := gen_random_uuid();
  INSERT INTO public.vendas(id, caixa_id, operador_id, total_bruto, total_desconto,
    total_liquido, forma_pagamento, status)
  VALUES (v_vd, v_caixa, v_op, v_preco, 0, v_preco, 'PIX', 'CONCLUIDA');

  PERFORM public.cancelar_venda_transacional(v_vd, 'gate22 sem itens', v_ger);
  SELECT count(*) INTO v_n FROM public.comissoes_vendedores WHERE venda_id = v_vd;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GATE22D_VENDA_SEM_ITENS_GEROU_COMISSAO'; END IF;
  SELECT count(*) INTO v_n FROM public.comissoes_ajustes WHERE venda_id = v_vd;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GATE22D_VENDA_SEM_ITENS_GEROU_AJUSTE'; END IF;
END $g$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GATE 23 — DB-05E: ledger imutável e auditoria completa.
-- Regressões cobertas:
--   DB05-F6: `ON DELETE CASCADE` em comissoes_ajustes (comissao_id, venda_id)
--     apagava o ledger junto com o fato pai. Confirmado empiricamente antes
--     da correção: 1 ajuste -> 0 ajustes depois de DELETE FROM
--     comissoes_vendedores. Nenhuma proteção estrutural contra UPDATE/DELETE.
--   DB05-F7: operação pós-venda tipo='TROCA' gerava ajuste tipo='DEVOLUCAO'
--     (trg_comissao_pos_venda ignorava venda_pos_venda_operacoes.tipo).
--   DB05-F8: trg_comissao_cancelamento / trg_comissao_apos_itens /
--     fn_registrar_comissao tinham ACL padrão ou GRANT explícito sem
--     nenhum caller legítimo (funções RETURNS trigger).
-- ═══════════════════════════════════════════════════════════════════════════
DO $g$
DECLARE
  v_loja uuid := current_setting('t.loja')::uuid;
  v_prod uuid := current_setting('t.produto')::uuid;
  v_op uuid := current_setting('t.operador')::uuid;
  v_ger uuid := current_setting('t.gerente')::uuid;
  v_dono uuid := current_setting('t.dono')::uuid;
  v_caixa uuid := current_setting('t.caixa')::uuid;
  v_preco numeric := current_setting('t.preco')::numeric;
  v_v uuid; v_i uuid; v_com uuid; v_oper uuid;
  v_v2 uuid; v_i2 uuid; v_c2 uuid;
  v_n integer; v_ok boolean; v_tipo text; v_ator uuid; v_origem_id uuid;
  v_valor numeric; v_consumido numeric; v_pendente numeric;
  v_com_orig numeric; v_ajustado numeric; v_compensado numeric; v_pago numeric; v_saldo numeric;
BEGIN
  INSERT INTO public.configuracoes_gerais(chave, valor, tipo_dado)
  VALUES ('comissao_padrao_percentual', '5', 'percent')
  ON CONFLICT (chave) DO UPDATE SET valor = '5';

  -- ---------------------------------------------------------- 1: DELETE de comissão com ajustes
  v_v := gen_random_uuid(); v_i := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_op, 'PIX',
    v_preco, 0, v_preco,
    jsonb_build_array(jsonb_build_object('item_id', v_i, 'produto_id', v_prod,
      'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  SELECT id INTO v_com FROM public.comissoes_vendedores WHERE venda_id = v_v;
  PERFORM public.cancelar_venda_transacional(v_v, 'gate23 delete comissao', v_ger);
  IF (SELECT count(*) FROM public.comissoes_ajustes WHERE comissao_id = v_com) <> 1 THEN
    RAISE EXCEPTION 'GATE23_FIXTURE_SEM_AJUSTE_1';
  END IF;

  -- Remove o snapshot por item (comissoes_itens, DB-05C) para isolar
  -- especificamente o FK comissoes_ajustes.comissao_id -- simula uma
  -- comissao sem snapshot e prova que o próprio ledger de ajustes bloqueia,
  -- não apenas uma proteção incidental de outra tabela.
  DELETE FROM public.comissoes_itens WHERE comissao_id = v_com;

  v_ok := false;
  BEGIN
    DELETE FROM public.comissoes_vendedores WHERE id = v_com;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%comissoes_ajustes%' THEN v_ok := true; ELSE RAISE; END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE23_1_DELETE_COMISSAO_COM_AJUSTES_ACEITO'; END IF;
  IF (SELECT count(*) FROM public.comissoes_ajustes WHERE comissao_id = v_com) <> 1 THEN
    RAISE EXCEPTION 'GATE23_1_LEDGER_ALTERADO_APOS_TENTATIVA';
  END IF;

  -- ---------------------------------------------------------- 2: DELETE de venda com ajustes
  -- Remove toda proteção NÃO relacionada a comissão (itens_venda, kardex,
  -- devoluções, auditoria de cancelamento) para isolar especificamente o FK
  -- comissoes_ajustes.venda_id. comissoes_itens já foi removido acima.
  DELETE FROM public.itens_venda WHERE venda_id = v_v;

  -- movimentos_estoque_log é append-only desde
  -- 20260903190000_kardex_estoque_log_imutavel.sql (PR-1B) — o trigger de
  -- linha bloqueia este DELETE mesmo rodando como owner. Desabilita só ao
  -- redor desta limpeza pontual do fixture (nunca persiste: toda a suíte
  -- roda dentro de BEGIN...ROLLBACK) e reabilita logo em seguida, para não
  -- deixar nenhuma janela maior que o necessário.
  ALTER TABLE public.movimentos_estoque_log DISABLE TRIGGER trg_movimentos_estoque_log_bloqueia_mutacao;
  DELETE FROM public.movimentos_estoque_log WHERE venda_id = v_v;
  ALTER TABLE public.movimentos_estoque_log ENABLE TRIGGER trg_movimentos_estoque_log_bloqueia_mutacao;

  DELETE FROM public.devolucoes WHERE venda_id = v_v;
  DELETE FROM public.vendas_canceladas_auditoria WHERE venda_id = v_v;
  DELETE FROM public.estoque_reposicoes_cancelamento WHERE venda_id = v_v;
  DELETE FROM public.estoque_baixas WHERE venda_id = v_v;

  v_ok := false;
  BEGIN
    DELETE FROM public.vendas WHERE id = v_v;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%comissoes%' THEN v_ok := true; ELSE RAISE; END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE23_2_DELETE_VENDA_COM_AJUSTES_ACEITO'; END IF;
  IF (SELECT count(*) FROM public.comissoes_ajustes WHERE venda_id = v_v) <> 1 THEN
    RAISE EXCEPTION 'GATE23_2_LEDGER_ALTERADO_APOS_TENTATIVA';
  END IF;

  -- ---------------------------------------------------------- 3: UPDATE em ajuste existente
  v_ok := false;
  BEGIN
    UPDATE public.comissoes_ajustes SET valor = 999.99 WHERE comissao_id = v_com;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'COMISSOES_AJUSTES_IMUTAVEL' THEN v_ok := true; ELSE RAISE; END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'GATE23_3_UPDATE_AJUSTE_ACEITO'; END IF;

  -- ---------------------------------------------------------- 4/7: cancelamento -- tipo e origem
  SELECT tipo, origem_id INTO v_tipo, v_origem_id FROM public.comissoes_ajustes WHERE comissao_id = v_com;
  IF v_tipo <> 'CANCELAMENTO' THEN RAISE EXCEPTION 'GATE23_4_TIPO_CANCELAMENTO_INCORRETO tipo=%', v_tipo; END IF;
  IF (SELECT origem_id FROM public.comissoes_ajustes WHERE comissao_id = v_com) <> v_v THEN
    RAISE EXCEPTION 'GATE23_7_ORIGEM_CANCELAMENTO_INCORRETA';
  END IF;
  -- ator do cancelamento é reconstruível por JOIN, sem coluna nova
  SELECT ator_id INTO v_ator FROM public.comissoes_ajustes_auditoria WHERE ajuste_id =
    (SELECT id FROM public.comissoes_ajustes WHERE comissao_id = v_com);
  IF v_ator <> v_ger THEN RAISE EXCEPTION 'GATE23_ATOR_CANCELAMENTO_INCORRETO ator=% esperado=%', v_ator, v_ger; END IF;

  -- ---------------------------------------------------------- 5: devolução -- tipo e origem
  v_v2 := gen_random_uuid(); v_i2 := gen_random_uuid(); v_oper := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v2, v_caixa, v_op, 'PIX',
    v_preco, 0, v_preco,
    jsonb_build_array(jsonb_build_object('item_id', v_i2, 'produto_id', v_prod,
      'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_oper, 'gate23-dev-' || v_oper::text, v_v2, 'DEVOLUCAO', 'gate23 devolucao tipo',
    v_preco, v_preco, 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_oper, v_i2, v_prod, 1, v_preco, v_preco);
  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT tipo, origem_id INTO v_tipo, v_origem_id FROM public.comissoes_ajustes WHERE venda_id = v_v2;
  IF v_tipo <> 'DEVOLUCAO' THEN RAISE EXCEPTION 'GATE23_5_TIPO_DEVOLUCAO_INCORRETO tipo=%', v_tipo; END IF;
  IF (SELECT origem_id FROM public.comissoes_ajustes WHERE venda_id = v_v2) <> v_oper THEN
    RAISE EXCEPTION 'GATE23_7_ORIGEM_DEVOLUCAO_INCORRETA';
  END IF;
  SELECT ator_id INTO v_ator FROM public.comissoes_ajustes_auditoria WHERE venda_id = v_v2;
  IF v_ator <> v_op THEN RAISE EXCEPTION 'GATE23_ATOR_DEVOLUCAO_INCORRETO ator=% esperado=%', v_ator, v_op; END IF;

  -- ---------------------------------------------------------- 6: troca -- tipo e origem
  -- Regressão DB05-F7: antes desta correção, este ajuste nascia com
  -- tipo='DEVOLUCAO', apagando a distinção com a devolução comum.
  v_v2 := gen_random_uuid(); v_i2 := gen_random_uuid(); v_oper := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v2, v_caixa, v_op, 'PIX',
    v_preco, 0, v_preco,
    jsonb_build_array(jsonb_build_object('item_id', v_i2, 'produto_id', v_prod,
      'quantidade', 1, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_oper, 'gate23-troca-' || v_oper::text, v_v2, 'TROCA', 'gate23 troca tipo',
    v_preco, v_preco, 'DINHEIRO', v_op, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_oper, v_i2, v_prod, 1, v_preco, v_preco);
  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT tipo INTO v_tipo FROM public.comissoes_ajustes WHERE venda_id = v_v2;
  IF v_tipo <> 'TROCA' THEN RAISE EXCEPTION 'GATE23_6_TIPO_TROCA_INCORRETO tipo=%', v_tipo; END IF;
  IF (SELECT origem_id FROM public.comissoes_ajustes WHERE venda_id = v_v2) <> v_oper THEN
    RAISE EXCEPTION 'GATE23_7_ORIGEM_TROCA_INCORRETA';
  END IF;
  IF (SELECT origem_tipo FROM public.comissoes_ajustes_auditoria WHERE venda_id = v_v2) <> 'OPERACAO_POS_VENDA' THEN
    RAISE EXCEPTION 'GATE23_ORIGEM_TIPO_TROCA_INCORRETA';
  END IF;

  -- retry do mesmo fato de troca não duplica
  PERFORM public.processar_ajuste_comissao_venda(v_v2, 'TROCA', v_oper);
  SELECT count(*) INTO v_n FROM public.comissoes_ajustes WHERE venda_id = v_v2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GATE23_10_RETRY_TROCA_DUPLICOU n=%', v_n; END IF;

  -- ---------------------------------------------------------- 8/9: compensação, pagamento e reconstrução completa
  -- Mesmo formato do gate econômico crítico (comissão paga, devolução
  -- posterior, nova comissão, próximo pagamento tem de compensar): comissão
  -- original = 5% de 10 unidades ao preço canônico da loja, devolução de 4
  -- unidades (40%) gera o ajuste, nova venda idêntica gera a segunda
  -- comissão, e o segundo pagamento tem de compensar o ajuste da primeira.
  v_v := gen_random_uuid(); v_i := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v, v_caixa, v_dono, 'PIX',
    round(v_preco * 10, 2), 0, round(v_preco * 10, 2),
    jsonb_build_array(jsonb_build_object('item_id', v_i, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  SELECT id, valor_comissao INTO v_com, v_com_orig FROM public.comissoes_vendedores WHERE venda_id = v_v;

  PERFORM set_config('request.jwt.claim.sub', v_ger::text, true);
  PERFORM public.liquidar_comissoes(v_loja, v_dono, ARRAY[v_com], 'gate23-lote1-' || v_v::text);

  v_oper := gen_random_uuid();
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.venda_pos_venda_operacoes(id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id)
  VALUES (v_oper, 'gate23-89-dev-' || v_oper::text, v_v, 'DEVOLUCAO', 'gate23 devolucao pos pagamento',
    round(v_preco * 4, 2), round(v_preco * 4, 2), 'DINHEIRO', v_dono, v_caixa);
  INSERT INTO public.venda_pos_venda_itens(operacao_id, item_venda_id, produto_id,
    quantidade, preco_unitario, subtotal)
  VALUES (v_oper, v_i, v_prod, 4, v_preco, round(v_preco * 4, 2));
  SET CONSTRAINTS ALL IMMEDIATE;

  v_v2 := gen_random_uuid(); v_i2 := gen_random_uuid();
  PERFORM public.registrar_venda_com_itens(v_v2, v_caixa, v_dono, 'PIX',
    round(v_preco * 10, 2), 0, round(v_preco * 10, 2),
    jsonb_build_array(jsonb_build_object('item_id', v_i2, 'produto_id', v_prod,
      'quantidade', 10, 'preco_original', v_preco, 'preco_unitario', v_preco)), NULL, NULL, NULL);
  SELECT id INTO v_c2 FROM public.comissoes_vendedores WHERE venda_id = v_v2;

  PERFORM public.liquidar_comissoes(v_loja, v_dono, ARRAY[v_c2], 'gate23-lote2-' || v_v2::text);

  -- por ajuste: quanto foi consumido e quanto resta
  SELECT valor, valor_consumido, valor_pendente INTO v_valor, v_consumido, v_pendente
  FROM public.comissoes_ajustes_auditoria WHERE venda_id = v_v;
  IF v_consumido <> v_valor OR v_pendente <> 0 THEN
    RAISE EXCEPTION 'GATE23_8_CONSUMO_POR_AJUSTE_INCORRETO valor=% consumido=% pendente=%',
      v_valor, v_consumido, v_pendente;
  END IF;

  -- por comissão original: reconstrução completa em uma única leitura
  SELECT valor_original, valor_ajustado, valor_compensado, valor_pago, saldo_final
  INTO v_com_orig, v_ajustado, v_compensado, v_pago, v_saldo
  FROM public.comissoes_reconstrucao_auditoria WHERE comissao_id = v_com;
  IF v_ajustado <> round(v_com_orig * 0.4, 2)
     OR v_compensado <> v_ajustado
     OR v_pago <> v_com_orig THEN
    RAISE EXCEPTION 'GATE23_9_RECONSTRUCAO_INCORRETA original=% ajustado=% compensado=% pago=%',
      v_com_orig, v_ajustado, v_compensado, v_pago;
  END IF;

  SELECT saldo_final INTO v_saldo FROM public.comissoes_reconstrucao_auditoria WHERE comissao_id = v_c2;
  IF v_saldo <> 0 THEN RAISE EXCEPTION 'GATE23_9_SALDO_FINAL_INCORRETO saldo=%', v_saldo; END IF;

  -- ---------------------------------------------------------- 10: retry do pagamento não cria novo fato
  PERFORM public.liquidar_comissoes(v_loja, v_dono, ARRAY[v_c2], 'gate23-lote2-' || v_v2::text);
  IF (SELECT count(*) FROM public.comissoes_pagamentos WHERE idempotency_key = 'gate23-lote2-' || v_v2::text) <> 1 THEN
    RAISE EXCEPTION 'GATE23_10_RETRY_PAGAMENTO_DUPLICOU';
  END IF;

  -- ---------------------------------------------------------- ACL: sem caller legítimo
  FOREACH v_tipo IN ARRAY ARRAY['trg_comissao_cancelamento', 'trg_comissao_apos_itens', 'fn_registrar_comissao'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_tipo
        AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
             OR has_function_privilege('anon', p.oid, 'EXECUTE'))
    ) THEN
      RAISE EXCEPTION 'GATE23_ACL_TRIGGER_EXPOSTO: % executavel por authenticated/anon', v_tipo;
    END IF;
  END LOOP;
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
