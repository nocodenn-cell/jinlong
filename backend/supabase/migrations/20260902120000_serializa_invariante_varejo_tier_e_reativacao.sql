-- Gate de revisão pós-CI (PR #363) — fecha 3 classes de falha reveladas por
-- review automatizado (Codex) e confirmadas por leitura de código / prova
-- com 2 sessões PostgreSQL reais antes desta migration:
--
-- 1. `trg_validar_tier_preco_menor_que_varejo` (20260901000000) só disparava
--    em UPDATE de preco_unitario/produto_id — nunca em `ativo`. Reativar um
--    tier desativado (ativo=false → true) não era revalidado contra o
--    varejo atual.
-- 2. `trg_validar_varejo_maior_que_tiers_ativos` (20260902100100, deste
--    mesmo PR) lia `NEW.preco_varejo` CONGELADO no momento do evento — se
--    preco_varejo fosse atualizado mais de uma vez na mesma transação
--    (ex.: 100→80→120), o evento do passo intermediário (80) era validado
--    contra um tier que só é problema no passo intermediário, rejeitando
--    uma edição cujo estado FINAL (120) é válido.
-- 3. Nenhuma das duas trigger tomava um lock compartilhado por produto_id.
--    Prova determinística com 2 sessões reais
--    (backend/scripts/test-varejo-tier-concurrency.mjs --reproduzir-bug):
--    T1 baixa produtos.preco_varejo (100→80, ainda sem commit); T2 reativa
--    um tier desativado a 90 (ainda sem commit); a checagem de T1 é forçada
--    a rodar (SET CONSTRAINTS ... IMMEDIATE) enquanto T2 ainda está aberta —
--    T1 não vê a reativação (MVCC), passa; T1 commita; T2 commita sem
--    NENHUMA checagem (achado 1). Estado final persistido:
--    varejo=80, tier ativo=true, preco=90 — invariante violada, sem
--    rejeição de nenhum dos dois lados.
--
-- Correção unificada (as 3 são a mesma invariante, cross-table): as duas
-- trigger passam a ser CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED
-- (checam o estado FINAL da linha no fim da transação, não o NEW do
-- evento) e as duas tomam o MESMO lock advisory por produto_id antes de
-- ler/validar — serializa qualquer combinação de escritores desta
-- invariante (INSERT tier, UPDATE preco_unitario, UPDATE produto_id,
-- reativação via `ativo`, UPDATE de produtos.preco_varejo) sem risco de
-- deadlock por ordem diferente de locks: é sempre UM lock por produto_id,
-- adquirido pela mesma função em ambas as direções.
--
-- Prova pós-fix (mesmo harness, 2 sessões reais, `SET CONSTRAINTS
-- ... IMMEDIATE` para forçar sem depender de timing de wall-clock):
--   1. reativar tier concorrente com baixar varejo (mesmo cenário do achado
--      acima) → estado final NUNCA viola a invariante.
--   2. INSERT de tier novo BLOQUEIA de verdade (prova por timeout) enquanto
--      uma transação concorrente segura o lock do mesmo produto_id via
--      UPDATE de preco_varejo.
--   3. dois UPDATEs de preco_varejo na mesma transação (100→80→120, tier
--      ativo em 90) — o COMMIT aceita o estado final (120), não rejeita
--      pelo passo intermediário (80).
--
-- ROLLBACK: reaplicar 20260901000000_validar_tier_preco_menor_que_varejo.sql
-- e 20260902100100_guard_varejo_menor_que_tier_ativo.sql (perde as 3
-- correções desta migration, reabre a corrida).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Lock compartilhado por produto_id — mesma chave para as duas direções da
-- invariante. Namespace próprio (prefixo no texto do hash) para não colidir
-- com outros usos de advisory lock no mesmo espaço (ex.: venda_id, request_id).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION internal.lock_invariante_varejo_tier(p_produto_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT pg_advisory_xact_lock(hashtextextended('precos_atacado_varejo_invariante:' || p_produto_id::text, 0));
$function$;

COMMENT ON FUNCTION internal.lock_invariante_varejo_tier(uuid) IS
  'Lock advisory (escopo de transação) compartilhado pelas duas triggers da invariante "tier ativo < varejo" — serializa qualquer combinação de escritores de precos_atacado/produtos.preco_varejo para o mesmo produto_id.';

REVOKE ALL ON FUNCTION internal.lock_invariante_varejo_tier(uuid) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Lado do tier: cobre `ativo`, defere para o commit, toma o lock, relê o
-- estado FINAL da linha (não o NEW do evento).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validar_tier_preco_menor_que_varejo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_preco_varejo numeric;
BEGIN
  -- Lock pelo produto do evento primeiro: cobre o caso comum (produto_id não
  -- muda depois) e serializa contra qualquer UPDATE concorrente de
  -- produtos.preco_varejo desse produto antes mesmo de ler a linha.
  PERFORM internal.lock_invariante_varejo_tier(NEW.produto_id);

  SELECT id, produto_id, preco_unitario, ativo INTO v_row
  FROM public.precos_atacado
  WHERE id = NEW.id;

  IF NOT FOUND OR NOT v_row.ativo THEN
    RETURN NEW; -- linha apagada depois do evento, ou tier inativo no estado final: nada a validar.
  END IF;

  -- produto_id pode ter mudado de novo depois do evento (ex.: reatribuído a
  -- outro produto numa correção subsequente na mesma transação) — o lock
  -- certo, nesse caso, é o do produto ATUAL da linha.
  IF v_row.produto_id IS DISTINCT FROM NEW.produto_id THEN
    PERFORM internal.lock_invariante_varejo_tier(v_row.produto_id);
  END IF;

  SELECT p.preco_varejo INTO v_preco_varejo
  FROM public.produtos p
  WHERE p.id = v_row.produto_id;

  IF v_preco_varejo IS NOT NULL AND v_row.preco_unitario >= v_preco_varejo THEN
    RAISE EXCEPTION 'TIER_PRECO_MAIOR_OU_IGUAL_VAREJO: preco_unitario (%) deve ser menor que preco_varejo (%) do produto %',
      v_row.preco_unitario, v_preco_varejo, v_row.produto_id
      USING ERRCODE = '23514'; -- check_violation, mesmo código de um CHECK constraint
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.validar_tier_preco_menor_que_varejo() IS
  'Rejeita (no commit da transação — constraint trigger deferrable) um tier ATIVO cujo preco_unitario final fique >= produtos.preco_varejo. Cobre INSERT, UPDATE de preco_unitario/produto_id/ativo (inclusive reativação). Lê o estado FINAL da linha via SELECT por id, não o NEW congelado do evento. Toma lock por produto_id compartilhado com validar_varejo_maior_que_tiers_ativos() para serializar contra a outra ponta da mesma invariante.';

DROP TRIGGER IF EXISTS trg_validar_tier_preco_menor_que_varejo ON public.precos_atacado;
CREATE CONSTRAINT TRIGGER trg_validar_tier_preco_menor_que_varejo
  AFTER INSERT OR UPDATE OF preco_unitario, produto_id, ativo ON public.precos_atacado
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validar_tier_preco_menor_que_varejo();

-- ═══════════════════════════════════════════════════════════════════════════
-- Lado do varejo: relê produtos.preco_varejo ao vivo (não o NEW congelado),
-- toma o mesmo lock.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validar_varejo_maior_que_tiers_ativos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preco_varejo_atual numeric;
  v_tier record;
BEGIN
  PERFORM internal.lock_invariante_varejo_tier(NEW.id);

  SELECT preco_varejo INTO v_preco_varejo_atual
  FROM public.produtos
  WHERE id = NEW.id;

  IF NOT FOUND THEN
    RETURN NEW; -- produto apagado depois do evento: nada a validar.
  END IF;

  SELECT pa.id, pa.quantidade_minima, pa.preco_unitario INTO v_tier
  FROM public.precos_atacado pa
  WHERE pa.produto_id = NEW.id
    AND pa.ativo = true
    AND pa.preco_unitario >= v_preco_varejo_atual
  ORDER BY pa.preco_unitario DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'VAREJO_MENOR_OU_IGUAL_TIER_ATIVO: novo preco_varejo (%) ficaria <= tier ativo (qtd_min=%, preco=%) do produto %. Desative ou ajuste o tier antes de baixar o varejo.',
      v_preco_varejo_atual, v_tier.quantidade_minima, v_tier.preco_unitario, NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validar_varejo_maior_que_tiers_ativos() IS
  'Gate A04-4.2 (2026-09-02, revisado pós-CI): rejeita (no commit — constraint trigger deferrable) um preco_varejo final que deixaria algum tier ativo de precos_atacado >= o varejo. Relê produtos.preco_varejo AO VIVO por id (não o NEW congelado do evento) — necessário quando preco_varejo é alterado mais de uma vez na mesma transação. Toma lock por produto_id compartilhado com validar_tier_preco_menor_que_varejo().';

-- Trigger em si não muda de forma (já era AFTER UPDATE OF preco_varejo ON
-- produtos DEFERRABLE INITIALLY DEFERRED, definida em 20260902100100) — só
-- o corpo da função, que CREATE OR REPLACE já propaga sem recriar o objeto
-- trigger.

REVOKE ALL ON FUNCTION public.validar_tier_preco_menor_que_varejo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_varejo_maior_que_tiers_ativos() FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_def text;
  v_tgdef text;
BEGIN
  v_def := pg_get_functiondef('public.validar_tier_preco_menor_que_varejo()'::regprocedure);
  IF position('internal.lock_invariante_varejo_tier' IN v_def) = 0 THEN
    RAISE EXCEPTION 'GATE_REVISAO_LOCK_TIER_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.validar_varejo_maior_que_tiers_ativos()'::regprocedure);
  IF position('internal.lock_invariante_varejo_tier' IN v_def) = 0 THEN
    RAISE EXCEPTION 'GATE_REVISAO_LOCK_VAREJO_AUSENTE';
  END IF;
  IF position('NEW.preco_varejo' IN v_def) > 0 THEN
    RAISE EXCEPTION 'GATE_REVISAO_VAREJO_AINDA_LE_NEW_CONGELADO';
  END IF;

  SELECT pg_get_triggerdef(oid) INTO v_tgdef
  FROM pg_trigger WHERE tgname = 'trg_validar_tier_preco_menor_que_varejo';
  IF position('ativo' IN v_tgdef) = 0 THEN
    RAISE EXCEPTION 'GATE_REVISAO_TRIGGER_TIER_NAO_COBRE_ATIVO';
  END IF;
  IF position('DEFERRABLE' IN v_tgdef) = 0 THEN
    RAISE EXCEPTION 'GATE_REVISAO_TRIGGER_TIER_NAO_DEFERRABLE';
  END IF;

  IF has_function_privilege('anon', 'internal.lock_invariante_varejo_tier(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'internal.lock_invariante_varejo_tier(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'GATE_REVISAO_LOCK_HELPER_GRANT_INDEVIDO';
  END IF;
END
$verify$;

COMMIT;
