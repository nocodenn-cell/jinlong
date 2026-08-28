-- Fase 4 do plano de remediação Jīn Lóng — DIV-D0-021.
-- Regressão de 20260828150000_fase4_remessa_idempotencia_payload_hash.sql.
--
-- Prova as 3 propriedades da correção:
--   1. Replay com o MESMO payload -> retorna o mesmo ID, silencioso (retry
--      de verdade não pode virar erro).
--   2. Replay da MESMA idempotency_key com payload DIFERENTE (quantidade
--      corrigida) -> RAISE EXCEPTION explícita, não sucesso silencioso com
--      dado antigo (era exatamente o defeito da DIV-D0-021).
--   3. A remessa criada na primeira chamada grava `payload_hash` não nulo.
--
-- Dados sintéticos, tudo dentro de uma transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja uuid := 'e0000001-0000-4000-8000-000000000001';
  v_gerente uuid := 'e0000002-0000-4000-8000-000000000001';
  v_categoria uuid := 'e0000003-0000-4000-8000-000000000001';
  v_produto uuid := 'e0000004-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (v_loja, 'Fase4 Loja', 'FASE4-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES (v_gerente, 'Fase4 Gerente', 'GERENTE', true, v_loja)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id;

  INSERT INTO public.categorias (id, nome) VALUES (v_categoria, 'Fase4 Categoria')
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  INSERT INTO public.produtos (id, codigo_barras, nome, categoria_id, preco_varejo, origem, tem_nf, ativo, loja_id)
  VALUES (v_produto, '7899999990002', 'Fase4 Produto', v_categoria, 10.00, 'china_manual', false, true, v_loja)
  ON CONFLICT (id) DO UPDATE SET ativo = true, loja_id = EXCLUDED.loja_id;
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Cria remessa; 2) replay com mesmo payload devolve o mesmo ID;
-- 3) replay com quantidade diferente é rejeitado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $fase4_idempotencia$
DECLARE
  v_gerente uuid := 'e0000002-0000-4000-8000-000000000001';
  v_produto uuid := 'e0000004-0000-4000-8000-000000000001';
  v_replay_id text := 'fase4-idempotencia-' || gen_random_uuid()::text;
  v_id_original uuid;
  v_id_replay_igual uuid;
  v_hash_gravado text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);

  v_id_original := public.criar_confirmar_remessa_entrada(
    'Fase4 origem', 'Fase4 observação original',
    jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade_esperada', 5, 'quantidade_conferida', 5)),
    v_replay_id
  );

  SELECT payload_hash INTO v_hash_gravado FROM public.remessas WHERE id = v_id_original;
  IF v_hash_gravado IS NULL THEN
    RAISE EXCEPTION 'FASE4_FALHOU: payload_hash não foi gravado na criação';
  END IF;
  RAISE NOTICE 'Setup OK: remessa % criada, payload_hash gravado.', v_id_original;

  -- Replay com o MESMO payload (mesma chave, mesmos itens) -> mesmo ID, sem erro.
  v_id_replay_igual := public.criar_confirmar_remessa_entrada(
    'Fase4 origem', 'Fase4 observação original',
    jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade_esperada', 5, 'quantidade_conferida', 5)),
    v_replay_id
  );
  IF v_id_replay_igual IS DISTINCT FROM v_id_original THEN
    RAISE EXCEPTION 'FASE4_FALHOU: replay com payload igual não devolveu o mesmo ID (% vs %)', v_id_original, v_id_replay_igual;
  END IF;
  RAISE NOTICE 'Positivo OK: replay com payload idêntico devolveu o mesmo ID (retry real não quebrou).';

  -- Replay da MESMA chave com quantidade CORRIGIDA -> deve falhar explicitamente,
  -- não devolver sucesso silencioso com o ID antigo (DIV-D0-021).
  BEGIN
    PERFORM public.criar_confirmar_remessa_entrada(
      'Fase4 origem', 'Fase4 observação original',
      jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade_esperada', 5, 'quantidade_conferida', 9)),
      v_replay_id
    );
    RAISE EXCEPTION 'FASE4_FALHOU: replay com quantidade divergente devolveu sucesso silencioso (DIV-D0-021 reaberta)';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE%' THEN RAISE; END IF;
      RAISE NOTICE 'Negativo OK (DIV-D0-021): replay com payload divergente foi rejeitado explicitamente (%).', SQLERRM;
  END;
END
$fase4_idempotencia$;

SELECT 'FASE4 REMESSA IDEMPOTENCIA PAYLOAD HASH: OK' AS resultado;
ROLLBACK;
