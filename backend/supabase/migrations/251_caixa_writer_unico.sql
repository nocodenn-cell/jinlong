-- Fase 1 — CAIXA: writer único de abertura + invariante de banco + fechamento
-- idempotente para o sync (at-least-once).
--
-- Conteúdo:
--   1. abrir_caixa_atomico  — RPC única de abertura (web via auth.uid(); sync via
--      service_role com id explícito). Substitui os dois INSERT diretos em caixas
--      (caixaSessaoOperador.impl.ts e sync-outbox/ensureCaixaPdv).
--   2. Índice único parcial: no máximo 1 caixa ABERTO por operador (mata o race
--      check-then-insert independentemente do writer).
--   3. fechar_caixa_pdv_atomico — reescrita idempotente: já FECHADO retorna
--      o_ja_fechado=true SEM exception (evita retry storm do outbox).

-- =============================================================================
-- 2 (primeiro, pois a RPC de abertura depende do invariante): índice parcial.
--    Pré-checagem: falha com mensagem clara se já houver duplicatas em produção.
-- =============================================================================
DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(operador_id::text || ' (' || n || ' abertos)', ', ')
  INTO   v_dups
  FROM (
    SELECT operador_id, count(*) AS n
    FROM   public.caixas
    WHERE  status = 'ABERTO' AND operador_id IS NOT NULL
    GROUP  BY operador_id
    HAVING count(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      'ABRIR_CAIXA_INVARIANTE_VIOLADO: operadores com múltiplos caixas ABERTO: %. Feche os duplicados antes de aplicar esta migration.',
      v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS caixas_operador_unico_aberto
  ON public.caixas (operador_id)
  WHERE status = 'ABERTO';

COMMENT ON INDEX public.caixas_operador_unico_aberto IS
  'Invariante Fase 1: no máximo 1 caixa ABERTO por operador. Base do writer único de abertura.';

-- =============================================================================
-- 1. abrir_caixa_atomico — RPC única de abertura.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.abrir_caixa_atomico(
  p_valor_inicial numeric,
  p_operador_id   uuid DEFAULT NULL,
  p_caixa_id      uuid DEFAULT NULL,
  p_loja_id       uuid DEFAULT NULL
)
RETURNS TABLE (
  o_caixa_id uuid,
  o_status   text,
  o_ja_aberto boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_operador       uuid;
  v_caixa_id       uuid;
  v_loja           uuid;
  v_new_id         uuid;
  v_existing_id    uuid;
  v_existing_stat  text;
  c_loja_matriz    CONSTANT uuid := 'a0000001-0000-4000-8000-000000000001';
BEGIN
  -- Autoridade de operador segura: auth.uid() (web) tem precedência; um usuário
  -- authenticated NÃO consegue abrir caixa para outro operador. p_operador_id só
  -- vale no caminho service_role (auth.uid() IS NULL).
  v_operador := COALESCE(v_uid, p_operador_id);
  IF v_operador IS NULL THEN
    RAISE EXCEPTION 'ABRIR_CAIXA_OPERADOR_OBRIGATORIO';
  END IF;

  -- Id explícito só no caminho service (sync/PDV). No web o id é sempre gerado.
  v_caixa_id := CASE WHEN v_uid IS NULL THEN p_caixa_id ELSE NULL END;

  -- Idempotência (replay do PDV): id já existe → retorna sem inserir.
  IF v_caixa_id IS NOT NULL THEN
    SELECT c.id, c.status INTO v_existing_id, v_existing_stat
    FROM public.caixas c WHERE c.id = v_caixa_id;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing_id, v_existing_stat, true;
      RETURN;
    END IF;
  END IF;

  v_loja := COALESCE(
    p_loja_id,
    (SELECT u.loja_id FROM public.usuarios u WHERE u.id = v_operador),
    c_loja_matriz
  );

  BEGIN
    INSERT INTO public.caixas (id, operador_id, loja_id, valor_inicial, status)
    VALUES (
      COALESCE(v_caixa_id, gen_random_uuid()),
      v_operador,
      v_loja,
      ROUND(COALESCE(p_valor_inicial, 0), 2),
      'ABERTO'
    )
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    -- Índice parcial disparou (operador já com caixa ABERTO) ou id colidiu.
    IF v_caixa_id IS NOT NULL THEN
      -- Replay concorrente: retorna o existente (idempotente).
      SELECT c.id, c.status INTO v_existing_id, v_existing_stat
      FROM public.caixas c WHERE c.id = v_caixa_id;
      IF FOUND THEN
        RETURN QUERY SELECT v_existing_id, v_existing_stat, true;
        RETURN;
      END IF;
    END IF;
    RAISE EXCEPTION 'ABRIR_CAIXA_JA_ABERTO';
  END;

  RETURN QUERY SELECT v_new_id, 'ABERTO'::text, false;
END;
$$;

REVOKE ALL ON FUNCTION public.abrir_caixa_atomico(numeric, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.abrir_caixa_atomico(numeric, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_caixa_atomico(numeric, uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.abrir_caixa_atomico(numeric, uuid, uuid, uuid) IS
  'Writer único de abertura de caixa. Web: auth.uid() (id gerado). Sync/service: p_operador_id + p_caixa_id explícito e idempotente. Invariante via índice caixas_operador_unico_aberto.';

-- =============================================================================
-- 3. fechar_caixa_pdv_atomico — reescrita IDEMPOTENTE (novo o_ja_fechado).
--    Muda a assinatura de retorno → exige DROP + CREATE.
-- =============================================================================
DROP FUNCTION IF EXISTS public.fechar_caixa_pdv_atomico(uuid, numeric, text, timestamptz);

CREATE FUNCTION public.fechar_caixa_pdv_atomico(
  p_caixa_id         uuid,
  p_valor_contado    numeric,
  p_observacao       text DEFAULT NULL,
  p_data_fechamento  timestamptz DEFAULT NULL
)
RETURNS TABLE (
  o_caixa_id      uuid,
  o_valor_sistema numeric(10,2),
  o_valor_contado numeric(10,2),
  o_diferenca     numeric(10,2),
  o_ja_fechado    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caixa_id        uuid;
  v_status          text;
  v_valor_fech      numeric(10,2);
  v_fech_diferenca  numeric(10,2);
  v_valor_sistema   numeric(10,2);
  v_diferenca       numeric(10,2);
  v_motivo          text;
  v_data_fech       timestamptz;
BEGIN
  IF p_caixa_id IS NULL THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_PDV_ID_OBRIGATORIO';
  END IF;

  SELECT c.id, c.status, c.valor_fechamento, c.fechamento_diferenca
  INTO   v_caixa_id, v_status, v_valor_fech, v_fech_diferenca
  FROM   public.caixas c
  WHERE  c.id = p_caixa_id
  FOR UPDATE;

  -- Id realmente ausente é anomalia (abertura precede fechamento). Erro real.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_PDV_NAO_ENCONTRADO';
  END IF;

  -- Idempotente: já FECHADO → retorna valores persistidos SEM exception.
  -- Isso evita retry storm no sync-outbox (at-least-once).
  IF v_status = 'FECHADO' THEN
    RETURN QUERY SELECT
      v_caixa_id,
      ROUND(COALESCE(v_valor_fech, 0) - COALESCE(v_fech_diferenca, 0), 2)::numeric(10,2),
      ROUND(COALESCE(v_valor_fech, 0), 2)::numeric(10,2),
      ROUND(COALESCE(v_fech_diferenca, 0), 2)::numeric(10,2),
      true;
    RETURN;
  END IF;

  IF v_status <> 'ABERTO' THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_PDV_STATUS_INVALIDO: %', v_status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM   public.movimentacoes_caixa m
    WHERE  m.caixa_id   = v_caixa_id
      AND  m.status     = 'pendente'
      AND  m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_PDV_MOVIMENTACOES_PENDENTES';
  END IF;

  v_valor_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  v_diferenca     := ROUND(p_valor_contado - v_valor_sistema, 2);
  v_motivo        := TRIM(COALESCE(p_observacao, ''));
  v_data_fech     := COALESCE(p_data_fechamento, now());

  UPDATE public.caixas
  SET
    status                = 'FECHADO',
    data_fechamento       = v_data_fech,
    valor_fechamento      = ROUND(p_valor_contado, 2),
    fechamento_diferenca  = v_diferenca,
    fechamento_observacao = NULLIF(v_motivo, '')
  WHERE id = v_caixa_id;

  RETURN QUERY SELECT
    v_caixa_id,
    v_valor_sistema,
    ROUND(p_valor_contado, 2)::numeric(10,2),
    v_diferenca,
    false;
END;
$$;

REVOKE ALL ON FUNCTION public.fechar_caixa_pdv_atomico(uuid, numeric, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fechar_caixa_pdv_atomico(uuid, numeric, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.fechar_caixa_pdv_atomico(uuid, numeric, text, timestamptz) IS
  'Fecha caixa do PDV/sync: FOR UPDATE + cálculo + UPDATE em transação única. Idempotente: já FECHADO retorna o_ja_fechado=true sem exception (evita retry storm do outbox at-least-once).';
