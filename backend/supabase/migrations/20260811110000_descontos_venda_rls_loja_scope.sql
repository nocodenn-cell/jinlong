-- Isolamento multi-loja em descontos_venda.
--
-- Antes (008/044/224): policies só checavam perfil GERENTE/DONO/ADMIN — qualquer
-- gerente autenticado lia/alterava descontos de todas as lojas via PostgREST.
-- Gatilho concreto: GERENTE da Loja A abre /admin/auditoria (tipo DESCONTO) ou
-- SELECT em descontos_venda e recebe venda_id/valores/gerente_id da Loja B.
--
-- Padrão alinhado a comissões/contas_pagar: DONO/ADMIN veem todas as lojas;
-- GERENTE só a loja do caixa da venda (vendas → caixas.loja_id).
-- INSERT via SECURITY DEFINER (finalizar_venda_*) continua OK (bypassa RLS).

ALTER TABLE public.descontos_venda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "descontos_venda_select_gerente_dono" ON public.descontos_venda;
DROP POLICY IF EXISTS "descontos_venda_insert_gerente_dono" ON public.descontos_venda;
DROP POLICY IF EXISTS "descontos_venda_update_gerente_dono" ON public.descontos_venda;
DROP POLICY IF EXISTS "descontos_venda_delete_gerente_dono" ON public.descontos_venda;

CREATE POLICY "descontos_venda_select_gerente_dono"
  ON public.descontos_venda FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = (SELECT auth.uid())
      WHERE v.id = descontos_venda.venda_id
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (
          u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])
          OR u.loja_id = c.loja_id
        )
    )
  );

CREATE POLICY "descontos_venda_insert_gerente_dono"
  ON public.descontos_venda FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = (SELECT auth.uid())
      WHERE v.id = descontos_venda.venda_id
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (
          u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])
          OR u.loja_id = c.loja_id
        )
    )
  );

CREATE POLICY "descontos_venda_update_gerente_dono"
  ON public.descontos_venda FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = (SELECT auth.uid())
      WHERE v.id = descontos_venda.venda_id
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (
          u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])
          OR u.loja_id = c.loja_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = (SELECT auth.uid())
      WHERE v.id = descontos_venda.venda_id
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (
          u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])
          OR u.loja_id = c.loja_id
        )
    )
  );

CREATE POLICY "descontos_venda_delete_gerente_dono"
  ON public.descontos_venda FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = (SELECT auth.uid())
      WHERE v.id = descontos_venda.venda_id
        AND u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])
        AND (
          u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])
          OR u.loja_id = c.loja_id
        )
    )
  );
