-- Perfil ADMIN: mesmo escopo operacional que GERENTE na loja (políticas 042).
-- Visão macro (todas as lojas) permanece só para DONO (043).
-- Não recria tabelas; apenas CHECK em usuarios, RLS e checagens em funções SECURITY DEFINER.

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_perfil_check
  CHECK (perfil IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN'));

-- ---------------------------------------------------------------------------
-- Políticas legado 001 (escrita / leitura gerencial)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "categorias_escrita" ON public.categorias;
CREATE POLICY "categorias_escrita"
  ON public.categorias FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "produtos_escrita" ON public.produtos;
CREATE POLICY "produtos_escrita"
  ON public.produtos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "regras_escrita" ON public.regras_preco;
CREATE POLICY "regras_escrita"
  ON public.regras_preco FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "caixas_gerente" ON public.caixas;
CREATE POLICY "caixas_gerente"
  ON public.caixas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "movimentos_gerente" ON public.movimentos_caixa;
CREATE POLICY "movimentos_gerente"
  ON public.movimentos_caixa FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "itens_gerente" ON public.itens_venda;
CREATE POLICY "itens_gerente"
  ON public.itens_venda FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- Idioma (004)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS usuarios_update_idioma_gerente_dono ON public.usuarios;
CREATE POLICY "usuarios_update_idioma_gerente_dono"
  ON public.usuarios
  FOR UPDATE
  USING (
    auth.uid() = id
    AND perfil IN ('GERENTE', 'DONO', 'ADMIN')
  )
  WITH CHECK (
    auth.uid() = id
    AND perfil IN ('GERENTE', 'DONO', 'ADMIN')
    AND idioma_preferido IN ('pt', 'zh', 'zh-HK')
  );

-- ---------------------------------------------------------------------------
-- descontos_venda (008)
-- ---------------------------------------------------------------------------
ALTER TABLE public.descontos_venda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "descontos_venda_select_gerente_dono" ON public.descontos_venda;
DROP POLICY IF EXISTS "descontos_venda_insert_gerente_dono" ON public.descontos_venda;
DROP POLICY IF EXISTS "descontos_venda_update_gerente_dono" ON public.descontos_venda;
DROP POLICY IF EXISTS "descontos_venda_delete_gerente_dono" ON public.descontos_venda;

CREATE POLICY "descontos_venda_select_gerente_dono"
  ON public.descontos_venda FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE POLICY "descontos_venda_insert_gerente_dono"
  ON public.descontos_venda FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE POLICY "descontos_venda_update_gerente_dono"
  ON public.descontos_venda FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE POLICY "descontos_venda_delete_gerente_dono"
  ON public.descontos_venda FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- estoque_baixas (010)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "estoque_baixas_select_gerente_dono" ON public.estoque_baixas;
CREATE POLICY "estoque_baixas_select_gerente_dono"
  ON public.estoque_baixas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- relatorio_settings (013)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "relatorio_settings_select_gerente_dono" ON public.relatorio_settings;
DROP POLICY IF EXISTS "relatorio_settings_update_gerente_dono" ON public.relatorio_settings;

CREATE POLICY "relatorio_settings_select_gerente_dono"
  ON public.relatorio_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE POLICY "relatorio_settings_update_gerente_dono"
  ON public.relatorio_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- movimentos_caixa / itens_venda INSERT (019)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "movimentos_insert" ON public.movimentos_caixa;
CREATE POLICY "movimentos_insert"
  ON public.movimentos_caixa
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      WHERE c.id = caixa_id
        AND c.operador_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "itens_insert" ON public.itens_venda;
CREATE POLICY "itens_insert"
  ON public.itens_venda
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = venda_id
        AND v.operador_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- lojas escrita (032)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "lojas_write_gerente" ON public.lojas;
CREATE POLICY "lojas_write_gerente"
  ON public.lojas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ---------------------------------------------------------------------------
-- vendas + estoque por loja (042)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "vendas_operador" ON public.vendas;
DROP POLICY IF EXISTS "vendas_gerente" ON public.vendas;
DROP POLICY IF EXISTS "vendas_select_authenticated" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert_authenticated" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update_authenticated" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete_authenticated" ON public.vendas;
DROP POLICY IF EXISTS "vendas_select_loja" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert_loja" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update_loja" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete_loja" ON public.vendas;

CREATE POLICY "vendas_select_loja"
  ON public.vendas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = vendas.caixa_id
        AND c.loja_id = u.loja_id
        AND (
          vendas.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    )
  );

