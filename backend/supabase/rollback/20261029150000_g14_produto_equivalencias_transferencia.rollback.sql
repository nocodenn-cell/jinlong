-- Rollback G14 (20261029150000): remove a exigência de equivalência e restaura o corpo anterior
-- de internal.transferir_estoque_seguro (S1b). Dados de produto_equivalencias são descartados.
BEGIN;

DO $rb$
DECLARE
  v_def text;
  v_n int;
  v_guarda text := E'  -- G14: catálogo da empresa usa o mesmo produto_id nas lojas (fase 5). Equivalência\n'
    || E'  -- confirmada só traduz produto cadastrado em duplicidade numa loja; sem ela, vale o mesmo id.\n'
    || E'  SELECT pe.produto_destino_id INTO v_produto_destino\n'
    || E'    FROM public.produto_equivalencias pe\n'
    || E'   WHERE pe.produto_origem_id = p_produto_id AND pe.loja_destino_id = p_loja_destino AND pe.ativo;\n'
    || E'  v_produto_destino := COALESCE(v_produto_destino, p_produto_id);\n\n';
BEGIN
  v_def := pg_get_functiondef('internal.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)'::regprocedure);

  v_def := replace(v_def, v_guarda, '');
  v_def := replace(v_def, E'  v_produto_destino uuid;\n', '');
  v_def := replace(v_def, 'WHERE e.loja_id = p_loja_destino AND e.produto_id = v_produto_destino', 'WHERE e.loja_id = p_loja_destino AND e.produto_id = p_produto_id');
  v_def := replace(v_def, 'VALUES (p_loja_destino, v_produto_destino, p_quantidade, 0)', 'VALUES (p_loja_destino, p_produto_id, p_quantidade, 0)');
  v_def := replace(v_def, E'    p_loja_destino,\n    v_produto_destino,\n', E'    p_loja_destino,\n    p_produto_id,\n');

  IF position('v_produto_destino' IN v_def) > 0 THEN
    RAISE EXCEPTION 'G14 ROLLBACK: referência a v_produto_destino ainda presente';
  END IF;
  EXECUTE v_def;
END
$rb$;

DROP FUNCTION IF EXISTS public.produto_equivalencia_registrar(uuid, uuid, uuid);
DROP TABLE IF EXISTS public.produto_equivalencias;
DROP FUNCTION IF EXISTS internal.tg_produto_equivalencias_valida();

NOTIFY pgrst, 'reload schema';
COMMIT;
