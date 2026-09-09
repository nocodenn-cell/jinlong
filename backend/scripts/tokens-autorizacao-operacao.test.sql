-- Provas do contrato de autorização tipada (SANGRIA / PAGAMENTO_AP).
--
-- Invariante:
--   operador solicitante -> gerente aprovador -> token -> finalidade + alvo -> efeito
--
-- Roda inteiro dentro de uma transação e faz ROLLBACK no fim: não deixa resíduo.
--   docker exec -i supabase_db_fastproduct psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f backend/scripts/tokens-autorizacao-operacao.test.sql

\set ON_ERROR_STOP on
BEGIN;

-- Fixtures reais do seed (evita mexer em auth.users).
--   loja A = Matriz            gerente A = GERENTE ativo da Matriz
--   loja B = NFE-CONC Loja     gerente B = GERENTE ativo da loja B
--   operador A = OPERADOR da Matriz (solicitante)
CREATE TEMP TABLE fx AS SELECT
  'a0000001-0000-4000-8000-000000000001'::uuid AS loja_a,
  'ae92d3f5-7dc0-471d-adca-5515600ddfc6'::uuid AS loja_b,
  'f3b06852-e6a0-4b9c-ab25-c8f47bb9b3a9'::uuid AS gerente_a,
  '210c5697-a850-4b0f-aea6-b479102101ee'::uuid AS gerente_b,
  '33333333-3333-4333-8333-333333333333'::uuid AS operador_a;

