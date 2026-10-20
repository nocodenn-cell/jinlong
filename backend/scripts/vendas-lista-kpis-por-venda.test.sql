-- Regressão da migration 20260930120000_vendas_lista_kpis_por_venda.sql (Onda A — integridade comercial).
--
-- Cenário controlado (loja Matriz, janela 2099-06-10, sem interferência de dados reais):
--   4 vendas distintas: 3 CONCLUIDA (100,00 + 123,90 + 130,00 = 353,90) e 1 CANCELADA (129,90);
--   ledger com 5 eventos (4 SALE_REGISTERED + 1 SALE_CANCELLED) — prova que o ledger NÃO é a identidade da venda;
--   devolução pós-venda MISTA de 50,00 em venda CONCLUIDA (20,00 em meio de pagamento + 30,00 abatidos do saldo a receber;
--   `devolucoes.valor` guarda só os 20,00 — a métrica tem de contar os 50,00 de venda_pos_venda_operacoes.valor_estornado);
--   linha de devolução gerada pelo cancelamento (operacao_id NULL) e devolução pós-venda em venda CANCELADA:
--   ambas FORA da métrica (sem contagem em dobro).
-- Cobre: lista (uma linha por venda, UUID único, status atual), KPIs canônicos, taxa como fração, denominador zero,
-- filtros, paginação, autorização por loja (gerente de outra loja e operador recusados), grants e ledger intacto.
-- Tudo em transação com ROLLBACK. Triggers/FKs desligados só para montar a fixture (session_replication_role).

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL session_replication_role = replica;

DO $onda_a$
DECLARE
  c_loja_a constant uuid := 'a0000001-0000-4000-8000-000000000001';
  c_loja_b constant uuid := 'b0000001-0000-4000-8000-000000000001';
  c_ger_a  constant uuid := '876a77ed-4ae2-4f59-9f05-5162eda24d68'; -- GERENTE loja A
  c_ger_b  constant uuid := 'ea8b0215-1bdf-4c00-a30a-0eaad392bdef'; -- GERENTE loja B
  c_op_b   constant uuid := 'a93c6904-a805-4cee-9a19-17dd612f7321'; -- OPERADOR loja B
  c_prod1  constant uuid := 'd1c0d200-0001-4000-8000-000000000001';
  c_prod2  constant uuid := 'd1c0d200-0002-4000-8000-000000000002';
  v_ini constant timestamptz := '2099-06-10 00:00:00+00';
  v_fim constant timestamptz := '2099-06-10 23:59:59+00';
  v_caixa uuid;
  v1 uuid := gen_random_uuid();
  v2 uuid := gen_random_uuid();
  v3 uuid := gen_random_uuid();
  v4 uuid := gen_random_uuid();
  op_v2 uuid := gen_random_uuid();
  op_v4 uuid := gen_random_uuid();
  k record;
  n int;
  n_ids int;
  n_eventos_antes int;
  v_antigo int;
  p1 uuid[]; p2 uuid[]; p3 uuid[];
