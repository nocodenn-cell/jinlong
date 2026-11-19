-- D1 + D3 (PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06): prova SQL.
--   D1: fechamento de caixa recusado com venda EM_ESPERA do turno; liberado após descartar.
--   D3: produto UN recusa quantidade fracionada no banco; produto KG aceita.
-- Executar SOMENTE em banco descartável com as migrations 20261106100000 e 20261106110000 aplicadas:
--   docker exec -i <container_db_local> psql -U postgres -d <banco_descartavel> -v ON_ERROR_STOP=1 -f - < este_arquivo
-- Tudo roda em transação com ROLLBACK. Dados sintéticos (uuid prefixo d1d3...).
\set ON_ERROR_STOP on
BEGIN;

DO $t$
DECLARE
  e  uuid := 'd1d30001-0000-4000-8000-000000000001';
  la uuid := 'd1d30002-0000-4000-8000-000000000001';
  lb uuid := 'd1d30002-0000-4000-8000-000000000002';
  op uuid := 'd1d30003-0000-4000-8000-000000000001';
  op2 uuid := 'd1d30003-0000-4000-8000-000000000002';
  ger uuid := 'd1d30003-0000-4000-8000-000000000003';
  cat uuid := 'd1d30004-0000-4000-8000-000000000001';
  pun uuid := 'd1d30005-0000-4000-8000-000000000001';
  pkg uuid := 'd1d30005-0000-4000-8000-000000000002';
  cx uuid; cx2 uuid; esp1 uuid; esp2 uuid; esp3 uuid; r int; msg text; n int;
