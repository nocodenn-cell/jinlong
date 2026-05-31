-- ─────────────────────────────────────────────────────────────────────────────
-- 209 · Campos fiscais na tabela lojas + colunas de config em pdv_config
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. lojas: dados comerciais, endereço e identidade fiscal ─────────────────
ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS cnpj                 TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_estadual   TEXT,
  ADD COLUMN IF NOT EXISTS telefone             TEXT,
  ADD COLUMN IF NOT EXISTS email                TEXT,
  ADD COLUMN IF NOT EXISTS logo_url             TEXT,
  ADD COLUMN IF NOT EXISTS endereco_logradouro  TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero      TEXT,
  ADD COLUMN IF NOT EXISTS endereco_complemento TEXT,
  ADD COLUMN IF NOT EXISTS endereco_bairro      TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cidade      TEXT,
  ADD COLUMN IF NOT EXISTS endereco_uf          TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cep         TEXT,
  ADD COLUMN IF NOT EXISTS razao_social         TEXT,
  ADD COLUMN IF NOT EXISTS nome_fantasia        TEXT,
  ADD COLUMN IF NOT EXISTS cnae                 TEXT,
  ADD COLUMN IF NOT EXISTS numero_serie_nfce    SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS numero_serie_nfe     SMALLINT NOT NULL DEFAULT 1;

-- CNPJ: NULL ou exatamente 14 dígitos (sem pontuação)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_lojas_cnpj_formato' AND conrelid = 'lojas'::regclass
  ) THEN
    ALTER TABLE lojas
      ADD CONSTRAINT chk_lojas_cnpj_formato
      CHECK (cnpj IS NULL OR cnpj ~ '^\d{14}$');
  END IF;
END $$;

-- Séries NF-e/NFC-e: 1–999
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_lojas_serie_nfce' AND conrelid = 'lojas'::regclass) THEN
    ALTER TABLE lojas ADD CONSTRAINT chk_lojas_serie_nfce CHECK (numero_serie_nfce BETWEEN 1 AND 999);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_lojas_serie_nfe' AND conrelid = 'lojas'::regclass) THEN
    ALTER TABLE lojas ADD CONSTRAINT chk_lojas_serie_nfe CHECK (numero_serie_nfe BETWEEN 1 AND 999);
  END IF;
END $$;

COMMENT ON COLUMN lojas.cnpj                IS 'CNPJ da empresa emissora (14 dígitos sem pontuação)';
COMMENT ON COLUMN lojas.razao_social        IS 'Razão social para emissão de NF-e (campo xNome do XML)';
COMMENT ON COLUMN lojas.nome_fantasia       IS 'Nome fantasia para NF-e (campo xFant do XML)';
COMMENT ON COLUMN lojas.cnae                IS 'CNAE da atividade principal (7 dígitos)';
COMMENT ON COLUMN lojas.numero_serie_nfce   IS 'Série da NFC-e (1–999, padrão 1)';
COMMENT ON COLUMN lojas.numero_serie_nfe    IS 'Série da NF-e (1–999, padrão 1)';

-- ── 2. pdv_config: loja_id + preferências de PDV + parâmetros fiscais ────────
ALTER TABLE pdv_config
  ADD COLUMN IF NOT EXISTS loja_id             UUID REFERENCES lojas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cfop_padrao         TEXT    NOT NULL DEFAULT '5102',
  ADD COLUMN IF NOT EXISTS cst_padrao          TEXT    NOT NULL DEFAULT '00',
  ADD COLUMN IF NOT EXISTS regime_tributario   TEXT    NOT NULL DEFAULT 'SIMPLES_NACIONAL',
  ADD COLUMN IF NOT EXISTS auto_enqueue_fiscal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS idioma_padrao       TEXT    NOT NULL DEFAULT 'pt',
  ADD COLUMN IF NOT EXISTS tema_padrao         TEXT    NOT NULL DEFAULT 'noturno',
  ADD COLUMN IF NOT EXISTS imprimir_cupom_auto BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS formato_impressao   TEXT    NOT NULL DEFAULT 'TERMICA';

-- Índice único por loja_id (WHERE NOT NULL) → suporte ao UPSERT ON CONFLICT loja_id
CREATE UNIQUE INDEX IF NOT EXISTS uidx_pdv_config_loja_id
  ON pdv_config (loja_id)
  WHERE loja_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pdv_config_regime' AND conrelid = 'pdv_config'::regclass) THEN
    ALTER TABLE pdv_config
      ADD CONSTRAINT chk_pdv_config_regime
      CHECK (regime_tributario IN ('SIMPLES_NACIONAL','LUCRO_PRESUMIDO','LUCRO_REAL','MEI'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pdv_config_cfop' AND conrelid = 'pdv_config'::regclass) THEN
    ALTER TABLE pdv_config
      ADD CONSTRAINT chk_pdv_config_cfop
      CHECK (cfop_padrao ~ '^\d{4}$');
  END IF;
END $$;

COMMENT ON COLUMN pdv_config.loja_id             IS 'FK para lojas — config por loja';
COMMENT ON COLUMN pdv_config.auto_enqueue_fiscal IS 'Enfileira NFC-e automaticamente após cada venda';
COMMENT ON COLUMN pdv_config.cfop_padrao         IS 'CFOP padrão aplicado quando o produto não tem CFOP próprio';
