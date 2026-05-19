-- Esteira completa de entrada XML NF-e (Modelo 55):
--   notas_fiscais_entradas  — cabeçalho fiscal com totais ICMSTot
--   itens_nota_fiscal_entrada — linhas com impostos por item e CMV
--   produto_fornecedor_match  — De/Para: cProd ↔ produto interno
--   contas_a_pagar            — duplicatas (fat/dup) injetadas automaticamente

-- ---------------------------------------------------------------------------
-- notas_fiscais_entradas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notas_fiscais_entradas (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_nfe_id   uuid        REFERENCES public.importacoes_nfe(id),
  chave_acesso        text        NOT NULL,
  numero_nf           text,
  serie               text,
  data_emissao        date,
  fornecedor_id       uuid        NOT NULL REFERENCES public.fornecedores(id),
  loja_id             uuid        NOT NULL REFERENCES public.lojas(id),
  usuario_id          uuid        NOT NULL REFERENCES public.usuarios(id),
  -- Totais do bloco ICMSTot
  v_nf                numeric(14,2) NOT NULL DEFAULT 0,
  v_produtos          numeric(14,2) NOT NULL DEFAULT 0,
  v_frete             numeric(14,2) NOT NULL DEFAULT 0,
  v_icms              numeric(14,2) NOT NULL DEFAULT 0,
  v_ipi               numeric(14,2) NOT NULL DEFAULT 0,
  v_st                numeric(14,2) NOT NULL DEFAULT 0,
  v_desconto          numeric(14,2) NOT NULL DEFAULT 0,
  status              text        NOT NULL DEFAULT 'PROCESSADA'
                        CHECK (status IN ('PROCESSADA', 'CANCELADA', 'PENDENTE')),
  observacao          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nfe_entradas_chave_unique UNIQUE (chave_acesso)
);

CREATE INDEX IF NOT EXISTS idx_nfe_entradas_fornecedor ON public.notas_fiscais_entradas (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_nfe_entradas_loja       ON public.notas_fiscais_entradas (loja_id);
CREATE INDEX IF NOT EXISTS idx_nfe_entradas_created    ON public.notas_fiscais_entradas (created_at DESC);

COMMENT ON TABLE public.notas_fiscais_entradas IS
  'Cabeçalho fiscal completo da NF-e importada via XML: totais de ICMS/IPI/ST, frete, série e data de emissão.';

ALTER TABLE public.notas_fiscais_entradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nfe_entradas_gerente_all" ON public.notas_fiscais_entradas;
CREATE POLICY "nfe_entradas_gerente_all"
  ON public.notas_fiscais_entradas FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE','DONO','ADMIN'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE','DONO','ADMIN'))
  );

-- ---------------------------------------------------------------------------
-- itens_nota_fiscal_entrada
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itens_nota_fiscal_entrada (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_entrada_id  uuid          NOT NULL REFERENCES public.notas_fiscais_entradas(id) ON DELETE CASCADE,
  produto_id              uuid          REFERENCES public.produtos(id),
  -- Campos diretos do XML
  ref_fornecedor          text          NOT NULL,   -- cProd
  nome_produto            text          NOT NULL,   -- xProd
  gtin                    text,                     -- cEAN
  ncm                     text,
  u_com                   text,                     -- uCom (unidade comercial do XML)
  q_com                   numeric(14,4) NOT NULL,   -- qCom
  v_un_com                numeric(14,4) NOT NULL,   -- vUnCom
  v_prod                  numeric(14,2) NOT NULL,   -- vProd = qCom × vUnCom
  -- Impostos individuais do item
  v_icms                  numeric(14,2) NOT NULL DEFAULT 0,
  v_ipi                   numeric(14,2) NOT NULL DEFAULT 0,
  v_st                    numeric(14,2) NOT NULL DEFAULT 0,
  -- Conversão de unidade e CMV
  fator_conversao         numeric(10,4) NOT NULL DEFAULT 1,
  quantidade_entrada      numeric(14,4) NOT NULL,   -- q_com × fator_conversao
  custo_medio_unitario    numeric(14,4) NOT NULL,   -- (v_prod + impostos + frete rateado) / quantidade_entrada
  status_match            text          NOT NULL DEFAULT 'NOVO'
                            CHECK (status_match IN ('NOVO','EXISTENTE','MANUAL')),
  created_at              timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itens_nfe_nota    ON public.itens_nota_fiscal_entrada (nota_fiscal_entrada_id);
CREATE INDEX IF NOT EXISTS idx_itens_nfe_produto ON public.itens_nota_fiscal_entrada (produto_id)
  WHERE produto_id IS NOT NULL;

COMMENT ON TABLE public.itens_nota_fiscal_entrada IS
  'Linhas da NF-e com impostos por item, fator de conversão de unidade e custo médio ponderado calculado.';

ALTER TABLE public.itens_nota_fiscal_entrada ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "itens_nfe_gerente_all" ON public.itens_nota_fiscal_entrada;
CREATE POLICY "itens_nfe_gerente_all"
  ON public.itens_nota_fiscal_entrada FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE','DONO','ADMIN'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE','DONO','ADMIN'))
  );

