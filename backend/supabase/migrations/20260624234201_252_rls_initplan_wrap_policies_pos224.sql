-- BACKPORT (fase R1, 2026-07-02): conteúdo extraído de
-- supabase_migrations.schema_migrations.statements do projeto de produção
-- (jinlong). Esta migration foi aplicada em produção sem arquivo no repo.

BEGIN;

ALTER POLICY "itens_venda_select_loja" ON public.itens_venda
  USING (
    EXISTS (
      SELECT 1
      FROM ((vendas v
        JOIN caixas cx ON ((cx.id = v.caixa_id)))
        JOIN usuarios u ON ((u.id = (SELECT auth.uid()))))
      WHERE ((v.id = itens_venda.venda_id)
        AND ((u.perfil = 'ADMIN'::text) OR (cx.loja_id = u.loja_id)))
    )
  );

ALTER POLICY "itens_venda_write_gerente_loja" ON public.itens_venda
  USING (
    EXISTS (
      SELECT 1
      FROM ((vendas v
        JOIN caixas cx ON ((cx.id = v.caixa_id)))
        JOIN usuarios u ON ((u.id = (SELECT auth.uid()))))
      WHERE ((v.id = itens_venda.venda_id)
        AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = 'ADMIN'::text) OR (cx.loja_id = u.loja_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM ((vendas v
        JOIN caixas cx ON ((cx.id = v.caixa_id)))
        JOIN usuarios u ON ((u.id = (SELECT auth.uid()))))
      WHERE ((v.id = itens_venda.venda_id)
        AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = 'ADMIN'::text) OR (cx.loja_id = u.loja_id)))
    )
  );

ALTER POLICY "ordens_compra_gerente_loja" ON public.ordens_compra
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE ((u.id = (SELECT auth.uid()))
        AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = ordens_compra.loja_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE ((u.id = (SELECT auth.uid()))
        AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = ordens_compra.loja_id)))
    )
  );

ALTER POLICY "ordens_compra_itens_gerente_loja" ON public.ordens_compra_itens
  USING (
    EXISTS (
      SELECT 1
      FROM (ordens_compra oc
        JOIN usuarios u ON ((u.id = (SELECT auth.uid()))))
      WHERE ((oc.id = ordens_compra_itens.ordem_id)
        AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = oc.loja_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM (ordens_compra oc
        JOIN usuarios u ON ((u.id = (SELECT auth.uid()))))
      WHERE ((oc.id = ordens_compra_itens.ordem_id)
        AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = oc.loja_id)))
    )
  );

ALTER POLICY "pdv_config_select_gerencial" ON public.pdv_config
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE ((u.id = (SELECT auth.uid()))
        AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = pdv_config.loja_id)
             OR (pdv_config.loja_id IS NULL)))
    )
  );

ALTER POLICY "pdv_config_update_dono" ON public.pdv_config
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE ((u.id = (SELECT auth.uid()))
        AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = pdv_config.loja_id)
             OR (pdv_config.loja_id IS NULL)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE ((u.id = (SELECT auth.uid()))
        AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = pdv_config.loja_id)
             OR (pdv_config.loja_id IS NULL)))
    )
  );

ALTER POLICY "tokens_desconto_select_gerente" ON public.tokens_desconto_gerente
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE ((u.id = (SELECT auth.uid()))
        AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))
        AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]))
             OR (tokens_desconto_gerente.criado_por = (SELECT auth.uid()))))
    )
  );

ALTER POLICY "venda_eventos_select_loja" ON public.venda_eventos
  USING (
    (loja_id IN (
      SELECT u.loja_id FROM usuarios u WHERE (u.id = (SELECT auth.uid()))
    ))
    OR (EXISTS (
      SELECT 1 FROM usuarios u
      WHERE ((u.id = (SELECT auth.uid())) AND (u.perfil = 'ADMIN'::text))
    ))
  );

COMMIT;
