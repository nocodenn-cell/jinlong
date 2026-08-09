-- ============================================================
-- Fase 3.2 — Reaplicação idempotente: venda_finance_context
--
-- Contexto: produção registra migration 252 como applied, porém objetos
-- ausentes no catálogo (drift tracking × schema). NÃO reexecutar chave 252.
--
-- SSOT corpo: derivado de 252_venda_finance_context_mirror.sql (SHA256
-- 96f45cd68c54521ee5ce557a2cd172ba73c556c2458f1f0d23327a3eac2ac295).
--
-- Idempotência: IF NOT EXISTS, DROP IF EXISTS, CREATE OR REPLACE,
-- ON CONFLICT no UPSERT interno da função sincronizar_*.
--
-- HUMAN GATE: não aplicar em produção via MCP/CLI até staging verde + review.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1) Tabela espelho
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venda_finance_context (
  venda_id uuid PRIMARY KEY REFERENCES public.vendas(id) ON DELETE CASCADE,
  loja_id uuid REFERENCES public.lojas(id),
  status_pagamento text NOT NULL DEFAULT 'PAGO'
    CHECK (status_pagamento IN ('PAGO', 'PARCIAL', 'ABERTO')),
  origem_pagamento text NOT NULL DEFAULT 'CAIXA'
    CHECK (origem_pagamento IN ('CAIXA', 'FIADO', 'MISTO')),
  cliente_id uuid REFERENCES public.clientes(id),
  conta_referencia uuid REFERENCES public.contas_receber(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venda_finance_context IS
  'Espelho passivo do status financeiro originado pela venda. Mirror unidirecional: derivado de vendas/vendas_pagamentos/contas_receber. Não é fonte de verdade — caixa (liquidez) e contas_receber (financeiro) permanecem autoridades.';
COMMENT ON COLUMN public.venda_finance_context.status_pagamento IS
  'PAGO = sem parcela FIADO; ABERTO = totalmente FIADO; PARCIAL = misto. Classificado por forma_pagamento, sem recálculo monetário.';
COMMENT ON COLUMN public.venda_finance_context.origem_pagamento IS
  'CAIXA = liquidado no caixa; FIADO = a receber; MISTO = ambos.';
COMMENT ON COLUMN public.venda_finance_context.conta_referencia IS
  'Vínculo opcional para a conta_receber já existente desta venda (se houver).';

CREATE INDEX IF NOT EXISTS idx_venda_finance_context_loja
  ON public.venda_finance_context(loja_id);
CREATE INDEX IF NOT EXISTS idx_venda_finance_context_status
  ON public.venda_finance_context(status_pagamento);
CREATE INDEX IF NOT EXISTS idx_venda_finance_context_conta
  ON public.venda_finance_context(conta_referencia);

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.venda_finance_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venda_finance_context_select_loja" ON public.venda_finance_context;
CREATE POLICY "venda_finance_context_select_loja"
  ON public.venda_finance_context FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND u.loja_id = venda_finance_context.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Função sincronizar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sincronizar_finance_context_venda(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda            record;
  v_loja_id          uuid;
  v_total_fiado      numeric := 0;
  v_total_outros     numeric := 0;
  v_tem_pagamentos   boolean := false;
  v_status           text;
  v_origem           text;
  v_conta_id         uuid;
  v_cliente_id       uuid;
BEGIN
  IF p_venda_id IS NULL THEN
    RETURN;
  END IF;

  SELECT v.id, v.forma_pagamento, v.caixa_id
  INTO v_venda
  FROM public.vendas v
  WHERE v.id = p_venda_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT c.loja_id INTO v_loja_id
  FROM public.caixas c WHERE c.id = v_venda.caixa_id;

  SELECT
    COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'FIADO'), 0),
    COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento <> 'FIADO'), 0),
    COUNT(*) > 0
  INTO v_total_fiado, v_total_outros, v_tem_pagamentos
  FROM public.vendas_pagamentos vp
  WHERE vp.venda_id = p_venda_id;

  IF NOT v_tem_pagamentos THEN
    IF COALESCE(v_venda.forma_pagamento, '') = 'FIADO' THEN
      v_status := 'ABERTO'; v_origem := 'FIADO';
    ELSE
      v_status := 'PAGO'; v_origem := 'CAIXA';
    END IF;
  ELSIF v_total_fiado = 0 THEN
    v_status := 'PAGO'; v_origem := 'CAIXA';
  ELSIF v_total_outros = 0 THEN
    v_status := 'ABERTO'; v_origem := 'FIADO';
  ELSE
    v_status := 'PARCIAL'; v_origem := 'MISTO';
  END IF;

  SELECT cr.id, cr.cliente_id
  INTO v_conta_id, v_cliente_id
  FROM public.contas_receber cr
  WHERE cr.venda_id = p_venda_id
  ORDER BY cr.created_at ASC
  LIMIT 1;

  INSERT INTO public.venda_finance_context AS fc (
    venda_id, loja_id, status_pagamento, origem_pagamento,
    cliente_id, conta_referencia, atualizado_em
  ) VALUES (
    p_venda_id, v_loja_id, v_status, v_origem,
    v_cliente_id, v_conta_id, now()
  )
  ON CONFLICT (venda_id) DO UPDATE SET
    loja_id          = EXCLUDED.loja_id,
    status_pagamento = EXCLUDED.status_pagamento,
    origem_pagamento = EXCLUDED.origem_pagamento,
    cliente_id       = COALESCE(EXCLUDED.cliente_id, fc.cliente_id),
    conta_referencia = EXCLUDED.conta_referencia,
    atualizado_em    = now();
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_finance_context_venda(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sincronizar_finance_context_venda(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_finance_context_venda(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_finance_context_via_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sincronizar_finance_context_venda(NEW.venda_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_finance_context_via_conta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.venda_id IS NOT NULL THEN
    PERFORM public.sincronizar_finance_context_venda(NEW.venda_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_context_pagamento ON public.vendas_pagamentos;
CREATE TRIGGER trg_finance_context_pagamento
  AFTER INSERT ON public.vendas_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_finance_context_via_pagamento();

DROP TRIGGER IF EXISTS trg_finance_context_conta ON public.contas_receber;
CREATE TRIGGER trg_finance_context_conta
  AFTER INSERT OR UPDATE OF venda_id, cliente_id ON public.contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_finance_context_via_conta();

-- ---------------------------------------------------------------------------
-- 5) Backfill (idempotente via UPSERT na função)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.vendas WHERE status = 'CONCLUIDA' LOOP
    PERFORM public.sincronizar_finance_context_venda(r.id);
  END LOOP;
END;
$$;