-- Helper: consumir esperando NEGAÇÃO. Falha o teste se for aceito.
CREATE OR REPLACE FUNCTION pg_temp.deny(
  p_caso text, p_token text, p_finalidade text, p_alvo text, p_loja uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  BEGIN
    v := public.consumir_token_autorizacao_operacao(p_token, p_finalidade, p_alvo, p_loja);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS  DENY  %  (%)', p_caso, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FALHOU: % foi ACEITO (aprovador %) e deveria ser negado', p_caso, v;
END $$;

-- Helper: consumir esperando ACEITE + aprovador correto.
CREATE OR REPLACE FUNCTION pg_temp.allow(
  p_caso text, p_token text, p_finalidade text, p_alvo text, p_loja uuid, p_esperado uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  v := public.consumir_token_autorizacao_operacao(p_token, p_finalidade, p_alvo, p_loja);
  IF v IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'FALHOU: % aprovador retornado % <> esperado %', p_caso, v, p_esperado;
  END IF;
  RAISE NOTICE 'PASS  ALLOW %  (aprovador=%)', p_caso, v;
END $$;

-- Emissão dos tokens de teste (o que a Edge Function grava).
INSERT INTO public.tokens_autorizacao_operacao
  (token, finalidade, alvo_id, loja_id, gerente_id, solicitante_id, expira_em)
SELECT * FROM (
  SELECT 'tk_sangria_1', 'SANGRIA',      'mov-1',            loja_a, gerente_a, operador_a, now() + interval '5 min' FROM fx
  UNION ALL SELECT 'tk_sangria_2', 'SANGRIA', 'mov-2',        loja_a, gerente_a, operador_a, now() + interval '5 min' FROM fx
  UNION ALL SELECT 'tk_ap_1', 'PAGAMENTO_AP', 'ap:conta-1:k1', loja_a, gerente_a, operador_a, now() + interval '5 min' FROM fx
  UNION ALL SELECT 'tk_ap_2', 'PAGAMENTO_AP', 'ap:conta-2:k2', loja_a, gerente_a, operador_a, now() + interval '5 min' FROM fx
  UNION ALL SELECT 'tk_expirado', 'SANGRIA', 'mov-exp',       loja_a, gerente_a, operador_a, now() - interval '1 min' FROM fx
  UNION ALL SELECT 'tk_usado', 'SANGRIA', 'mov-usado',        loja_a, gerente_a, operador_a, now() + interval '5 min' FROM fx
  UNION ALL SELECT 'tk_replay', 'SANGRIA', 'mov-replay',      loja_a, gerente_a, operador_a, now() + interval '5 min' FROM fx
  UNION ALL SELECT 'tk_gerente_outra_loja', 'SANGRIA', 'mov-x', loja_a, gerente_b, operador_a, now() + interval '5 min' FROM fx
  UNION ALL SELECT 'tk_atomicidade', 'SANGRIA', 'mov-atom',   loja_a, gerente_a, operador_a, now() + interval '5 min' FROM fx
) t;

UPDATE public.tokens_autorizacao_operacao SET usado = true WHERE token = 'tk_usado';

-- Token legado (tabela antiga), para provar que não cruza para o mundo tipado.
INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por)
SELECT 'tk_legado', now() + interval '5 min', false, loja_a::text, NULL FROM fx;

\echo ''
\echo '=== CROSS-PURPOSE MATRIX ==='
DO $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM fx;

  -- SANGRIA -> outra sangria = DENY  (token preso ao alvo)
  PERFORM pg_temp.deny('SANGRIA -> outra sangria', 'tk_sangria_1', 'SANGRIA', 'mov-2', f.loja_a);
  -- SANGRIA -> AP = DENY
  PERFORM pg_temp.deny('SANGRIA -> AP', 'tk_sangria_1', 'PAGAMENTO_AP', 'ap:conta-1:k1', f.loja_a);
  -- AP -> outro AP = DENY
  PERFORM pg_temp.deny('AP -> outro AP', 'tk_ap_1', 'PAGAMENTO_AP', 'ap:conta-2:k2', f.loja_a);
  -- AP -> SANGRIA = DENY
  PERFORM pg_temp.deny('AP -> SANGRIA', 'tk_ap_1', 'SANGRIA', 'mov-1', f.loja_a);
  -- Finalidade tipada desconhecida = DENY
  PERFORM pg_temp.deny('finalidade desconhecida', 'tk_sangria_1', 'REABERTURA', 'mov-1', f.loja_a);
  PERFORM pg_temp.deny('finalidade nula', 'tk_sangria_1', NULL, 'mov-1', f.loja_a);
  -- Token legado não existe no mundo tipado = DENY
  PERFORM pg_temp.deny('legado -> SANGRIA', 'tk_legado', 'SANGRIA', 'mov-1', f.loja_a);

  -- Caminhos corretos (por último: consomem o token)
  PERFORM pg_temp.allow('SANGRIA -> SANGRIA correta', 'tk_sangria_1', 'SANGRIA', 'mov-1', f.loja_a, f.gerente_a);
  PERFORM pg_temp.allow('AP -> AP correto', 'tk_ap_1', 'PAGAMENTO_AP', 'ap:conta-1:k1', f.loja_a, f.gerente_a);
END $$;

\echo ''
\echo '=== SANGRIA/AP NAO ALCANCAM CONSUMIDORES LEGADOS (estrutural) ==='
DO $$
DECLARE n int;
BEGIN
  -- Desconto de venda, limite de crédito e retomada de caixa leem SOMENTE
  -- `tokens_desconto_gerente`. Tokens tipados nunca são gravados lá, então
  -- aqueles consumidores não têm como encontrá-los.
  SELECT count(*) INTO n FROM public.tokens_desconto_gerente
   WHERE token IN ('tk_sangria_1','tk_sangria_2','tk_ap_1','tk_ap_2');
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: % token(s) tipado(s) visivel(is) na tabela legada', n;
  END IF;
  RAISE NOTICE 'PASS  DENY  SANGRIA/AP -> desconto de venda (ausente da tabela legada)';
  RAISE NOTICE 'PASS  DENY  SANGRIA/AP -> limite de credito (ausente da tabela legada)';
  RAISE NOTICE 'PASS  DENY  SANGRIA/AP -> reabertura de caixa (ausente da tabela legada)';
END $$;

\echo ''
\echo '=== IDENTIDADE E TENANT ==='
DO $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM fx;
  -- Loja errada = DENY (mesmo token, mesma finalidade, mesmo alvo)
  PERFORM pg_temp.deny('outra loja', 'tk_sangria_2', 'SANGRIA', 'mov-2', f.loja_b);
  -- Gerente que não pertence à loja da operação = DENY
  PERFORM pg_temp.deny('gerente de outra loja', 'tk_gerente_outra_loja', 'SANGRIA', 'mov-x', f.loja_a);

  -- Gerente desativado APÓS a emissão = DENY (revalidação no consumo)
  UPDATE public.usuarios SET ativo = false WHERE id = f.gerente_a;
  PERFORM pg_temp.deny('gerente inativo no consumo', 'tk_sangria_2', 'SANGRIA', 'mov-2', f.loja_a);
  UPDATE public.usuarios SET ativo = true WHERE id = f.gerente_a;

  -- Solicitante e aprovador ficam separados na linha do token
  PERFORM 1 FROM public.tokens_autorizacao_operacao
   WHERE token = 'tk_sangria_2' AND gerente_id = f.gerente_a AND solicitante_id = f.operador_a
     AND gerente_id <> solicitante_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHOU: solicitante/aprovador nao estao separados';
  END IF;
  RAISE NOTICE 'PASS  auditoria separa solicitante (operador) de aprovador (gerente)';
END $$;

\echo ''
\echo '=== REPLAY / EXPIRACAO / USO UNICO ==='
DO $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM fx;
  PERFORM pg_temp.deny('token expirado', 'tk_expirado', 'SANGRIA', 'mov-exp', f.loja_a);
  PERFORM pg_temp.deny('token ja usado', 'tk_usado', 'SANGRIA', 'mov-usado', f.loja_a);

  -- replay: primeiro consumo passa, segundo é negado
  PERFORM pg_temp.allow('replay 1o uso', 'tk_replay', 'SANGRIA', 'mov-replay', f.loja_a, f.gerente_a);
  PERFORM pg_temp.deny('replay 2o uso', 'tk_replay', 'SANGRIA', 'mov-replay', f.loja_a);
END $$;

\echo ''
\echo '=== ATOMICIDADE (rollback conjunto) ==='
DO $$
DECLARE f record; v_usado boolean;
BEGIN
  SELECT * INTO f FROM fx;
  BEGIN
    PERFORM public.consumir_token_autorizacao_operacao('tk_atomicidade', 'SANGRIA', 'mov-atom', f.loja_a);
    -- falha controlada depois do consumo, simulando erro no efeito financeiro
    RAISE EXCEPTION 'FALHA_CONTROLADA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FALHA_CONTROLADA' THEN RAISE; END IF;
  END;
  SELECT usado INTO v_usado FROM public.tokens_autorizacao_operacao WHERE token = 'tk_atomicidade';
  IF v_usado THEN
    RAISE EXCEPTION 'FALHOU: token permaneceu consumido apos rollback (estado parcial)';
  END IF;
  RAISE NOTICE 'PASS  consumo do token desfeito junto com a falha (sem estado parcial)';
END $$;

\echo ''
\echo '=== SUPERFICIE (grants) ==='
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.tokens_autorizacao_operacao', 'SELECT')
     OR has_table_privilege('anon', 'public.tokens_autorizacao_operacao', 'SELECT') THEN
    RAISE EXCEPTION 'FALHOU: anon/authenticated enxergam a tabela de tokens';
  END IF;
  IF has_function_privilege('authenticated',
       'public.consumir_token_autorizacao_operacao(text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.consumir_token_autorizacao_operacao(text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: anon/authenticated podem consumir token direto';
  END IF;
  RAISE NOTICE 'PASS  tabela e funcao de consumo fechadas para anon/authenticated';
END $$;

\echo ''
\echo 'TODOS OS CASOS PASSARAM'
ROLLBACK;
