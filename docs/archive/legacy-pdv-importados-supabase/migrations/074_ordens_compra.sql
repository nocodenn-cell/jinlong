-- ============================================================
-- Migration 074: Ordens de Compra
-- Rastreamento de pedidos antes do recebimento, com controle
-- de status (Rascunho → Confirmada → Em Trânsito → Recebida)
-- e comparação entre qtd. pedida e qtd. recebida por item.
-- ============================================================

-- Cabeçalho da Ordem de Compra
CREATE TABLE IF NOT EXISTS ordens_compra (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id               UUID         NOT NULL REFERENCES lojas(id),
  fornecedor_id         UUID         REFERENCES fornecedores(id) ON DELETE SET NULL,
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

-- Itens da Ordem de Compra
CREATE TABLE IF NOT EXISTS ordens_compra_itens (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id             UUID          NOT NULL REFERENCES ordens_compra(id) ON DELETE CASCADE,
  produto_id           UUID          REFERENCES produtos(id) ON DELETE SET NULL,
  descricao            TEXT,
  quantidade           NUMERIC(12,3) NOT NULL CHECK (quantidade > 0),
  preco_unitario       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (preco_unitario >= 0),
  quantidade_recebida  NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantidade_recebida >= 0),
  unidade_medida       TEXT          NOT NULL DEFAULT 'UN',
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT oci_descricao_ou_produto
    CHECK (produto_id IS NOT NULL OR (descricao IS NOT NULL AND descricao <> ''))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_oc_loja_status
  ON ordens_compra(loja_id, status);
CREATE INDEX IF NOT EXISTS idx_oc_fornecedor
  ON ordens_compra(fornecedor_id) WHERE fornecedor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_created_at
  ON ordens_compra(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oci_ordem
  ON ordens_compra_itens(ordem_id);
CREATE INDEX IF NOT EXISTS idx_oci_produto
  ON ordens_compra_itens(produto_id) WHERE produto_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION oc_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_updated_at ON ordens_compra;
CREATE TRIGGER trg_oc_updated_at
  BEFORE UPDATE ON ordens_compra
  FOR EACH ROW EXECUTE FUNCTION oc_set_updated_at();

-- RLS: permissivo para autenticados (controle de acesso no app via assertGerenteOuDono)
ALTER TABLE ordens_compra       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordens_compra_itens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ordens_compra' AND policyname = 'oc_auth'
  ) THEN
    CREATE POLICY oc_auth ON ordens_compra
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ordens_compra_itens' AND policyname = 'oci_auth'
  ) THEN
    CREATE POLICY oci_auth ON ordens_compra_itens
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
