-- Onda 2 · Bloco 4 — compatibilidade: chamada antiga de 3 argumentos
-- (sem p_faixa) continua funcionando contra a função com a assinatura nova
-- de 4 argumentos (p_faixa DEFAULT NULL).
--
-- Este teste, rodado contra Postgres real em 2026-08-31, foi o que achou o
-- bug original: com as DUAS sobrecargas coexistindo (antes da correção no
-- rodapé de `20260831110000_criar_produto_faixa_atacado_atomica.sql`), esta
-- mesma chamada falhava com `ERROR: function ... is not unique`. Depois da
-- correção (REVOKE/GRANT reafirmados + DROP da sobrecarga de 3 args), passa
-- — só resta uma função, sem ambiguidade possível.
\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja    uuid := 'b0000001-0000-4000-8000-000000000099';
  v_gerente uuid := 'b0000002-0000-4000-8000-000000000099';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'Compat3Args Loja', 'C3A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente, 'Compat3Args Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = 'GERENTE', ativo = true, loja_id = EXCLUDED.loja_id;
END
$setup$;

DO $teste$
DECLARE
  v_gerente uuid := 'b0000002-0000-4000-8000-000000000099';
  v_result  jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  -- Chamada posicional de 3 argumentos — exatamente como o código anterior
  -- a esta onda (e como o fallback do app faz quando nenhuma faixa é pedida
  -- e o banco não tem a migration nova) chamava esta função.
  v_result := public.criar_produto_com_estoque_inicial(
    jsonb_build_object(
      'nome', 'Compat3Args Produto Sem Faixa',
      'preco_varejo', 50.00,
      'origem', 'brasil_nf'
    ),
    v_gerente,
    NULL
  );

  IF (v_result->>'produto_id') IS NULL THEN
    RAISE EXCEPTION 'COMPAT_FALHOU: chamada de 3 argumentos não retornou produto_id.';
  END IF;

  IF (v_result->>'faixa_sincronizada')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'COMPAT_FALHOU: faixa_sincronizada deveria ser false sem p_faixa.';
  END IF;

  RAISE NOTICE 'COMPAT OK: chamada de 3 argumentos (sem p_faixa) resolve pra mesma função e funciona normalmente.';
END
$teste$;

ROLLBACK;
