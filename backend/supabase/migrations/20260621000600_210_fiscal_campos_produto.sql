-- ─────────────────────────────────────────────────────────────────────────────
-- 210 · Campos fiscais por produto (NCM, CFOP, CSOSN/CST, CEST, PIS, COFINS)
-- ─────────────────────────────────────────────────────────────────────────────
-- Estes campos alimentam o payload para o Focus NFe.
-- ncm é obrigatório pelo SEFAZ para NF-e/NFC-e; os demais têm defaults seguros
-- para Simples Nacional (CSOSN 400 + PIS/COFINS 07 = isento).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS ncm         TEXT,          -- 8 dígitos, ex: '85171231' — OBRIGATÓRIO SEFAZ
  ADD COLUMN IF NOT EXISTS cfop_produto TEXT,          -- override por produto; NULL usa pdv_config.cfop_padrao
  ADD COLUMN IF NOT EXISTS csosn       TEXT DEFAULT '400', -- CSOSN para Simples Nacional (400 = não tributada)
  ADD COLUMN IF NOT EXISTS cest        TEXT,          -- Código CEST para produtos com ICMS-ST (opcional)
  ADD COLUMN IF NOT EXISTS cst_pis     TEXT DEFAULT '07',  -- 07 = operação isenta (mais comum no varejo)
  ADD COLUMN IF NOT EXISTS cst_cofins  TEXT DEFAULT '07';  -- 07 = operação isenta (mais comum no varejo)

-- NCM: NULL ou exatamente 8 dígitos numéricos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_produto_ncm_formato' AND conrelid = 'produtos'::regclass
  ) THEN
    ALTER TABLE produtos
      ADD CONSTRAINT chk_produto_ncm_formato
      CHECK (ncm IS NULL OR ncm ~ '^\d{8}$');
  END IF;
END $$;

-- CFOP por produto: NULL ou 4 dígitos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_produto_cfop_formato' AND conrelid = 'produtos'::regclass
  ) THEN
    ALTER TABLE produtos
      ADD CONSTRAINT chk_produto_cfop_formato
      CHECK (cfop_produto IS NULL OR cfop_produto ~ '^\d{4}$');
  END IF;
END $$;

-- CEST: NULL ou 7 dígitos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_produto_cest_formato' AND conrelid = 'produtos'::regclass
  ) THEN
    ALTER TABLE produtos
      ADD CONSTRAINT chk_produto_cest_formato
      CHECK (cest IS NULL OR cest ~ '^\d{7}$');
  END IF;
END $$;

-- Índice parcial para validação de NCM (listar produtos SEM NCM no painel)
CREATE INDEX IF NOT EXISTS idx_produtos_sem_ncm
  ON produtos (id)
  WHERE ncm IS NULL AND ativo = true;

COMMENT ON COLUMN produtos.ncm         IS 'Código NCM (8 dígitos) — obrigatório pelo SEFAZ para NF-e/NFC-e';
COMMENT ON COLUMN produtos.cfop_produto IS 'CFOP específico do produto; NULL usa o CFOP padrão da configuração';
COMMENT ON COLUMN produtos.csosn       IS 'CSOSN para Simples Nacional: 102, 400, 500 etc. (padrão: 400)';
COMMENT ON COLUMN produtos.cest        IS 'Código CEST para produtos sujeitos a ICMS-ST (opcional)';
COMMENT ON COLUMN produtos.cst_pis     IS 'CST PIS: 07 = isenta, 49 = outras saídas (padrão: 07)';
COMMENT ON COLUMN produtos.cst_cofins  IS 'CST COFINS: 07 = isenta, 49 = outras saídas (padrão: 07)';
