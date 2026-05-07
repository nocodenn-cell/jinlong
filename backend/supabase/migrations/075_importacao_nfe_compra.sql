-- Importação NF-e de compra: fornecedores, idempotência por chave, entrada em estoque + kardex.

-- ---------------------------------------------------------------------------
-- Fornecedores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text NOT NULL,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fornecedores_cnpj ON public.fornecedores (cnpj);

COMMENT ON TABLE public.fornecedores IS 'Emitentes de NF-e de compra (CNPJ normalizado, só dígitos).';

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fornecedores_gerente_all" ON public.fornecedores;
CREATE POLICY "fornecedores_gerente_all"
  ON public.fornecedores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP TRIGGER IF EXISTS fornecedores_updated_at ON public.fornecedores;
CREATE TRIGGER fornecedores_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Produtos: vínculo com fornecedor + referência do XML (cProd)
-- ---------------------------------------------------------------------------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id);

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS referencia_fornecedor text;

CREATE INDEX IF NOT EXISTS idx_produtos_fornecedor ON public.produtos (fornecedor_id)
  WHERE fornecedor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_produtos_fornecedor_ref
  ON public.produtos (fornecedor_id, referencia_fornecedor)
  WHERE fornecedor_id IS NOT NULL AND referencia_fornecedor IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Registro de NF já importada (idempotência)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.importacoes_nfe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_acesso text NOT NULL,
  numero_nf text,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id),
  loja_id uuid NOT NULL REFERENCES public.lojas(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT importacoes_nfe_chave_unique UNIQUE (chave_acesso)
);

CREATE INDEX IF NOT EXISTS idx_importacoes_nfe_loja ON public.importacoes_nfe (loja_id);
CREATE INDEX IF NOT EXISTS idx_importacoes_nfe_created ON public.importacoes_nfe (created_at DESC);

COMMENT ON TABLE public.importacoes_nfe IS 'Controle de idempotência: uma chave de NF-e (44 caracteres) importada uma vez por ambiente.';

ALTER TABLE public.importacoes_nfe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "importacoes_nfe_gerente_all" ON public.importacoes_nfe;
CREATE POLICY "importacoes_nfe_gerente_all"
  ON public.importacoes_nfe FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- Tipo de movimento de estoque