BEGIN
  -- Fixture autossuficiente (CI usa banco recém-criado com seed determinístico; nada aqui depende de dados de
  -- desenvolvimento). Tudo dentro da transação com ROLLBACK. Produtos vêm da migration 027.
  INSERT INTO auth.users (id) VALUES (c_ger_a), (c_ger_b), (c_op_b) ON CONFLICT DO NOTHING;
  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (c_loja_a, 'Onda A Loja A', 'ONDAA-A', true),
    (c_loja_b, 'Onda A Loja B', 'ONDAA-B', true)
  ON CONFLICT DO NOTHING;
  -- multiempresa: com triggers desligados (replica) a loja nasce sem empresa; em produção toda loja
  -- tem empresa (fase 1). Loja sem empresa é recusada pelo envelope (fail closed).
  IF to_regclass('public.empresas') IS NOT NULL THEN
    EXECUTE 'UPDATE public.lojas SET empresa_id = (SELECT id FROM public.empresas ORDER BY created_at, id LIMIT 1)
              WHERE id = ANY ($1) AND empresa_id IS NULL' USING ARRAY[c_loja_a, c_loja_b];
  END IF;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    (c_ger_a, 'Onda A Gerente A', 'GERENTE',  true, c_loja_a),
    (c_ger_b, 'Onda A Gerente B', 'GERENTE',  true, c_loja_b),
    (c_op_b,  'Onda A Operador B', 'OPERADOR', true, c_loja_b)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  SELECT c.id INTO v_caixa FROM public.caixas c WHERE c.loja_id = c_loja_a LIMIT 1;
  IF v_caixa IS NULL THEN
    v_caixa := gen_random_uuid();
    INSERT INTO public.caixas (id, operador_id, loja_id, status, valor_inicial) VALUES (v_caixa, c_ger_a, c_loja_a, 'ABERTO', 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id IN (c_prod1, c_prod2) HAVING count(*) = 2) THEN
    RAISE EXCEPTION 'onda-a: fixture sem os 2 produtos de seed';
  END IF;

  -- ── fixture ───────────────────────────────────────────────────────────────────────────────────
  INSERT INTO public.vendas (id, caixa_id, operador_id, data, total_bruto, total_liquido, forma_pagamento, status) VALUES
    (v1, v_caixa, c_ger_a, '2099-06-10 10:00:00+00', 100.00, 100.00, 'PIX',      'CONCLUIDA'),
    (v2, v_caixa, c_ger_a, '2099-06-10 11:00:00+00', 123.90, 123.90, 'DINHEIRO', 'CONCLUIDA'),
    (v3, v_caixa, c_ger_a, '2099-06-10 12:00:00+00', 130.00, 130.00, 'PIX',      'CONCLUIDA'),
    (v4, v_caixa, c_ger_a, '2099-06-10 13:00:00+00', 129.90, 129.90, 'DINHEIRO', 'CANCELADA');

  INSERT INTO public.itens_venda (venda_id, produto_id, quantidade, preco_unitario_original, preco_unitario, tipo_preco) VALUES
    (v1, c_prod1, 2, 20.00, 20.00, 'VAREJO'),
    (v1, c_prod2, 3, 20.00, 20.00, 'VAREJO');

  -- ledger append-only: a venda cancelada tem 2 eventos
  INSERT INTO public.venda_eventos (event_type, sale_id, caixa_id, operador_id, loja_id, total, total_bruto, forma_pagamento, occurred_at, source, idempotency_key) VALUES
    ('SALE_REGISTERED', v1, v_caixa, c_ger_a, c_loja_a, 100.00, 100.00, 'PIX',      '2099-06-10 10:00:00+00', 'onda_a_test', 'onda_a:' || v1 || ':r'),
    ('SALE_REGISTERED', v2, v_caixa, c_ger_a, c_loja_a, 123.90, 123.90, 'DINHEIRO', '2099-06-10 11:00:00+00', 'onda_a_test', 'onda_a:' || v2 || ':r'),
    ('SALE_REGISTERED', v3, v_caixa, c_ger_a, c_loja_a, 130.00, 130.00, 'PIX',      '2099-06-10 12:00:00+00', 'onda_a_test', 'onda_a:' || v3 || ':r'),
    ('SALE_REGISTERED', v4, v_caixa, c_ger_a, c_loja_a, 129.90, 129.90, 'DINHEIRO', '2099-06-10 13:00:00+00', 'onda_a_test', 'onda_a:' || v4 || ':r'),
    ('SALE_CANCELLED',  v4, v_caixa, c_ger_a, c_loja_a, 129.90, 129.90, 'DINHEIRO', '2099-06-10 14:00:00+00', 'onda_a_test', 'onda_a:' || v4 || ':c');

  -- Operações pós-venda (fonte do valor econômico). op_v2 é MISTA (PR-2D/D-13): devolução de 50,00 = 20,00 devolvidos em
  -- meio de pagamento (linha em `devolucoes`) + 30,00 abatidos do saldo a receber (SEM linha em `devolucoes`).
  -- A métrica tem de contar 50,00, não os 20,00 de `devolucoes.valor`.
  INSERT INTO public.venda_pos_venda_operacoes (id, idempotency_key, venda_id, tipo, motivo, valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id) VALUES
    (op_v2, 'onda_a:' || op_v2, v2, 'DEVOLUCAO', 'devolucao mista teste',      50.00, 20.00, 'DINHEIRO', c_ger_a, v_caixa), -- conta 50,00
    (op_v4, 'onda_a:' || op_v4, v4, 'DEVOLUCAO', 'devolucao antes de cancelar', 10.00, 10.00, 'DINHEIRO', c_ger_a, v_caixa); -- fora (venda CANCELADA)

  INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id) VALUES
    (v2, 20.00,  'DINHEIRO', 'parcela em meio da devolucao mista', c_ger_a, op_v2), -- só a parcela em meio
    (v4, 129.90, 'DINHEIRO', 'linha do cancelamento',     c_ger_a, NULL),            -- sem operação pós-venda
    (v4, 10.00,  'DINHEIRO', 'devolucao antes de cancelar', c_ger_a, op_v4);        -- venda CANCELADA

  SELECT count(*) INTO n_eventos_antes FROM public.venda_eventos WHERE sale_id IN (v1, v2, v3, v4);
  IF n_eventos_antes <> 5 THEN RAISE EXCEPTION 'onda-a: fixture do ledger esperava 5 eventos, veio %', n_eventos_antes; END IF;

  -- O ledger tem 5 eventos para 4 vendas (asserção acima): essa é a causa raiz. O RPC legado
  -- `listar_venda_eventos_gerente` já foi corrigido em produção por 20260930090200 (P-03, lê `vendas`),
  -- então hoje também devolve UMA linha por venda — 4, e não 5.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO v_antigo FROM public.listar_venda_eventos_gerente(c_loja_a, v_ini, v_fim, ARRAY['SALE_REGISTERED','SALE_CANCELLED'], NULL, 0, 100);
  IF v_antigo <> 4 THEN RAISE EXCEPTION 'onda-a: RPC legado (P-03) esperava 4 linhas (uma por venda), veio %', v_antigo; END IF;

  -- ── KPIs canônicos (service_role) ─────────────────────────────────────────────────────────────
  SELECT * INTO k FROM public.kpis_vendas_gerente(c_loja_a, v_ini, v_fim, NULL);
  IF k.vendas_registradas <> 4 THEN RAISE EXCEPTION 'registradas esperava 4, veio %', k.vendas_registradas; END IF;
  IF k.vendas_concluidas <> 3 THEN RAISE EXCEPTION 'concluidas esperava 3, veio %', k.vendas_concluidas; END IF;
  IF k.faturado <> 353.90 THEN RAISE EXCEPTION 'faturado esperava 353.90, veio %', k.faturado; END IF;
  IF k.vendas_canceladas <> 1 THEN RAISE EXCEPTION 'canceladas esperava 1, veio %', k.vendas_canceladas; END IF;
  IF k.valor_cancelado <> 129.90 THEN RAISE EXCEPTION 'valor_cancelado esperava 129.90, veio %', k.valor_cancelado; END IF;
  IF k.devolucoes <> 50.00 THEN RAISE EXCEPTION 'devolucoes esperava 50.00 (valor economico da devolucao mista, sem cancelamento), veio %', k.devolucoes; END IF;
  IF k.receita_liquida <> 303.90 THEN RAISE EXCEPTION 'receita_liquida esperava 303.90, veio %', k.receita_liquida; END IF;
  IF round(k.ticket_medio, 2) <> 117.97 OR abs(k.ticket_medio - (353.90 / 3)) > 0.0001 THEN
    RAISE EXCEPTION 'ticket_medio esperava 117,966..., veio %', k.ticket_medio;
  END IF;
  IF k.taxa_cancelamento <> 0.25 THEN RAISE EXCEPTION 'taxa_cancelamento esperava 0.25 (fracao), veio %', k.taxa_cancelamento; END IF;

  -- filtro por forma de pagamento: só PIX (v1 + v3 = 230,00, nenhuma cancelada)
  SELECT * INTO k FROM public.kpis_vendas_gerente(c_loja_a, v_ini, v_fim, ARRAY['PIX']);
  IF k.vendas_registradas <> 2 OR k.faturado <> 230.00 OR k.vendas_canceladas <> 0 OR k.devolucoes <> 0 THEN
    RAISE EXCEPTION 'filtro PIX inconsistente: reg=% fat=% canc=% dev=%', k.vendas_registradas, k.faturado, k.vendas_canceladas, k.devolucoes;
  END IF;

  -- janela vazia: denominador zero
  SELECT * INTO k FROM public.kpis_vendas_gerente(c_loja_a, '2099-07-01+00', '2099-07-02+00', NULL);
  IF k.vendas_registradas <> 0 OR k.taxa_cancelamento <> 0 OR k.ticket_medio <> 0 OR k.receita_liquida <> 0 THEN
    RAISE EXCEPTION 'janela vazia deveria zerar tudo (denominador zero)';
  END IF;

  -- ── lista: uma linha por venda ────────────────────────────────────────────────────────────────
  SELECT count(*), count(DISTINCT venda_id) INTO n, n_ids FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 100);
  IF n <> 4 OR n_ids <> 4 THEN RAISE EXCEPTION 'lista esperava 4 linhas/4 UUIDs, veio % / %', n, n_ids; END IF;

  SELECT count(*) INTO n FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 100) WHERE venda_id = v4;
  IF n <> 1 THEN RAISE EXCEPTION 'venda cancelada deveria aparecer 1 vez, veio %', n; END IF;
  IF (SELECT status FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 100) WHERE venda_id = v4) <> 'CANCELADA' THEN
    RAISE EXCEPTION 'status da venda cancelada deveria vir de vendas.status = CANCELADA';
  END IF;
  SELECT count(*) INTO n FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 100) WHERE status = 'CONCLUIDA';
  IF n <> 3 THEN RAISE EXCEPTION 'lista esperava 3 CONCLUIDA, veio %', n; END IF;

  -- itens agregados
  SELECT * INTO k FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 100) WHERE venda_id = v1;
  IF k.qtd_itens_total <> 5 OR k.qtd_itens_distintos <> 2 OR k.primeiro_produto IS NULL THEN
    RAISE EXCEPTION 'agregado de itens inconsistente: total=% distintos=% primeiro=%', k.qtd_itens_total, k.qtd_itens_distintos, k.primeiro_produto;
  END IF;

  -- filtros
  SELECT count(*) INTO n FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, ARRAY['CANCELADA'], NULL, 0, 100);
  IF n <> 1 THEN RAISE EXCEPTION 'filtro status CANCELADA esperava 1, veio %', n; END IF;
  SELECT count(*) INTO n FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, ARRAY['PIX'], 0, 100);
  IF n <> 2 THEN RAISE EXCEPTION 'filtro forma PIX esperava 2, veio %', n; END IF;

  -- paginação estável e sem sobreposição
  SELECT array_agg(venda_id) INTO p1 FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 2);
  SELECT array_agg(venda_id) INTO p2 FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 2, 2);
  SELECT array_agg(venda_id) INTO p3 FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 4, 2);
  IF cardinality(p1) <> 2 OR cardinality(p2) <> 2 OR p3 IS NOT NULL OR p1 && p2 THEN
    RAISE EXCEPTION 'paginação inconsistente: p1=% p2=% p3=%', p1, p2, p3;
  END IF;
  IF (SELECT venda_id FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 1)) <> v4 THEN
    RAISE EXCEPTION 'ordem esperada: mais recente primeiro (v4)';
  END IF;

  -- ── autorização por loja ──────────────────────────────────────────────────────────────────────
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_ger_a), true);
  SELECT count(*) INTO n FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 100);
  IF n <> 4 THEN RAISE EXCEPTION 'gerente da loja A deveria ver 4 vendas, veio %', n; END IF;
  SELECT * INTO k FROM public.kpis_vendas_gerente(c_loja_a, v_ini, v_fim, NULL);
  IF k.faturado <> 353.90 THEN RAISE EXCEPTION 'gerente da loja A deveria ver faturado 353.90, veio %', k.faturado; END IF;
  SELECT count(*) INTO n FROM public.listar_vendas_gerente(c_loja_b, v_ini, v_fim, NULL, NULL, 0, 100);
  IF n <> 0 THEN RAISE EXCEPTION 'gerente da loja A não pode listar loja B'; END IF;

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_ger_b), true);
  SELECT count(*) INTO n FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 100);
  IF n <> 0 THEN RAISE EXCEPTION 'gerente da loja B não pode listar vendas da loja A (vazou %)', n; END IF;
  SELECT * INTO k FROM public.kpis_vendas_gerente(c_loja_a, v_ini, v_fim, NULL);
  IF k.vendas_registradas <> 0 OR k.faturado <> 0 THEN RAISE EXCEPTION 'gerente da loja B não pode ver KPIs da loja A'; END IF;

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_op_b), true);
  SELECT count(*) INTO n FROM public.listar_vendas_gerente(c_loja_b, v_ini, v_fim, NULL, NULL, 0, 100);
  SELECT * INTO k FROM public.kpis_vendas_gerente(c_loja_a, v_ini, v_fim, NULL);
  IF k.vendas_registradas <> 0 THEN RAISE EXCEPTION 'operador não pode ver KPIs gerenciais'; END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true); -- sem identidade
  SELECT count(*) INTO n FROM public.listar_vendas_gerente(c_loja_a, v_ini, v_fim, NULL, NULL, 0, 100);
  IF n <> 0 THEN RAISE EXCEPTION 'sem identidade não pode listar'; END IF;

  EXECUTE 'RESET ROLE';

  -- ── grants: anon/PUBLIC sem acesso; authenticated e service_role com acesso ────────────────────
  IF has_function_privilege('anon', 'public.listar_vendas_gerente(uuid,timestamptz,timestamptz,text[],text[],integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.kpis_vendas_gerente(uuid,timestamptz,timestamptz,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon não deveria executar as RPCs de vendas';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.listar_vendas_gerente(uuid,timestamptz,timestamptz,text[],text[],integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.kpis_vendas_gerente(uuid,timestamptz,timestamptz,text[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.kpis_vendas_gerente(uuid,timestamptz,timestamptz,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated/service_role deveriam executar as RPCs de vendas';
  END IF;

  -- ── histórico preservado: as funções são somente leitura, o ledger segue com 5 eventos ─────────
  SELECT count(*) INTO n FROM public.venda_eventos WHERE sale_id IN (v1, v2, v3, v4);
  IF n <> n_eventos_antes THEN RAISE EXCEPTION 'ledger alterado: antes % depois %', n_eventos_antes, n; END IF;

  RAISE NOTICE 'vendas-lista-kpis-por-venda OK (4 vendas, 3 concluidas = 353.90, 1 cancelada = 129.90, devolucao = 50.00, receita liquida = 303.90, taxa = 0.25)';
END
$onda_a$;

ROLLBACK;
