-- A-L1 G5 — seeds sintéticos multi-loja (1 / 5 / 10).
-- Uso via apply-capacity-seeds.sh (define -v n_lojas=N).
-- Dados 100% sintéticos; sem PII real. Idempotente.
\set ON_ERROR_STOP on

\echo '=== Capacity synthetic seed n_lojas=':'n_lojas' '==='
SELECT (:'n_lojas')::int AS n_lojas \gset

BEGIN;

DO $seed$
DECLARE
  n int := :n_lojas;
  i int;
  j int;
  v_loja uuid;
  v_op uuid;
  v_ger uuid;
  v_prod uuid;
  v_caixa uuid;
  codigo text;
BEGIN
  IF n NOT IN (1, 5, 10) THEN
    RAISE EXCEPTION 'CAPACITY_LOJAS inválido: % (use 1, 5 ou 10)', n;
  END IF;

  FOR i IN 1..n LOOP
    IF i = 1 THEN
      v_loja := 'a0000001-0000-4000-8000-000000000001';
      codigo := 'MATRIZ';
      UPDATE public.lojas
         SET nome = 'Capacity L01 Matriz', ativo = true
       WHERE id = v_loja;
      v_ger := '22222222-2222-4222-8222-222222222222';
      v_op := '33333333-3333-4333-8333-333333333333';
    ELSE
      v_loja := ('b0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
      codigo := 'CAP_L' || lpad(i::text, 2, '0');
      INSERT INTO public.lojas (id, nome, codigo, ativo)
      VALUES (v_loja, 'Capacity L' || lpad(i::text, 2, '0'), codigo, true)
      ON CONFLICT (id) DO UPDATE
        SET nome = EXCLUDED.nome, codigo = EXCLUDED.codigo, ativo = true;

      v_ger := ('c1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
      v_op := ('c2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;

      INSERT INTO auth.users (
        id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) VALUES
        (v_ger, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'gerente.l' || lpad(i::text, 2, '0') || '@capacity.local.test',
         now(), now(), now(), '', '', '', ''),
        (v_op, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'operador.l' || lpad(i::text, 2, '0') || '@capacity.local.test',
         now(), now(), now(), '', '', '', '')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
      VALUES
        (v_ger, 'Gerente L' || lpad(i::text, 2, '0'), 'GERENTE', true, v_loja),
        (v_op, 'Operador L' || lpad(i::text, 2, '0'), 'OPERADOR', true, v_loja)
      ON CONFLICT (id) DO UPDATE
        SET loja_id = EXCLUDED.loja_id, ativo = true, perfil = EXCLUDED.perfil;
    END IF;

    FOR j IN 1..5 LOOP
      v_prod := (
        'd3000000-0000-4000-8' || lpad(i::text, 3, '0') || '-' || lpad(j::text, 12, '0')
      )::uuid;
      INSERT INTO public.produtos (
        id, loja_id, nome, codigo_barras, preco_varejo, preco_custo,
        ativo, origem, unidade_medida
      ) VALUES (
        v_prod, v_loja,
        'Cap Prod L' || lpad(i::text, 2, '0') || ' P' || lpad(j::text, 2, '0'),
        'CAP' || lpad(i::text, 2, '0') || lpad(j::text, 2, '0'),
        (10 + j)::numeric,
        (2 + j * 0.5)::numeric,
        true, 'china_manual', 'UN'
      ) ON CONFLICT (id) DO UPDATE
        SET ativo = true,
            preco_varejo = EXCLUDED.preco_varejo,
            nome = EXCLUDED.nome;

      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual)
      VALUES (v_prod, v_loja, 1000)
      ON CONFLICT (produto_id, loja_id) DO UPDATE
        SET quantidade_atual = GREATEST(public.estoque.quantidade_atual, 1000);
    END LOOP;

    IF i > 1 THEN
      v_caixa := ('e4000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
      INSERT INTO public.caixas (id, operador_id, loja_id, status, valor_inicial, saldo_atual)
      VALUES (v_caixa, v_op, v_loja, 'ABERTO', 0, 0)
      ON CONFLICT (id) DO UPDATE
        SET status = 'ABERTO',
            operador_id = EXCLUDED.operador_id,
            loja_id = EXCLUDED.loja_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'seed_capacity_ok lojas=%', n;
END
$seed$;

COMMIT;

SELECT count(*)::int AS lojas_capacity
FROM public.lojas
WHERE codigo = 'MATRIZ' OR codigo LIKE 'CAP_L%';

SELECT count(*)::int AS produtos_capacity
FROM public.produtos
WHERE codigo_barras LIKE 'CAP%';

\echo '=== seed synthetic OK ==='
