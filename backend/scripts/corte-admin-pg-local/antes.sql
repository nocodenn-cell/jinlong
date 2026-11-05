-- Sanidade ANTES do corte: o ADMIN legado tinha escopo global (o problema que o corte resolve).
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ BEGIN
  IF NOT public.fp_pode_loja('b0000001-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'FALHOU antes: ADMIN deveria ser global'; END IF;
  IF internal.token_gerente_fora_da_loja('tAdmB','b0000001-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'FALHOU antes: token ADMIN valia na loja B'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',false);
