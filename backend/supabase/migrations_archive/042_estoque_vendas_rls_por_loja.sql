-- Isolamento por loja (regra: um usuário pertence a uma loja — public.usuarios.loja_id).
-- Vendas: visíveis se o caixa da venda for da mesma loja; operador só as próprias; GERENTE/DONO vê/edita todas da loja.
-- Estoque: SELECT só linhas com estoque.loja_id = usuário.loja_id; escrita só GERENTE/DONO na própria loja.
--
-- Depende de: caixas.loja_id, usuarios.loja_id, estoque.loja_id (migration 032).
-- Substitui políticas de vendas da 041 (e legado 001) e de estoque da 001.

-- ---- VENDAS ----
DROP POLICY IF EXISTS "vendas_operador" ON public.vendas;
DROP POLICY IF EXISTS "vendas_gerente" ON public.vendas;
DROP POLICY IF EXISTS "vendas_select_authenticated" ON public.vendas;
DROP POLICY IF EXISTS "vendas_insert_authenticated" ON public.vendas;
DROP POLICY IF EXISTS "vendas_update_authenticated" ON public.vendas;
DROP POLICY IF EXISTS "vendas_delete_authenticated" ON public.vendas;

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
          OR u.perfil IN ('GERENTE', 'DONO')
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
          OR u.perfil IN ('GERENTE', 'DONO')
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
        AND u.perfil IN ('GERENTE', 'DONO')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = vendas.caixa_id
        AND c.loja_id = u.loja_id
        AND u.perfil IN ('GERENTE', 'DONO')
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
        AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

-- ---- ESTOQUE ----
DROP POLICY IF EXISTS "estoque_leitura" ON public.estoque;
DROP POLICY IF EXISTS "estoque_escrita" ON public.estoque;

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
        AND u.perfil IN ('GERENTE', 'DONO')
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
        AND u.perfil IN ('GERENTE', 'DONO')
        AND u.loja_id = estoque.loja_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO')
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
        AND u.perfil IN ('GERENTE', 'DONO')
        AND u.loja_id = estoque.loja_id
    )
  );