CREATE POLICY "vendas_insert_loja"
  ON public.vendas FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = vendas.caixa_id
        AND c.loja_id = u.loja_id
        AND (
          vendas.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    )
  );

CREATE POLICY "vendas_update_loja"
  ON public.vendas FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = vendas.caixa_id
        AND c.loja_id = u.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = vendas.caixa_id
        AND c.loja_id = u.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE POLICY "vendas_delete_loja"
  ON public.vendas FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = vendas.caixa_id
        AND c.loja_id = u.loja_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "estoque_leitura" ON public.estoque;
DROP POLICY IF EXISTS "estoque_escrita" ON public.estoque;
DROP POLICY IF EXISTS "estoque_select_mesma_loja" ON public.estoque;
DROP POLICY IF EXISTS "estoque_insert_gerente_loja" ON public.estoque;
DROP POLICY IF EXISTS "estoque_update_gerente_loja" ON public.estoque;
DROP POLICY IF EXISTS "estoque_delete_gerente_loja" ON public.estoque;

CREATE POLICY "estoque_select_mesma_loja"
  ON public.estoque FOR SELECT TO authenticated
  USING (
    loja_id = (SELECT u.loja_id FROM public.usuarios u WHERE u.id = auth.uid())
  );

CREATE POLICY "estoque_insert_gerente_loja"
  ON public.estoque FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND u.loja_id = estoque.loja_id
    )
  );

CREATE POLICY "estoque_update_gerente_loja"
  ON public.estoque FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND u.loja_id = estoque.loja_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND u.loja_id = estoque.loja_id
    )
  );

CREATE POLICY "estoque_delete_gerente_loja"
  ON public.estoque FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND u.loja_id = estoque.loja_id
    )
  );

-- ---------------------------------------------------------------------------
-- remessas / movimentos (034) — políticas + funções
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "remessas_gerente_all" ON public.remessas;
CREATE POLICY "remessas_gerente_all"
  ON public.remessas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "remessa_itens_gerente_all" ON public.remessa_itens;
CREATE POLICY "remessa_itens_gerente_all"
  ON public.remessa_itens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "mov_estoque_log_gerente_all" ON public.movimentos_estoque_log;
