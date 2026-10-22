-- Teste manual (base local com o Import Intelligence): DONO salva UF/override; UF inválida e OPERADOR são barrados.
-- Uso: psql -d <base_local> -v dono=<uuid> -v operador=<uuid> -f nacional_uf.sql   (tudo em ROLLBACK)
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'dono', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', :'dono', true);
SELECT public.import_salvar_parametros_empresa('{"uf_importador":"PE","porto_padrao":"Porto do Recife","modal_padrao":"MARITIMO","aviso_aceito":true}');
SELECT public.import_salvar_override_tributo('{"tributo":"II","ncm_prefixo":"8516","aliquota_pct":"18"}');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.tributos_catalogo_uf) <> 27 THEN RAISE EXCEPTION 'esperado 27 UFs'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresa_parametros_importacao WHERE uf_importador = 'PE' AND aviso_aceito_em IS NOT NULL) THEN RAISE EXCEPTION 'config não salva'; END IF;
  BEGIN PERFORM public.import_salvar_parametros_empresa('{"uf_importador":"XX","aviso_aceito":true}'); RAISE EXCEPTION 'UF inválida aceita';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'operador', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', :'operador', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.empresa_parametros_importacao) <> 0 THEN RAISE EXCEPTION 'operador lê config'; END IF;
  BEGIN PERFORM public.import_salvar_override_tributo('{"tributo":"II","aliquota_pct":"1"}'); RAISE EXCEPTION 'operador gravou';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT 'OK nacional_uf' AS resultado;
ROLLBACK;
