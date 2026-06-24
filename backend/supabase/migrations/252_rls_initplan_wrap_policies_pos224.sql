-- Migration 252: complemento da 224 — aplica initplan (SELECT auth.uid())
-- nas 8 políticas criadas APÓS a migration 224 (criadas pelas migrations
-- 113_rls_audit_fixes, 114_pdv_config_loja_backfill, 228_venda_eventos_ledger,
-- 234_calcular_preco_produto, 117_fix_oc_rls, etc.) e que ainda usam
-- auth.uid() sem subselect, disparando o advisor auth_rls_initplan.
--
-- 225 e 226 já estão em produção — não são re-aplicadas aqui.
-- Sem mudança de comportamento: auth.uid() é STABLE por statement.
-- Usa ALTER POLICY — sem janela de deny.

BEGIN;

-- 1) itens_venda_select_loja (SELECT)
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

-- 2) itens_venda_write_gerente_loja (ALL — USING + WITH CHECK)
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

-- 3) ordens_compra_gerente_loja (ALL — USING + WITH CHECK)
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

-- 4) ordens_compra_itens_gerente_loja (ALL — USING + WITH CHECK)
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

-- 5) pdv_config_select_gerencial (SELECT)
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

-- 6) pdv_config_update_dono (UPDATE — USING + WITH CHECK)
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

-- 7) tokens_desconto_select_gerente (SELECT — 2 ocorrências de auth.uid())
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

-- 8) venda_eventos_select_loja (SELECT — 2 ocorrências de auth.uid())
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

-- ─── VERIFICAÇÃO (deve retornar 0 após aplicar) ───────────────────────────
-- SELECT count(*) FROM pg_policies
-- WHERE schemaname='public'
--   AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ 'auth\.(uid|role|jwt|email)\(\)'
--   AND (coalesce(qual,'')||' '||coalesce(with_check,'')) !~ '\( SELECT auth\.';
