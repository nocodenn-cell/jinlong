-- Executar somente no Supabase LOCAL/CI. Dados sintéticos, sem persistência.
\set ON_ERROR_STOP on
BEGIN;
SELECT id AS gerente_id,loja_id AS loja FROM public.usuarios
 WHERE perfil='GERENTE' AND ativo AND loja_id IS NOT NULL ORDER BY id LIMIT 1 \gset
INSERT INTO public.caixas(loja_id,status,valor_inicial) VALUES (:'loja','ABERTO',100) RETURNING id AS caixa \gset
SELECT set_config('request.jwt.claim.sub', :'gerente_id', true),set_config('test.caixa', :'caixa', true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 banco uuid; mov uuid; p jsonb; tabela text; verbo text; r text; atributo record; permitido boolean;
BEGIN
 banco := (public.financeiro_comando('CRIAR_CONTA',jsonb_build_object('nome','Teste hardening '||gen_random_uuid(),'tipo','BANCO','data',hoje),gen_random_uuid())->>'id')::uuid;
 SELECT movimentacao_id INTO mov FROM public.registrar_movimentacao(current_setting('test.caixa')::uuid,'sangria','dinheiro',20,'Reserva hardening','OUTRO',NULL,NULL,gen_random_uuid()::text);
 IF public.calcular_valor_sistema_dinheiro_caixa(current_setting('test.caixa')::uuid)<>80 THEN RAISE EXCEPTION 'PDV_SANGRIA_NAO_RECONCILIA'; END IF;
 PERFORM public.financeiro_comando('VINCULAR_CAIXA',jsonb_build_object('movimento_id',mov,'conta_id',banco,'data',hoje),gen_random_uuid());
 IF (SELECT saldo_atual FROM public.caixas WHERE id=current_setting('test.caixa')::uuid)<>80
 OR public.calcular_valor_sistema_dinheiro_caixa(current_setting('test.caixa')::uuid)<>80 THEN RAISE EXCEPTION 'VINCULO_DUPLICOU_EFEITO_NO_PDV'; END IF;
 p:=public.financeiro_painel(hoje,hoje,1);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'contas') c WHERE c->>'id'=banco::text AND (c->>'saldo')::numeric=20) THEN RAISE EXCEPTION 'VINCULO_NAO_CREDITOU_BANCO'; END IF;
 PERFORM * FROM public.registrar_movimentacao(current_setting('test.caixa')::uuid,'estorno','dinheiro',20,'Corrigir reserva','OUTRO',NULL,mov,gen_random_uuid()::text);
 IF (SELECT saldo_atual FROM public.caixas WHERE id=current_setting('test.caixa')::uuid)<>100
 OR public.calcular_valor_sistema_dinheiro_caixa(current_setting('test.caixa')::uuid)<>100 THEN RAISE EXCEPTION 'ESTORNO_DUPLICOU_EFEITO_NO_PDV'; END IF;
 p:=public.financeiro_painel(hoje,hoje,1);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'contas') c WHERE c->>'id'=banco::text AND (c->>'saldo')::numeric=0) THEN RAISE EXCEPTION 'ESTORNO_NAO_COMPENSOU_BANCO'; END IF;
 IF EXISTS(SELECT 1 FROM public.movimentos_financeiros WHERE conta_financeira_id=banco AND origem NOT IN ('SALDO_INICIAL','TRANSFERENCIA_PDV','ESTORNO_TRANSFERENCIA_PDV')) THEN RAISE EXCEPTION 'TRANSFERENCIA_PDV_VIROU_OPERACAO'; END IF;
 IF jsonb_array_length(p->'resultado_caixa')<>0 THEN RAISE EXCEPTION 'ESTORNO_TRANSFERENCIA_PDV_VIROU_DESPESA'; END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH tabela IN ARRAY ARRAY['contas_pagar','contas_receber','contas_pagar_pagamentos','liquidacoes_receber','contas_financeiras','movimentos_financeiros','financeiro_comandos','financeiro_recebiveis_venda','extratos_financeiros','conciliacoes_financeiras'] LOOP
   FOREACH verbo IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    permitido := r='authenticated' AND (verbo='SELECT' OR tabela='contas_receber' AND verbo='INSERT');
    IF has_table_privilege(r,'public.'||tabela,verbo)<>permitido THEN RAISE EXCEPTION 'GRANT_DIVERGENTE %.%.%',r,tabela,verbo; END IF;
   END LOOP;
   FOR atributo IN SELECT attname FROM pg_attribute WHERE attrelid=('public.'||tabela)::regclass AND attnum>0 AND NOT attisdropped LOOP
    IF has_column_privilege(r,'public.'||tabela,atributo.attname,'UPDATE') THEN RAISE EXCEPTION 'UPDATE_COLUNA_EXPOSTO %.%.%',r,tabela,atributo.attname; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END $test$;
RESET ROLE;
ROLLBACK;
