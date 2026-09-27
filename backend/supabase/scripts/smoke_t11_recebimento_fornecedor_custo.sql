-- Smoke test da migration 20260927150000_t11_recebimento_fornecedor_custo_unitario.sql
-- Executar em ambiente DEV/STAGING no SQL Editor (papel com permissão para
-- chamar a RPC como um gerente real, ex. service_role/postgres, OU sessão
-- autenticada de um usuário GERENTE/DONO/ADMIN).
--
-- Pré-requisitos: usuário GERENTE/DONO/ADMIN autenticado (auth.uid() não
-- nulo) com produto ativo e caixa não necessário aqui (recebimento não
-- depende de caixa aberto). Roda dentro de uma transação que nunca comita.
--
-- Cenários (ver relatório T11, auditoria Jinlong 2026-09-27):
--   1) chamada com 4 args (formato legado, sem fornecedor/custo) continua
--      funcionando sem ambiguidade de overload — é o formato que os scripts
--      de smoke/gate pré-existentes (d0-remessa-*.test.sql,
--      fase4-remessa-*.test.sql) usam.
--   2) fornecedor do cadastro + custo unitário: origem_descricao é derivada
--      do nome do fornecedor, produtos.preco_custo vira média ponderada.
--   3) fornecedor de outra loja é rejeitado.
--   4) retry com a mesma idempotency_key mas fornecedor/documento diferente
--      é rejeitado (nunca devolve sucesso silencioso com dado desatualizado).

BEGIN;

DO $$
DECLARE
  v_uid uuid := auth.uid();
  v_loja uuid;
  v_produto uuid := gen_random_uuid();
  v_fornecedor uuid := gen_random_uuid();
  v_fornecedor_outra_loja uuid := gen_random_uuid();
  v_outra_loja uuid := gen_random_uuid();
  v_id uuid;
  v_custo numeric;
  v_saldo numeric;
  v_origem text;
  v_erro text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'SMOKE_T11: auth.uid() nulo. Execute com sessão autenticada de GERENTE/DONO/ADMIN.';
  END IF;

  SELECT u.loja_id INTO v_loja FROM public.usuarios u WHERE u.id = v_uid;
  IF v_loja IS NULL THEN
    RAISE EXCEPTION 'SMOKE_T11: usuário autenticado sem loja_id.';
  END IF;

  INSERT INTO public.produtos (id, loja_id, nome, preco_varejo, preco_custo, unidade_medida, origem, tem_nf, ativo, status_publicacao)
  VALUES (v_produto, v_loja, 'SMOKE T11', 50, 10.00, 'UN', 'china_manual', false, true, 'PUBLICADO');

  -- 1) formato legado (4 args) continua funcionando.
  v_id := public.criar_confirmar_remessa_entrada(
    'Fornecedor em texto livre (legado)', NULL,
    jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade_esperada', 5, 'quantidade_conferida', 5)),
    'smoke-t11-legado'
  );
  SELECT preco_custo INTO v_custo FROM public.produtos WHERE id = v_produto;
  IF v_custo <> 10.00 THEN
    RAISE EXCEPTION 'SMOKE_T11 CASO 1 FALHOU: preco_custo mudou sem custo_unitario informado (%).', v_custo;
  END IF;

  -- 2) fornecedor do cadastro + custo unitário -> média ponderada.
  INSERT INTO public.fornecedores (id, loja_id, nome, cnpj) VALUES (v_fornecedor, v_loja, 'SMOKE T11 Fornecedor', '00000000000191');

  v_id := public.criar_confirmar_remessa_entrada(
    NULL, NULL,
    jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade_esperada', 5, 'quantidade_conferida', 5, 'custo_unitario', 20.00)),
    'smoke-t11-fornecedor',
    v_fornecedor, 'NF-SMOKE-T11'
  );
  SELECT preco_custo, (SELECT quantidade_atual FROM public.estoque WHERE produto_id = v_produto AND loja_id = v_loja)
    INTO v_custo, v_saldo
    FROM public.produtos WHERE id = v_produto;
  IF v_custo <> 15.00 THEN
    RAISE EXCEPTION 'SMOKE_T11 CASO 2 FALHOU: preco_custo = %, esperado 15.00 (media ponderada 5x10 + 5x20 / 10).', v_custo;
  END IF;
  SELECT origem_descricao INTO v_origem FROM public.remessas WHERE id = v_id;
  IF v_origem <> 'SMOKE T11 Fornecedor' THEN
    RAISE EXCEPTION 'SMOKE_T11 CASO 2 FALHOU: origem_descricao = %, esperado nome do fornecedor.', v_origem;
  END IF;

  -- 3) fornecedor de outra loja é rejeitado.
  INSERT INTO public.lojas (id, nome) VALUES (v_outra_loja, 'SMOKE T11 Outra Loja');
  INSERT INTO public.fornecedores (id, loja_id, nome, cnpj) VALUES (v_fornecedor_outra_loja, v_outra_loja, 'Fornecedor Outra Loja', '00000000000272');
  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada(
      NULL, NULL,
      jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade_esperada', 1, 'quantidade_conferida', 1)),
      'smoke-t11-fornecedor-outra-loja',
      v_fornecedor_outra_loja, NULL
    );
    RAISE EXCEPTION 'SMOKE_T11 CASO 3 FALHOU: aceitou fornecedor de outra loja.';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF POSITION('REMESSA_FORNECEDOR_INVALIDO' IN v_erro) = 0 THEN
      RAISE EXCEPTION 'SMOKE_T11 CASO 3 FALHOU: erro inesperado: %', v_erro;
    END IF;
  END;

  -- 4) retry com payload divergente (documento mudou) é rejeitado.
  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada(
      NULL, NULL,
      jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade_esperada', 5, 'quantidade_conferida', 5, 'custo_unitario', 20.00)),
      'smoke-t11-fornecedor',  -- mesma chave do caso 2
      v_fornecedor, 'NF-DIFERENTE'
    );
    RAISE EXCEPTION 'SMOKE_T11 CASO 4 FALHOU: aceitou retry com documento divergente.';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF POSITION('REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE' IN v_erro) = 0 THEN
      RAISE EXCEPTION 'SMOKE_T11 CASO 4 FALHOU: erro inesperado: %', v_erro;
    END IF;
  END;

  RAISE NOTICE 'SMOKE_T11_OK: legado (4 args) funciona; fornecedor+custo atualiza origem e custo médio (%); fornecedor de outra loja e retry divergente rejeitados.', v_custo;
END $$;

ROLLBACK;
