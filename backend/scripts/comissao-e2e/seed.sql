\set ON_ERROR_STOP on
BEGIN;
\ir ../../supabase/tests/comissao/_fixture.sql
-- nomes/e-mails fictícios para a interface
UPDATE public.usuarios SET nome = x.nome FROM (VALUES ('dona','Dona Marta (fictícia)'),('gea','Gerente Paulo'),('opa','Caixa Rita'),('vea','Ana Souza'),('veb2','Bruno Lima'),('geb','Gerente Outra Loja'),('opb','Caixa Outra Loja')) x(k,nome)
 WHERE id = pg_temp.c(x.k);
UPDATE auth.users SET email = x.e, aud = 'authenticated', role = 'authenticated', email_confirmed_at = now(), raw_user_meta_data = jsonb_build_object('full_name', x.e)
  FROM (VALUES ('dona','dona@demo.test'),('gea','gerente@demo.test'),('opa','caixa@demo.test'),('vea','ana@demo.test'),('veb2','bruno@demo.test'),('geb','gerenteb@demo.test'),('opb','caixab@demo.test')) x(k,e)
 WHERE id = pg_temp.c(x.k);
UPDATE public.lojas SET nome = 'Loja Centro (demo)' WHERE id = pg_temp.c('la');
UPDATE public.produtos SET nome = 'Fone Bluetooth X1' WHERE id = pg_temp.c('pa');
UPDATE public.produtos SET nome = 'Capa de Celular' WHERE id = pg_temp.c('pa2');
UPDATE public.categorias SET nome = 'Eletrônicos' WHERE id = pg_temp.c('cat');
UPDATE public.categorias SET nome = 'Acessórios' WHERE id = pg_temp.c('cat2');
CREATE TABLE IF NOT EXISTS public.funcionario_dados (usuario_id uuid PRIMARY KEY, cargo text);
INSERT INTO public.funcionario_dados VALUES (pg_temp.c('vea'), 'Vendedor Externo'), (pg_temp.c('veb2'), 'Vendedor Interno') ON CONFLICT DO NOTHING;
INSERT INTO public.comissoes_regras (empresa_id, categoria_id, tipo_calculo, valor, descricao) VALUES (pg_temp.c('ea'), pg_temp.c('cat'), 'percentual', 4, 'Eletrônicos 4%');
INSERT INTO public.comissoes_regras (empresa_id, cargo, canal, tipo_calculo, valor) VALUES (pg_temp.c('ea'), 'vendedor externo', 'ATACADO', 'percentual', 2);
INSERT INTO public.comissoes_metas (empresa_id, usuario_id, competencia_inicio, faixas)
VALUES (pg_temp.c('ea'), pg_temp.c('vea'), date_trunc('month', now())::date, '[{"a_partir_de":200,"bonus_pct":1},{"a_partir_de":1000,"bonus_pct":2}]');
DO $s$ DECLARE v uuid; i int; BEGIN
  FOR i IN 1..6 LOOP
    v := gen_random_uuid();
    PERFORM pg_temp.vender(v,'ca','opa','la', CASE WHEN i % 2 = 0 THEN '[{"p":"pa","q":2,"pu":100}]' ELSE '[{"p":"pa","q":1,"pu":100},{"p":"pa2","q":3,"pu":33.33}]' END::jsonb,
      CASE WHEN i = 3 THEN 5 END);
    IF i IN (2,3,4) THEN PERFORM pg_temp.como('gea'); PERFORM public.definir_vendedor_venda(v, pg_temp.c('vea')); END IF;
    IF i = 5 THEN PERFORM pg_temp.como('gea'); PERFORM public.definir_vendedor_venda(v, pg_temp.c('veb2')); END IF;
    IF i = 6 THEN PERFORM pg_temp.como('gea'); PERFORM public.definir_divisao_comissao(v, pg_temp.c('veb2'), 30); END IF;
  END LOOP;
END $s$;
COMMIT;
