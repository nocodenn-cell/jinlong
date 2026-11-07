-- D2 (PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06, P0-9 / D-09; S9b e S12): prova SQL.
--   * Estorno em DINHEIRO de venda de caixa FECHADO sai do caixa ABERTO da loja (saldo do fechado não muda).
--   * Sem caixa aberto, ou com mais de um, o estorno é recusado.
-- Pré-requisito: migration 20261107120000 aplicada em banco descartável.
-- Executar SOMENTE em cópia descartável (nunca produção):
--   docker exec -i <container_db_local> psql -U postgres -d <banco_descartavel> -v ON_ERROR_STOP=1 -f - < este_arquivo
-- Roda em transação com ROLLBACK. Dados sintéticos (uuid prefixo d2d2).
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _d2 (k text PRIMARY KEY, v uuid);

DO $setup$
DECLARE
  e uuid := 'd2d20001-0000-4000-8000-000000000001';
  la uuid := 'd2d20002-0000-4000-8000-000000000001';
  cat uuid := 'd2d20003-0000-4000-8000-000000000001';
  p1 uuid := 'd2d20004-0000-4000-8000-000000000001';
  ger uuid := 'd2d20005-0000-4000-8000-000000000001';
  o1 uuid := 'd2d20005-0000-4000-8000-000000000002';
  o2 uuid := 'd2d20005-0000-4000-8000-000000000003';
  o3 uuid := 'd2d20005-0000-4000-8000-000000000004';
  o4 uuid := 'd2d20005-0000-4000-8000-000000000005';
  cxa uuid; cxb uuid;
BEGIN
  INSERT INTO public.empresas (id, nome) VALUES (e, 'D2 Empresa');
  INSERT INTO auth.users (id) VALUES (ger), (o1), (o2), (o3), (o4);
  INSERT INTO public.lojas (empresa_id, id, nome, codigo, ativo) VALUES (e, la, 'D2 Loja', 'D2L', true);
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (ger, 'D2 Gerente', 'GERENTE', true, la), (o1, 'D2 Op1', 'OPERADOR', true, la),
    (o2, 'D2 Op2', 'OPERADOR', true, la), (o3, 'D2 Op3', 'OPERADOR', true, la), (o4, 'D2 Op4', 'OPERADOR', true, la);
  INSERT INTO public.categorias (id, nome, empresa_id) VALUES (cat, 'D2 Cat', e);
  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id, unidade_medida) VALUES
    (p1, 'D2000000000001', 'D2 Item', cat, 10.00, 'brasil_nf', false, true, la, 'UN');
  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo) VALUES (p1, la, 100, 0);
  INSERT INTO public.formas_pagamento (loja_id, codigo, nome, ativo) VALUES (la, 'DINHEIRO', 'DINHEIRO', true)
    ON CONFLICT (loja_id, codigo) DO UPDATE SET ativo = true;
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (o1, 'ABERTO', now(), 100, la) RETURNING id INTO cxa;
  INSERT INTO _d2 VALUES ('e', e), ('la', la), ('ger', ger), ('o1', o1), ('o2', o2), ('o3', o3), ('o4', o4),
    ('p1', p1), ('cxa', cxa);
END $setup$;

CREATE FUNCTION pg_temp.g(k text) RETURNS uuid LANGUAGE sql AS $f$ SELECT v FROM _d2 WHERE _d2.k = $1 $f$;

-- Venda em DINHEIRO 10,00 no caixa indicado (operador do caixa).
CREATE FUNCTION pg_temp.venda(p_caixa uuid, p_op uuid) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v uuid := gen_random_uuid(); r record; v_jwt_antes text := current_setting('request.jwt.claim.sub', true);
BEGIN
  -- A RPC de venda exige que o operador seja o usuário autenticado.
  PERFORM set_config('request.jwt.claim.sub', p_op::text, true);
  SELECT * INTO r FROM public.finalizar_venda_transacional_canonica_v4(
    p_venda_id => v, p_caixa_id => p_caixa, p_operador_id => p_op, p_loja_id => pg_temp.g('la'),
    p_forma_pagamento => 'DINHEIRO', p_total_bruto => 10, p_total_desconto => 0, p_total_liquido => 10,
    p_pagamentos => jsonb_build_array(jsonb_build_object('forma_pagamento', 'DINHEIRO', 'valor', 10)),
    p_itens => jsonb_build_array(jsonb_build_object('item_id', gen_random_uuid(), 'produto_id', pg_temp.g('p1'),
      'quantidade', 1, 'preco_original', 10, 'preco_unitario', 10, 'tipo_preco', 'VAREJO')));
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_jwt_antes, ''), true);
  IF r.status IS DISTINCT FROM 'CONCLUIDA' THEN RAISE EXCEPTION 'venda de teste não concluída: %', r.status; END IF;
  RETURN v;
END $f$;

