-- ============================================================
-- Migration 109: Ordens de Compra (schema)
-- Rastreamento de pedidos antes do recebimento.
-- RPC de recebimento: 110_receber_ordem_compra.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ordens_compra (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id               UUID         NOT NULL REFERENCES public.lojas(id),
  fornecedor_id         UUID         REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome       TEXT,
  status                TEXT         NOT NULL DEFAULT 'RASCUNHO'
                                     CHECK (status IN (
                                       'RASCUNHO','CONFIRMADA','EM_TRANSITO','RECEBIDA','CANCELADA'
                                     )),
  data_emissao          DATE         NOT NULL DEFAULT CURRENT_DATE,
  data_prevista_chegada DATE,
  observacao            TEXT,
  created_by            UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ordens_compra_itens (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id             UUID          NOT NULL REFERENCES public.ordens_compra(id) ON DELETE CASCADE,
  produto_id           UUID          REFERENCES public.produtos(id) ON DELETE SET NULL,
  descricao            TEXT,
  quantidade           NUMERIC(12,3) NOT NULL CHECK (quantidade > 0),
  preco_unitario       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (preco_unitario >= 0),
  quantidade_recebida  NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantidade_recebida >= 0),
  unidade_medida       TEXT          NOT NULL DEFAULT 'UN',
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT oci_descricao_ou_produto
    CHECK (produto_id IS NOT NULL OR (descricao IS NOT NULL AND descricao <> ''))
);

CREATE INDEX IF NOT EXISTS idx_oc_loja_status
  ON public.ordens_compra(loja_id, status);
CREATE INDEX IF NOT EXISTS idx_oc_fornecedor
  ON public.ordens_compra(fornecedor_id) WHERE fornecedor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_created_at
  ON public.ordens_compra(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oci_ordem
  ON public.ordens_compra_itens(ordem_id);
CREATE INDEX IF NOT EXISTS idx_oci_produto
  ON public.ordens_compra_itens(produto_id) WHERE produto_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.oc_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_updated_at ON public.ordens_compra;
CREATE TRIGGER trg_oc_updated_at
  BEFORE UPDATE ON public.ordens_compra
  FOR EACH ROW EXECUTE FUNCTION public.oc_set_updated_at();

ALTER TABLE public.ordens_compra       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_compra_itens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ordens_compra' AND policyname = 'oc_auth'
  ) THEN
    CREATE POLICY oc_auth ON public.ordens_compra
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ordens_compra_itens' AND policyname = 'oci_auth'
  ) THEN
    CREATE POLICY oci_auth ON public.ordens_compra_itens
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