CREATE POLICY "mov_estoque_log_gerente_all"
  ON public.movimentos_estoque_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE OR REPLACE FUNCTION public.confirmar_remessa_entrada(p_remessa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_it record;
  v_qtd numeric;
  v_tipo text := 'ENTRADA_REMessa_LOJA';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'REMESSA_AUTH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'REMESSA_PERFIL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.remessas rm0
    WHERE rm0.id = p_remessa_id AND rm0.status = 'EM_CONFERENCIA'
  ) THEN
    RAISE EXCEPTION 'REMESSA_STATUS_INVALIDO';
  END IF;

  FOR v_it IN
    SELECT i.produto_id,
           COALESCE(i.quantidade_conferida, i.quantidade_esperada) AS qtd
    FROM public.remessa_itens i
    WHERE i.remessa_id = p_remessa_id
  LOOP
    v_qtd := v_it.qtd;
    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
    SELECT rm.loja_id, v_it.produto_id, v_qtd, 0
    FROM public.remessas rm
    WHERE rm.id = p_remessa_id
    ON CONFLICT (loja_id, produto_id) DO UPDATE
      SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
          version = public.estoque.version + 1,
          updated_at = now();

    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id
    )
    SELECT
      rm.loja_id,
      v_it.produto_id,
      v_tipo,
      v_qtd,
      p_remessa_id,
      v_uid
    FROM public.remessas rm
    WHERE rm.id = p_remessa_id;
  END LOOP;

  UPDATE public.remessas
  SET status = 'CONCLUIDA', finalized_at = now()
  WHERE id = p_remessa_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transferir_estoque_entre_lojas(
  p_loja_origem uuid,
  p_loja_destino uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_atual numeric;
  v_ver integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TRANSFERENCIA_AUTH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_PERFIL';
  END IF;
  IF p_loja_origem = p_loja_destino THEN
    RAISE EXCEPTION 'TRANSFERENCIA_LOJA_IGUAL';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_QTD';
  END IF;

  SELECT e.quantidade_atual, e.version INTO v_atual, v_ver
  FROM public.estoque e
  WHERE e.loja_id = p_loja_origem AND e.produto_id = p_produto_id
  FOR UPDATE;

  IF NOT FOUND OR v_atual < p_quantidade THEN
    RAISE EXCEPTION 'TRANSFERENCIA_ESTOQUE_INSUFICIENTE';
  END IF;

  UPDATE public.estoque e
  SET
    quantidade_atual = e.quantidade_atual - p_quantidade,
    version = e.version + 1,
    updated_at = now()
  WHERE e.loja_id = p_loja_origem
    AND e.produto_id = p_produto_id
    AND e.version = v_ver;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CONCORRENCIA';
  END IF;

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_origem,
    p_produto_id,
    'TRANSFERENCIA_SAIDA',
    -p_quantidade,
    NULL,
    v_uid,
    p_observacao
  );

  INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
  VALUES (p_loja_destino, p_produto_id, p_quantidade, 0)
  ON CONFLICT (loja_id, produto_id) DO UPDATE
    SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
        version = public.estoque.version + 1,
        updated_at = now();

  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
  ) VALUES (
    p_loja_destino,
    p_produto_id,
    'TRANSFERENCIA_ENTRADA',
    p_quantidade,
    NULL,
    v_uid,
    p_observacao
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- fiado / fiscal stub (035) — políticas + registrar_liquidacao
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "doc_fiscal_gerente" ON public.documentos_fiscais_pendentes;
CREATE POLICY "doc_fiscal_gerente"
  ON public.documentos_fiscais_pendentes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "clientes_gerente" ON public.clientes;
CREATE POLICY "clientes_gerente"
  ON public.clientes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "contas_receber_gerente" ON public.contas_receber;
CREATE POLICY "contas_receber_gerente"
  ON public.contas_receber FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "liquidacoes_gerente" ON public.liquidacoes_receber;
CREATE POLICY "liquidacoes_gerente"
  ON public.liquidacoes_receber FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE OR REPLACE FUNCTION public.registrar_liquidacao_receber(
  p_titulo_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_aberto numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'LIQUIDACAO_AUTH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'LIQUIDACAO_PERFIL';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'LIQUIDACAO_VALOR';
  END IF;

  SELECT c.valor_aberto INTO v_aberto
  FROM public.contas_receber c
  WHERE c.id = p_titulo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIQUIDACAO_TITULO';
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

-- ---------------------------------------------------------------------------
-- fiscal reprocessar (037) — só checagem de perfil
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_reprocessar_documento(
  p_documento_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_AUTH';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = v_uid
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    ) THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_PERFIL';
    END IF;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'PENDENTE',
    proxima_tentativa_em = now(),
    ultimo_erro = NULL,
    updated_at = now()
  WHERE id = p_documento_id
    AND status IN ('ERRO', 'PENDENTE');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_REPROCESSO_STATUS_INVALIDO';
  END IF;
END;
$$;