-- ---------------------------------------------------------------------------
INSERT INTO public.tipos_movimento_estoque (codigo, rotulo, exige_gerente, permite_entrada, permite_saida)
VALUES
  ('ENTRADA_NFE', 'Entrada por NF-e de compra', true, true, false)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RPC atômica: importação completa (uma transação por chamada)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.importar_nfe_transacao(
  p_chave_acesso text,
  p_numero_nf text,
  p_fornecedor_cnpj text,
  p_fornecedor_nome text,
  p_loja_id uuid,
  p_itens jsonb,
  p_atualizar_custo boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_cnpj text;
  v_forn_id uuid;
  v_imp_id uuid;
  el jsonb;
  v_gtin text;
  v_ref text;
  v_nome text;
  v_q_com numeric;
  v_fator numeric;
  v_v_un numeric;
  v_u_com text;
  v_ncm text;
  v_item_atualiza_custo boolean;
  v_q_entrada numeric;
  v_custo_unit numeric;
  v_produto_id uuid;
  v_atual numeric;
  v_obs text;
  v_n int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  IF v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  v_cnpj := regexp_replace(COALESCE(p_fornecedor_cnpj, ''), '\D', '', 'g');
  IF length(v_cnpj) <> 14 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CNPJ_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_ITENS_VAZIO';
  END IF;

  IF length(trim(COALESCE(p_chave_acesso, ''))) <> 44 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CHAVE_INVALIDA';
  END IF;

  INSERT INTO public.fornecedores (cnpj, nome)
  VALUES (v_cnpj, COALESCE(NULLIF(trim(p_fornecedor_nome), ''), 'Fornecedor'))
  ON CONFLICT (cnpj) DO UPDATE SET
    nome = EXCLUDED.nome,
    updated_at = now()
  RETURNING id INTO v_forn_id;

  INSERT INTO public.importacoes_nfe (chave_acesso, numero_nf, fornecedor_id, loja_id, usuario_id)
  VALUES (trim(p_chave_acesso), NULLIF(trim(p_numero_nf), ''), v_forn_id, p_loja_id, v_uid)
  ON CONFLICT (chave_acesso) DO NOTHING
  RETURNING id INTO v_imp_id;

  IF v_imp_id IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_DUPLICADA';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_nome := COALESCE(NULLIF(trim(el->>'nome_produto'), ''), 'Produto sem nome');
    v_gtin := NULLIF(trim(COALESCE(el->>'gtin', '')), '');
    v_ref := COALESCE(NULLIF(trim(el->>'ref_fornecedor'), ''), '');
    IF v_ref = '' THEN
      RAISE EXCEPTION 'IMPORT_NFE_REF_OBRIGATORIA';
    END IF;

    v_q_com := COALESCE((el->>'q_com')::numeric, 0);
    v_fator := COALESCE((el->>'fator')::numeric, 1);
    v_v_un := COALESCE((el->>'v_un_com')::numeric, 0);
    v_u_com := NULLIF(trim(COALESCE(el->>'u_com', '')), '');
    v_ncm := NULLIF(trim(COALESCE(el->>'ncm', '')), '');
    v_item_atualiza_custo := COALESCE((el->>'atualizar_custo')::boolean, p_atualizar_custo);

    IF v_fator IS NULL OR v_fator <= 0 THEN
      RAISE EXCEPTION 'IMPORT_NFE_FATOR_INVALIDO';
    END IF;
    IF v_q_com IS NULL OR v_q_com < 0 THEN
      RAISE EXCEPTION 'IMPORT_NFE_QTD_INVALIDA';
    END IF;

    v_q_entrada := v_q_com * v_fator;
    IF v_q_entrada <= 0 THEN
      RAISE EXCEPTION 'IMPORT_NFE_QTD_ENTRADA_ZERO';
    END IF;

    v_custo_unit := v_v_un / v_fator;
    IF v_custo_unit IS NULL OR v_custo_unit < 0 THEN
      RAISE EXCEPTION 'IMPORT_NFE_CUSTO_INVALIDO';
    END IF;

    v_produto_id := NULL;

    IF v_gtin IS NOT NULL
       AND upper(v_gtin) <> 'SEM GTIN'
       AND length(v_gtin) >= 8
    THEN
      SELECT p.id INTO v_produto_id
      FROM public.produtos p
      WHERE p.codigo_barras = v_gtin
      LIMIT 1;
    END IF;

    IF v_produto_id IS NULL THEN
      SELECT p.id INTO v_produto_id
      FROM public.produtos p
      WHERE p.fornecedor_id = v_forn_id
        AND p.referencia_fornecedor = v_ref
      LIMIT 1;
    END IF;

    IF v_produto_id IS NULL THEN
      INSERT INTO public.produtos (
        nome,
        codigo_barras,
        preco_varejo,
        preco_custo,
        unidade_medida,
        origem,
        tem_nf,
        ativo,
        fornecedor_id,
        referencia_fornecedor,
        observacao
      ) VALUES (
        v_nome,
        CASE
          WHEN v_gtin IS NOT NULL AND upper(v_gtin) <> 'SEM GTIN' AND length(v_gtin) >= 8 THEN v_gtin
          ELSE NULL
        END,
        ROUND(GREATEST(v_custo_unit * 1.5, 0.01), 2),
        ROUND(v_custo_unit, 2),
        COALESCE(left(v_u_com, 16), 'UN'),
        'brasil_nf',
        true,
        true,
        v_forn_id,
        v_ref,
        CASE WHEN v_ncm IS NOT NULL THEN 'NCM ' || v_ncm ELSE NULL END
      )
      RETURNING id INTO v_produto_id;

      INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
      VALUES (p_loja_id, v_produto_id, 0, 0)
      ON CONFLICT (loja_id, produto_id) DO NOTHING;
    ELSE
      IF v_item_atualiza_custo THEN
        UPDATE public.produtos p
        SET
          preco_custo = ROUND(v_custo_unit, 2),
          updated_at = now()
        WHERE p.id = v_produto_id;
      END IF;
    END IF;

    SELECT e.quantidade_atual INTO v_atual
    FROM public.estoque e
    WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
      VALUES (p_loja_id, v_produto_id, 0, 0);

      SELECT e.quantidade_atual INTO v_atual
      FROM public.estoque e
      WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id
      FOR UPDATE;
    END IF;

    UPDATE public.estoque e
    SET
      quantidade_atual = e.quantidade_atual + v_q_entrada,
      version = e.version + 1,
      updated_at = now()
    WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id;

    v_obs := format(
      'NF-e importada | chave=%s | ref=%s | q_xml=%s | fator=%s | NCM=%s',
      trim(p_chave_acesso),
      v_ref,
      v_q_com::text,
      v_fator::text,
      COALESCE(v_ncm, '-')
    );

    INSERT INTO public.movimentos_estoque_log (
      loja_id,
      produto_id,
      tipo_codigo,
      quantidade_delta,
      remessa_id,
      usuario_id,
      observacao
    ) VALUES (
      p_loja_id,
      v_produto_id,
      'ENTRADA_NFE',
      v_q_entrada,
      NULL,
      v_uid,
      v_obs
    );

    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'importacao_id', v_imp_id,
    'itens_processados', v_n
  );
END;
$$;

REVOKE ALL ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean) TO service_role;

COMMENT ON FUNCTION public.importar_nfe_transacao IS
  'Importação atômica de NF-e de compra: idempotente por chave_acesso, atualiza produtos/estoque e registra ENTRADA_NFE no kardex.';

-- Ativar feature no ambiente após migração (ajuste para produção conforme política).
UPDATE public.feature_flags
SET enabled = true, updated_at = now()
WHERE name = 'importacao_xml';
