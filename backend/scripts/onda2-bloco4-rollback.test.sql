-- Onda 2 · Bloco 4 — CREATE de produto + faixa de atacado atômicos.
-- Prova, com PostgreSQL real, que:
--   Caso A: produto + faixa válidos → tudo persiste numa chamada só.
--   Caso B: faixa inválida (quantidade_minima <= 0) → produto NÃO fica
--           parcialmente criado (a validação da faixa roda ANTES do INSERT
--           em produtos nesta RPC — nem chega a tentar).
--   Caso C: faixa com preco_unitario abaixo do preco_custo do produto (sem
--           permitir_abaixo_custo) → a trigger de margem em precos_atacado
--           (migration 124) dispara DEPOIS do produto já ter sido inserido
--           — prova que a transação inteira desfaz o INSERT em produtos
--           também, não só o de precos_atacado.
--   Caso D: regra de margem em produtos (preco_varejo abaixo do preco_custo,
--           trigger da migration 125) continua bloqueando — a migration
--           desta onda não afrouxou nenhuma validação existente.
--
-- ✅ EXECUTADO com Postgres real em 2026-08-31 (Docker/supabase local,
-- `supabase db reset` aplicando todas as migrations do repo, incluindo esta
-- e a correção de sobrecarga/grants que ela motivou — ver o rodapé de
-- `20260831110000_criar_produto_faixa_atacado_atomica.sql`). Os 4 casos
-- passaram (`Caso A/B/C/D OK`). Reexecutável via
-- `docker exec -i supabase_db_fastproduct psql -U postgres -d postgres -f -
-- < backend/scripts/onda2-bloco4-rollback.test.sql` contra qualquer banco com
-- as migrations desta onda aplicadas. Tudo dentro de uma transação com
-- ROLLBACK final — não persiste nada.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja       uuid := 'b0000001-0000-4000-8000-000000000001';
  v_gerente    uuid := 'b0000002-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_loja, 'Onda2Bloco4 Loja', 'O2B4', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente, 'Onda2Bloco4 Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = 'GERENTE', ativo = true, loja_id = EXCLUDED.loja_id;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Caso A — produto + faixa válidos: tudo persiste numa chamada só.
-- ═══════════════════════════════════════════════════════════════════════════
DO $caso_a$
DECLARE
  v_loja    uuid := 'b0000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'b0000002-0000-4000-8000-000000000001';
  v_result  jsonb;
  v_produto_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  v_result := public.criar_produto_com_estoque_inicial(
    jsonb_build_object(
      'nome', 'Onda2Bloco4 Cadeira Vermelha Grande',
      'codigo_barras', '7890000004001',
      'preco_varejo', 220.00,
      'preco_custo', 120.00,
      'origem', 'brasil_nf',
      'estoque_inicial_quantidade', 5
    ),
    v_gerente,
    NULL,
    jsonb_build_object('quantidade_minima', 10, 'preco_unitario', 180.00)
  );

  v_produto_id := (v_result->>'produto_id')::uuid;

  IF NOT (v_result->>'faixa_sincronizada')::boolean THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (Caso A): faixa_sincronizada deveria ser true na resposta da RPC.';
  END IF;

  PERFORM 1 FROM public.produtos WHERE id = v_produto_id AND nome = 'Onda2Bloco4 Cadeira Vermelha Grande';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (Caso A): produto não persistiu.';
  END IF;

  PERFORM 1 FROM public.estoque WHERE produto_id = v_produto_id AND loja_id = v_loja AND quantidade_atual = 5;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (Caso A): estoque inicial não persistiu.';
  END IF;

  PERFORM 1 FROM public.precos_atacado
   WHERE produto_id = v_produto_id AND quantidade_minima = 10 AND preco_unitario = 180.00 AND ativo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (Caso A): faixa de atacado não persistiu — mesma chamada RPC deveria ter gravado tudo.';
  END IF;

  RAISE NOTICE 'Caso A OK: produto + estoque + faixa persistiram atomicamente numa única chamada.';
