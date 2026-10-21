-- Cenários sem desconto de venda: a saída tem de ser IDÊNTICA antes (main) e depois das migrations do módulo.
-- Usado por backend/scripts/test-comissao-regressao.sh (roda em 2 bancos e compara). ROLLBACK no fim.
\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
\ir _fixture.sql
CREATE TEMP TABLE _v (rot text, id uuid); GRANT ALL ON _v TO authenticated;
DO $r$
DECLARE f uuid := gen_random_uuid(); x uuid;
BEGIN
  INSERT INTO _v VALUES ('simples', gen_random_uuid()), ('multi', gen_random_uuid()), ('fixo', gen_random_uuid()),
    ('pct_produto', gen_random_uuid()), ('regra_func', gen_random_uuid()), ('cancelada', gen_random_uuid()), ('atacado', gen_random_uuid());
  PERFORM pg_temp.vender((SELECT id FROM _v WHERE rot='simples'),'ca','opa','la','[{"p":"pa","q":2,"pu":100}]');
  PERFORM pg_temp.vender((SELECT id FROM _v WHERE rot='multi'),'ca','opa','la','[{"p":"pa","q":1,"pu":100},{"p":"pa2","q":3,"pu":33.33}]');
  UPDATE public.produtos SET comissao_tipo='fixo', comissao_valor=2.5 WHERE id=pg_temp.c('pa2');
  PERFORM pg_temp.vender((SELECT id FROM _v WHERE rot='fixo'),'ca','opa','la','[{"p":"pa","q":1,"pu":100},{"p":"pa2","q":3,"pu":33.33}]');
  UPDATE public.produtos SET comissao_tipo='percentual', comissao_valor=7 WHERE id=pg_temp.c('pa2');
  PERFORM pg_temp.vender((SELECT id FROM _v WHERE rot='pct_produto'),'ca','opa','la','[{"p":"pa2","q":3,"pu":33.33}]');
  UPDATE public.produtos SET comissao_tipo=NULL, comissao_valor=NULL WHERE id=pg_temp.c('pa2');
  INSERT INTO public.funcionarios (id, loja_id, nome, ativo) VALUES (f, pg_temp.c('la'), 'Func Caixa A', true);
  UPDATE public.usuarios SET funcionario_id = f WHERE id = pg_temp.c('opa');
  INSERT INTO public.comissoes_regras_funcionario (funcionario_id, loja_id, tipo_regra, percentual, vigencia_inicio, ativo, created_by)
  VALUES (f, pg_temp.c('la'), 'padrao', 3, CURRENT_DATE - 1, true, pg_temp.c('gea'));
  PERFORM pg_temp.vender((SELECT id FROM _v WHERE rot='regra_func'),'ca','opa','la','[{"p":"pa","q":1,"pu":100}]');
  UPDATE public.usuarios SET funcionario_id = NULL WHERE id = pg_temp.c('opa');
  PERFORM pg_temp.vender((SELECT id FROM _v WHERE rot='cancelada'),'ca','opa','la','[{"p":"pa","q":1,"pu":100}]');
  UPDATE public.vendas SET status='CANCELADA' WHERE id=(SELECT id FROM _v WHERE rot='cancelada');
  PERFORM pg_temp.vender((SELECT id FROM _v WHERE rot='atacado'),'ca','opa','la','[{"p":"pa","q":5,"pu":90,"tp":"ATACADO"}]');
END $r$;
\pset format unaligned
\pset tuples_only on
\set QUIET off
SELECT v.rot, cv.valor_comissao, cv.base_calculo, cv.status,
       (SELECT coalesce(sum(a.valor),0) FROM public.comissoes_ajustes a WHERE a.venda_id = v.id) AS ajustes,
       (SELECT string_agg(ci.origem_regra||':'||ci.tipo_calculo||':'||coalesce(ci.percentual_aplicado::text,'')||':'||coalesce(ci.valor_unitario_fixo::text,'')||':'||ci.valor_comissao, ',' ORDER BY ci.valor_comissao, ci.origem_regra)
          FROM public.comissoes_itens ci WHERE ci.venda_id = v.id) AS itens
  FROM _v v LEFT JOIN public.comissoes_vendedores cv ON cv.venda_id = v.id ORDER BY v.rot;
ROLLBACK;
