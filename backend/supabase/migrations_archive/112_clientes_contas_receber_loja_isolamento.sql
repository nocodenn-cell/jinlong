-- ============================================================
-- Migration 112: Isolamento multi-tenant — clientes e contas_receber
--
-- Vulnerabilidade V4 (auditoria 2026-05-27):
-- As policies RLS de clientes/contas_receber/liquidacoes_receber
-- validavam apenas cargo (GERENTE/DONO) sem filtrar loja_id,
-- permitindo cross-tenant data exposure entre lojas.
--
-- Fix:
--   1. Adiciona loja_id a contas_receber e clientes.
--   2. Backfill: contas_receber via venda→caixa; clientes via
--      contas_receber. Fallback para Matriz (UUID fixo 032).
--   3. NOT NULL + FK + índices.
--   4. Substitui todas as policies por versões com filtro loja.
--   5. Atualiza registrar_liquidacao_receber() com check de loja.
--
-- Idempotente: usa IF NOT EXISTS / DROP IF EXISTS / IF NOT FOUND.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1) contas_receber — adiciona loja_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id);

-- Backfill via venda → caixa
UPDATE public.contas_receber cr
SET    loja_id = cx.loja_id
FROM   public.vendas v
INNER  JOIN public.caixas cx ON cx.id = v.caixa_id
WHERE  cr.venda_id = v.id
  AND  cr.loja_id IS NULL;

-- Fallback: linhas sem venda associada → Matriz
UPDATE public.contas_receber
SET    loja_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE  loja_id IS NULL;

ALTER TABLE public.contas_receber
  ALTER COLUMN loja_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contas_receber_loja ON public.contas_receber(loja_id);

-- ---------------------------------------------------------------------------
-- 2) clientes — adiciona loja_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id);

-- Backfill via contas_receber (usa a loja do CR mais recente do cliente)
UPDATE public.clientes cl
SET    loja_id = (
  SELECT cr.loja_id
  FROM   public.contas_receber cr
  WHERE  cr.cliente_id = cl.id
  ORDER  BY cr.created_at DESC
  LIMIT  1
)
WHERE  cl.loja_id IS NULL;

-- Fallback: clientes sem histórico → Matriz
UPDATE public.clientes
SET    loja_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE  loja_id IS NULL;

ALTER TABLE public.clientes
  ALTER COLUMN loja_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_loja ON public.clientes(loja_id);

-- ---------------------------------------------------------------------------
-- 3) clientes — policies RLS com filtro de loja
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "clientes_gerente" ON public.clientes;

-- SELECT: GERENTE/DONO (mesma loja), ADMIN (global), OPERADOR (mesma loja — leitura no PDV)
CREATE POLICY clientes_select_loja
  ON public.clientes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  (
               u.perfil = 'ADMIN'
               OR u.loja_id = clientes.loja_id
             )
    )
  );

-- INSERT/UPDATE/DELETE: somente GERENTE/DONO/ADMIN da mesma loja
CREATE POLICY clientes_write_gerente_loja
  ON public.clientes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = clientes.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = clientes.loja_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4) contas_receber — policies RLS com filtro de loja
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "contas_receber_gerente" ON public.contas_receber;

CREATE POLICY contas_receber_select_loja
  ON public.contas_receber FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = contas_receber.loja_id)
    )
  );

CREATE POLICY contas_receber_write_gerente_loja
  ON public.contas_receber
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = contas_receber.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE  u.id = auth.uid()
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = contas_receber.loja_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 5) liquidacoes_receber — policies RLS via join com contas_receber.loja_id
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "liquidacoes_gerente" ON public.liquidacoes_receber;

CREATE POLICY liquidacoes_select_loja
  ON public.liquidacoes_receber FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.contas_receber cr
      INNER  JOIN public.usuarios u ON u.id = auth.uid()
      WHERE  cr.id = liquidacoes_receber.titulo_id
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = cr.loja_id)
    )
  );

CREATE POLICY liquidacoes_write_gerente_loja
  ON public.liquidacoes_receber
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.contas_receber cr
      INNER  JOIN public.usuarios u ON u.id = auth.uid()
      WHERE  cr.id = liquidacoes_receber.titulo_id
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = cr.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM   public.contas_receber cr
      INNER  JOIN public.usuarios u ON u.id = auth.uid()
      WHERE  cr.id = titulo_id
        AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND  (u.perfil = 'ADMIN' OR u.loja_id = cr.loja_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 6) registrar_liquidacao_receber() — valida loja antes de liquidar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_liquidacao_receber(
  p_titulo_id       uuid,
  p_valor           numeric,
  p_forma_pagamento text,
  p_observacao      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid    := auth.uid();
  v_aberto numeric;
  v_loja_titulo uuid;
  v_loja_usuario uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'LIQUIDACAO_AUTH';
  END IF;

  -- Valida cargo E loja do usuário
  SELECT u.loja_id INTO v_loja_usuario
  FROM   public.usuarios u
  WHERE  u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIQUIDACAO_PERFIL';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'LIQUIDACAO_VALOR';
  END IF;

  SELECT c.valor_aberto, c.loja_id
  INTO   v_aberto, v_loja_titulo
  FROM   public.contas_receber c
  WHERE  c.id = p_titulo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIQUIDACAO_TITULO';
  END IF;

  -- ADMIN pode liquidar qualquer loja; os demais apenas a própria loja
  IF (SELECT perfil FROM public.usuarios WHERE id = v_uid) <> 'ADMIN'
     AND v_loja_titulo <> v_loja_usuario THEN
    RAISE EXCEPTION 'LIQUIDACAO_LOJA_DIVERGENTE';
  END IF;

  IF p_valor > v_aberto THEN
    RAISE EXCEPTION 'LIQUIDACAO_EXCEDE_ABERTO';
  END IF;

  INSERT INTO public.liquidacoes_receber (
    titulo_id, valor, forma_pagamento, observacao, created_by
  ) VALUES (
    p_titulo_id, p_valor, p_forma_pagamento, p_observacao, v_uid
  );

  UPDATE public.contas_receber c
  SET
    valor_aberto = c.valor_aberto - p_valor,
    status = CASE
      WHEN c.valor_aberto - p_valor <= 0.009 THEN 'QUITADO'::text
      ELSE 'PARCIAL'::text
    END
  WHERE c.id = p_titulo_id;
END;
$$;

REVOKE ALL   ON FUNCTION public.registrar_liquidacao_receber(uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_liquidacao_receber(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_liquidacao_receber(uuid, numeric, text, text) TO service_role;

COMMENT ON FUNCTION public.registrar_liquidacao_receber(uuid, numeric, text, text) IS
  'Registra liquidação de um título de contas a receber. Valida loja do título vs. loja do usuário (ADMIN ignora). V2 — adicionado check de loja (migration 112).';
