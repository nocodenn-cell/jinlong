-- Performance: políticas em 042 fazem vendas → caixas por caixa_id / loja_id.
-- vendas(caixa_id) já tem idx_vendas_caixa (001). Falta índice em caixas(loja_id) para
-- planejador usar caixas como inner side filtrado por loja do usuário.

CREATE INDEX IF NOT EXISTS idx_caixas_loja_id ON public.caixas (loja_id);

COMMENT ON INDEX public.idx_caixas_loja_id IS
  'Suporta joins RLS vendas↔caixas e consultas por loja.';

-- Visão macro: perfil DONO enxerga estoque e vendas de todas as lojas (SELECT apenas).
-- GERENTE e ADMIN permanecem restritos à usuarios.loja_id (042); perfil ADMIN definido em 044.

CREATE POLICY "estoque_select_dono_todas_lojas"
  ON public.estoque FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil = 'DONO'
    )
  );

CREATE POLICY "vendas_select_dono_todas_lojas"
  ON public.vendas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil = 'DONO'
    )
  );