-- ---------------------------------------------------------------------------
-- produto_fornecedor_match  (tabela De/Para)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.produto_fornecedor_match (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id     uuid          NOT NULL REFERENCES public.fornecedores(id),
  produto_id        uuid          NOT NULL REFERENCES public.produtos(id),
  ref_fornecedor    text          NOT NULL,   -- cProd do XML
  gtin_xml          text,                    -- GTIN vindo do XML (pode diferir do código interno)
  u_com_xml         text,                    -- uCom original (FD, CX, UN…)
  fator_conversao   numeric(10,4) NOT NULL DEFAULT 1,
  ativo             boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_pfm_fornecedor_ref UNIQUE (fornecedor_id, ref_fornecedor)
);

CREATE INDEX IF NOT EXISTS idx_pfm_produto ON public.produto_fornecedor_match (produto_id);

COMMENT ON TABLE public.produto_fornecedor_match IS
  'Relacionamento De/Para: código do fornecedor (cProd) ↔ produto interno, com fator de conversão de embalagem.';

ALTER TABLE public.produto_fornecedor_match ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pfm_gerente_all" ON public.produto_fornecedor_match;
CREATE POLICY "pfm_gerente_all"
  ON public.produto_fornecedor_match FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE','DONO','ADMIN'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE','DONO','ADMIN'))
  );

DROP TRIGGER IF EXISTS pfm_updated_at ON public.produto_fornecedor_match;
CREATE TRIGGER pfm_updated_at
  BEFORE UPDATE ON public.produto_fornecedor_match
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contas_a_pagar  (duplicatas injetadas automaticamente via XML fat/dup)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contas_a_pagar (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_entrada_id  uuid          REFERENCES public.notas_fiscais_entradas(id),
  fornecedor_id           uuid          NOT NULL REFERENCES public.fornecedores(id),
  loja_id                 uuid          NOT NULL REFERENCES public.lojas(id),
  numero_duplicata        text,
  descricao               text,
  valor                   numeric(14,2) NOT NULL CHECK (valor > 0),
  vencimento              date          NOT NULL,
  status                  text          NOT NULL DEFAULT 'PENDENTE'
                            CHECK (status IN ('PENDENTE','PAGO','PARCIAL','CANCELADO')),
  forma_pagamento         text,
  data_pagamento          date,
  valor_pago              numeric(14,2),
  observacao              text,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cap_nota        ON public.contas_a_pagar (nota_fiscal_entrada_id)
  WHERE nota_fiscal_entrada_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cap_fornecedor  ON public.contas_a_pagar (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_cap_vencimento  ON public.contas_a_pagar (vencimento);
CREATE INDEX IF NOT EXISTS idx_cap_status_pend ON public.contas_a_pagar (loja_id, vencimento)
  WHERE status = 'PENDENTE';

COMMENT ON TABLE public.contas_a_pagar IS
  'Duplicatas extraídas do bloco fat/dup da NF-e; status PENDENTE ao criar, gerenciável pelo financeiro.';

ALTER TABLE public.contas_a_pagar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cap_gerente_all" ON public.contas_a_pagar;
CREATE POLICY "cap_gerente_all"
  ON public.contas_a_pagar FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE','DONO','ADMIN'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE','DONO','ADMIN'))
  );

DROP TRIGGER IF EXISTS cap_updated_at ON public.contas_a_pagar;
CREATE TRIGGER cap_updated_at
  BEFORE UPDATE ON public.contas_a_pagar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