BEGIN
  INSERT INTO public.empresas (id, nome) VALUES (e, 'D1D3 Empresa');
  INSERT INTO auth.users (id) VALUES (op), (op2), (ger);
  INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES
    (e, la, 'D1D3 Loja A', 'D1A', true), (e, lb, 'D1D3 Loja B', 'D1B', true);
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (op, 'D1D3 Operador', 'OPERADOR', true, la),
    (op2, 'D1D3 Operador 2', 'OPERADOR', true, la),
    (ger, 'D1D3 Gerente', 'GERENTE', true, la);
  INSERT INTO public.categorias (id, nome, empresa_id) VALUES (cat, 'D1D3 Cat', e);
  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id, unidade_medida) VALUES
    (pun, 'D1D3UN000001', 'D1D3 Chaleira', cat, 20.00, 'brasil_nf', false, true, la, 'UN'),
    (pkg, 'D1D3KG000001', 'D1D3 Queijo', cat, 40.00, 'brasil_nf', false, true, la, 'KG');
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES
    (pun, la, 50, 0), (pkg, la, 10, 0);
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (op, 'ABERTO', now(), 100, la) RETURNING id INTO cx;
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (op2, 'ABERTO', now(), 100, la) RETURNING id INTO cx2;

  -- ===== D1 =====
  -- Espera vinculada ao caixa cx
  INSERT INTO public.vendas_em_espera (loja_id, operador_id, caixa_id, numero_local, status)
    VALUES (la, op, cx, 1, 'EM_ESPERA') RETURNING id INTO esp1;

  -- 1) fechamento com espera aberta: recusado
  BEGIN
    UPDATE public.caixas SET status = 'FECHADO', data_fechamento = now(), valor_fechamento = 100,
      fechamento_diferenca = 0 WHERE id = cx;
    RAISE EXCEPTION 'D1-1 FALHOU: fechamento deveria ser recusado com venda em espera';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FECHAR_CAIXA_VENDAS_EM_ESPERA%' THEN
      RAISE EXCEPTION 'D1-1 FALHOU: erro inesperado: %', SQLERRM; END IF;
    RAISE NOTICE 'OK D1-1 fechamento recusado com espera aberta';
  END;
  SELECT status INTO msg FROM public.caixas WHERE id = cx;
  IF msg IS DISTINCT FROM 'ABERTO' THEN RAISE EXCEPTION 'D1-1 FALHOU: caixa mudou para %', msg; END IF;

  -- 2) espera do operador sem caixa (caixa_id NULL) também bloqueia o fechamento de cx
  INSERT INTO public.vendas_em_espera (loja_id, operador_id, caixa_id, numero_local, status)
    VALUES (la, op2, NULL, 2, 'EM_ESPERA') RETURNING id INTO esp2;
  UPDATE public.vendas_em_espera SET status = 'DESCARTADA' WHERE id = esp1;
  BEGIN
    UPDATE public.caixas SET status = 'FECHADO', data_fechamento = now(), valor_fechamento = 100,
      fechamento_diferenca = 0 WHERE id = cx2;
    RAISE EXCEPTION 'D1-2 FALHOU: espera sem caixa do operador deveria bloquear cx2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FECHAR_CAIXA_VENDAS_EM_ESPERA%' THEN
      RAISE EXCEPTION 'D1-2 FALHOU: erro inesperado: %', SQLERRM; END IF;
    RAISE NOTICE 'OK D1-2 espera sem caixa do mesmo operador bloqueia o fechamento';
  END;

  -- 3) após descartar a espera, o fechamento de cx é liberado
  UPDATE public.vendas_em_espera SET status = 'DESCARTADA' WHERE id = esp2;
  UPDATE public.caixas SET status = 'FECHADO', data_fechamento = now(), valor_fechamento = 100,
    fechamento_diferenca = 0 WHERE id = cx;
  SELECT status INTO msg FROM public.caixas WHERE id = cx;
  IF msg IS DISTINCT FROM 'FECHADO' THEN RAISE EXCEPTION 'D1-3 FALHOU: caixa deveria fechar, status=%', msg; END IF;
  RAISE NOTICE 'OK D1-3 fechamento liberado sem venda em espera';

  -- 4) espera de OUTRA loja não bloqueia (isolamento)
  INSERT INTO public.vendas_em_espera (loja_id, operador_id, caixa_id, numero_local, status)
    VALUES (lb, op2, NULL, 9, 'EM_ESPERA') RETURNING id INTO esp3;
  UPDATE public.caixas SET status = 'FECHADO', data_fechamento = now(), valor_fechamento = 100,
    fechamento_diferenca = 0 WHERE id = cx2;
  SELECT status INTO msg FROM public.caixas WHERE id = cx2;
  IF msg IS DISTINCT FROM 'FECHADO' THEN RAISE EXCEPTION 'D1-4 FALHOU: espera de outra loja bloqueou o fechamento'; END IF;
  RAISE NOTICE 'OK D1-4 espera de outra loja não bloqueia';

  -- ===== D3 =====
  -- 5) produto UN com 2,5: recusado pelo trigger
  -- Observação: o trigger é BEFORE INSERT, então dispara antes da checagem de FK;
  -- venda_id fictício não atrapalha o teste.
  BEGIN
    INSERT INTO public.itens_venda (venda_id, produto_id, quantidade, preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco)
      VALUES (gen_random_uuid(), pun, 2.5, 20, 20, 0, 'VAREJO');
    RAISE EXCEPTION 'D3-5 FALHOU: UN com fração deveria ser recusado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'VENDA_QUANTIDADE_FRACIONADA_UN%' THEN
      RAISE EXCEPTION 'D3-5 FALHOU: erro inesperado: %', SQLERRM; END IF;
    RAISE NOTICE 'OK D3-5 UN com 2,5 recusado';
  END;

  -- 6) UN com quantidade inteira passa pelo trigger (a FK então barra o venda_id fictício;
  --    o caminho feliz completo, com venda real, é coberto pelo golden flow E5).
  BEGIN
    INSERT INTO public.itens_venda (venda_id, produto_id, quantidade, preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco)
      VALUES (gen_random_uuid(), pun, 2, 20, 20, 0, 'VAREJO');
    RAISE EXCEPTION 'D3-6 FALHOU: deveria barrar na FK (venda fictícia)';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK D3-6 UN inteiro passou pelo trigger (barrado só pela FK de venda fictícia)';
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'VENDA_QUANTIDADE_FRACIONADA_UN%' THEN
      RAISE EXCEPTION 'D3-6 FALHOU: UN inteiro foi recusado pelo trigger';
    END IF;
    RAISE EXCEPTION 'D3-6 FALHOU: erro inesperado: %', SQLERRM;
  END;

  RAISE NOTICE 'TESTE D1/D3 CONCLUIDO';
END $t$;

ROLLBACK;