END
$caso_a$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Caso B — faixa inválida (quantidade_minima = 0): produto NÃO fica
-- parcialmente criado. A validação da faixa roda antes do INSERT em
-- produtos nesta RPC, então nem chega a tentar — sem estado parcial possível.
-- ═══════════════════════════════════════════════════════════════════════════
DO $caso_b$
DECLARE
  v_gerente uuid := 'b0000002-0000-4000-8000-000000000001';
  v_falhou  boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  BEGIN
    PERFORM public.criar_produto_com_estoque_inicial(
      jsonb_build_object(
        'nome', 'Onda2Bloco4 Produto Faixa Invalida',
        'codigo_barras', '7890000004002',
        'preco_varejo', 100.00,
        'origem', 'brasil_nf'
      ),
      v_gerente,
      NULL,
      jsonb_build_object('quantidade_minima', 0, 'preco_unitario', 80.00)
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'CRIAR_PRODUTO_FAIXA_QTD_INVALIDA' THEN v_falhou := true;
    ELSE RAISE EXCEPTION 'BLOCO4_FALHOU (Caso B): erro inesperado: %', SQLERRM; END IF;
  END;

  IF NOT v_falhou THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (BLOCKER, Caso B): faixa com quantidade_minima=0 deveria ter sido rejeitada.';
  END IF;

  PERFORM 1 FROM public.produtos WHERE nome = 'Onda2Bloco4 Produto Faixa Invalida';
  IF FOUND THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (BLOCKER, Caso B): produto foi criado mesmo com faixa inválida — estado parcial.';
  END IF;

  RAISE NOTICE 'Caso B OK: faixa inválida rejeitada, produto não foi criado (sem estado parcial).';
END
$caso_b$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Caso C — produto válido, mas a faixa fica abaixo do custo (sem
-- permitir_abaixo_custo). A trigger de margem em precos_atacado dispara
-- DEPOIS que o INSERT em produtos já rodou dentro da mesma função — prova
-- que a transação inteira desfaz o produto também, não só a faixa.
-- ═══════════════════════════════════════════════════════════════════════════
DO $caso_c$
DECLARE
  v_gerente uuid := 'b0000002-0000-4000-8000-000000000001';
  v_falhou  boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  BEGIN
    PERFORM public.criar_produto_com_estoque_inicial(
      jsonb_build_object(
        'nome', 'Onda2Bloco4 Produto Margem Negativa',
        'codigo_barras', '7890000004003',
        'preco_varejo', 200.00,
        'preco_custo', 150.00,
        'origem', 'brasil_nf'
      ),
      v_gerente,
      NULL,
      -- Faixa abaixo do custo (150.00) — trigger deve recusar.
      jsonb_build_object('quantidade_minima', 10, 'preco_unitario', 90.00)
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'PRECO_ATACADO_ABAIXO_CUSTO' THEN v_falhou := true;
    ELSE RAISE EXCEPTION 'BLOCO4_FALHOU (Caso C): erro inesperado: %', SQLERRM; END IF;
  END;

  IF NOT v_falhou THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (BLOCKER, Caso C): faixa abaixo do custo deveria ter sido bloqueada pela trigger de margem.';
  END IF;

  -- O produto tinha sido inserido ANTES da faixa falhar — prova real de
  -- atomicidade: mesmo já "existindo" dentro da execução da função, o
  -- ROLLBACK implícito do erro não tratado desfaz o INSERT em produtos também.
  PERFORM 1 FROM public.produtos WHERE nome = 'Onda2Bloco4 Produto Margem Negativa';
  IF FOUND THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (BLOCKER, Caso C): produto ficou criado mesmo com a faixa rejeitada — exatamente o estado parcial que esta onda deveria eliminar.';
  END IF;

  PERFORM 1 FROM public.precos_atacado WHERE preco_unitario = 90.00 AND quantidade_minima = 10;
  IF FOUND THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (Caso C): faixa rejeitada não deveria ter deixado linha em precos_atacado.';
  END IF;

  RAISE NOTICE 'Caso C OK: produto + faixa desfeitos juntos quando a faixa viola a margem — sem estado parcial.';
END
$caso_c$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Caso D — regra de margem em `produtos` (preco_varejo abaixo do custo)
-- continua valendo — esta migration não afrouxou nenhuma validação existente.
-- ═══════════════════════════════════════════════════════════════════════════
DO $caso_d$
DECLARE
  v_gerente uuid := 'b0000002-0000-4000-8000-000000000001';
  v_falhou  boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  BEGIN
    PERFORM public.criar_produto_com_estoque_inicial(
      jsonb_build_object(
        'nome', 'Onda2Bloco4 Produto Varejo Abaixo Custo',
        'codigo_barras', '7890000004004',
        'preco_varejo', 50.00,
        'preco_custo', 100.00,
        'origem', 'brasil_nf'
      ),
      v_gerente,
      NULL,
      NULL -- sem faixa — testando só a margem de produtos
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'PRODUTO_VAREJO_ABAIXO_CUSTO' THEN v_falhou := true;
    ELSE RAISE EXCEPTION 'BLOCO4_FALHOU (Caso D): erro inesperado: %', SQLERRM; END IF;
  END;

  IF NOT v_falhou THEN
    RAISE EXCEPTION 'BLOCO4_FALHOU (BLOCKER, Caso D): preco_varejo abaixo do preco_custo deveria continuar bloqueado (regressão de regra financeira).';
  END IF;

  RAISE NOTICE 'Caso D OK: guarda de margem em produtos continua ativa — esta onda não enfraqueceu regra financeira nenhuma.';
END
$caso_d$;

DO $resumo$
BEGIN
  RAISE NOTICE 'ONDA 2 · BLOCO 4 — todos os casos OK: CREATE de produto + faixa de atacado é atômico (Caso A), sem estado parcial em faixa inválida (Caso B) nem em margem negativa (Caso C), e a guarda de margem existente em produtos continua intacta (Caso D).';
END
$resumo$;

ROLLBACK;