CREATE FUNCTION pg_temp.saldo(p_caixa uuid) RETURNS numeric LANGUAGE sql AS $f$
  SELECT saldo_atual FROM public.caixas WHERE id = p_caixa $f$;

CREATE FUNCTION pg_temp.fecha(p_caixa uuid) RETURNS void LANGUAGE sql AS $f$
  UPDATE public.caixas SET status = 'FECHADO', data_fechamento = now(), valor_fechamento = valor_inicial,
    fechamento_diferenca = 0 WHERE id = p_caixa $f$;

DO $t$
DECLARE
  la uuid := pg_temp.g('la'); ger uuid := pg_temp.g('ger');
  cxa uuid := pg_temp.g('cxa'); cxb uuid; cxc uuid; cxd uuid;
  v1 uuid; v2 uuid; sa0 numeric; sb0 numeric; sb1 numeric; did uuid; n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', ger::text, true);

  -- Duas vendas no caixa A (aberto); depois A é fechado.
  v1 := pg_temp.venda(cxa, pg_temp.g('o1'));
  v2 := pg_temp.venda(cxa, pg_temp.g('o1'));
  PERFORM pg_temp.fecha(cxa);
  sa0 := pg_temp.saldo(cxa);

  -- D2-1: caixa B aberto; estorno da venda de A (fechado) sai de B
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (pg_temp.g('o2'), 'ABERTO', now(), 100, la) RETURNING id INTO cxb;
  PERFORM * FROM public.cancelar_venda_transacional(v1, 'teste D2', ger);
  sb1 := pg_temp.saldo(cxb);
  IF pg_temp.saldo(cxa) <> sa0 THEN
    RAISE EXCEPTION 'D2-1 FALHOU: saldo do caixa fechado mudou de % para %', sa0, pg_temp.saldo(cxa); END IF;
  IF sb1 <> 90 THEN RAISE EXCEPTION 'D2-1 FALHOU: caixa aberto deveria ficar 90, ficou %', sb1; END IF;
  SELECT caixa_desembolso_id INTO did FROM public.devolucoes WHERE venda_id = v1;
  IF did IS DISTINCT FROM cxb THEN RAISE EXCEPTION 'D2-1 FALHOU: desembolso não atribuído ao caixa aberto'; END IF;
  RAISE NOTICE 'OK D2-1 estorno de caixa fechado sai do caixa aberto (fechado inalterado, aberto 90)';

  -- D2-2: sem caixa aberto => recusado
  PERFORM pg_temp.fecha(cxb);
  BEGIN
    PERFORM * FROM public.cancelar_venda_transacional(v2, 'teste D2', ger);
    RAISE EXCEPTION 'D2-2 FALHOU: deveria recusar sem caixa aberto';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CANCELAR_VENDA_CAIXA_FECHADO_SEM_CAIXA_ABERTO%' THEN
      RAISE EXCEPTION 'D2-2 FALHOU: erro inesperado: %', SQLERRM; END IF;
    RAISE NOTICE 'OK D2-2 sem caixa aberto recusa o estorno';
  END;

  -- D2-3: dois caixas abertos => recusado (ambíguo)
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (pg_temp.g('o3'), 'ABERTO', now(), 100, la) RETURNING id INTO cxc;
  INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id)
    VALUES (pg_temp.g('o4'), 'ABERTO', now(), 100, la) RETURNING id INTO cxd;
  BEGIN
    PERFORM * FROM public.cancelar_venda_transacional(v2, 'teste D2', ger);
    RAISE EXCEPTION 'D2-3 FALHOU: deveria recusar com dois caixas abertos';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CANCELAR_VENDA_CAIXA_ABERTO_AMBIGUO%' THEN
      RAISE EXCEPTION 'D2-3 FALHOU: erro inesperado: %', SQLERRM; END IF;
    RAISE NOTICE 'OK D2-3 dois caixas abertos recusa o estorno (ambíguo)';
  END;
  IF (SELECT status FROM public.vendas WHERE id = v2) IS DISTINCT FROM 'CONCLUIDA' THEN
    RAISE EXCEPTION 'D2-3 FALHOU: venda recusada não deveria ter sido cancelada'; END IF;

  -- D2-4: após fechar um dos caixas extras, o estorno passa e sai do caixa restante
  PERFORM pg_temp.fecha(cxd);
  PERFORM * FROM public.cancelar_venda_transacional(v2, 'teste D2', ger);
  IF pg_temp.saldo(cxc) <> 90 THEN RAISE EXCEPTION 'D2-4 FALHOU: caixa C deveria ficar 90, ficou %', pg_temp.saldo(cxc); END IF;
  RAISE NOTICE 'OK D2-4 com um caixa aberto restante, o estorno sai dele';

  RAISE NOTICE 'TESTE D2 CONCLUIDO';
END $t$;

ROLLBACK;
