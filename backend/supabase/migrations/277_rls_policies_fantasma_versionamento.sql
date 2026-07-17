-- 277_rls_policies_fantasma_versionamento.sql
--
-- FRENTE 2 (Database Integrity Hardening) — versiona as RLS policies que
-- existiam SOMENTE em produção (drift real) e nunca tiveram um CREATE POLICY
-- correspondente em nenhuma migration deste repositório.
--
-- ORIGEM DA EVIDÊNCIA
-- ===================
-- Capturado de pg_policies do projeto de produção `jinlong`
-- (ref kbabmewnahysfvlybiak) em 2026-07-17, cruzado contra todo `CREATE POLICY`
-- do repositório (case-insensitive). O relatório de auditoria anterior
-- (docs/DATABASE_INTEGRITY_REPORT.md, §5.5) identificou 11 policies fantasma a
-- partir dos blocos GUARD da migration 224 (snapshot de 2026-06-02). A
-- reconciliação direta contra produção revelou 37 policies fantasma no total.
--
-- ESCOPO DESTA MIGRATION (decisão do time — "versionar vivas, isolar mortas")
-- ==========================================================================
-- Versiona apenas as 19 policies que estão sobre TABELAS VIVAS e versionadas
-- (clientes, contas_receber, documentos_fiscais_pendentes, liquidacoes_receber,
-- itens_venda, ordens_compra, ordens_compra_itens, pdv_config, produtos,
-- tokens_desconto_gerente, transferencias_idempotencia).
--
-- As outras 18 policies fantasma pertencem a 6 TABELAS que não existem no
-- repositório e estão mortas/WIP em produção (0 linhas úteis, 0 uso pela
-- aplicação): perfis, funcionarios, funcionarios_meta,
-- comissoes_regras_funcionario, comissoes_regras_historico,
-- historico_precos_produto. Elas NÃO são canonizadas aqui — ver
-- docs/DATABASE_INTEGRITY_DECISIONS.md (decisão DEC-02) para o plano de DROP
-- em produção. Canonizá-las importaria schema morto como se fosse legítimo.
--
-- FIDELIDADE
-- ==========
-- Os predicados USING/WITH CHECK abaixo são reproduzidos VERBATIM de produção,
-- incluindo a forma initplan-otimizada `( SELECT auth.uid())` onde presente
-- (migration 224) e a forma direta `auth.uid()` nas 3 policies de `clientes`
-- criadas após aquele snapshot. Roles e comandos idênticos aos de produção.
--
-- IDEMPOTÊNCIA / SEGURANÇA
-- ========================
-- DROP POLICY IF EXISTS + CREATE POLICY: num bootstrap do zero o DROP é no-op e
-- o CREATE cria; num banco que já tem a policy (produção), recria idêntico
-- dentro da mesma transação. Postgres não suporta CREATE POLICY IF NOT EXISTS.
-- Todas as tabelas-alvo já têm RLS habilitado nas suas migrations de criação.
--
-- ROLLBACK: DROP POLICY IF EXISTS de cada policy abaixo.

BEGIN;

-- ─── clientes ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clientes_loja_isolado" ON public.clientes;
CREATE POLICY "clientes_loja_isolado" ON public.clientes
  AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = clientes.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = clientes.loja_id))))));

DROP POLICY IF EXISTS "clientes_insert_loja" ON public.clientes;
CREATE POLICY "clientes_insert_loja" ON public.clientes
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = auth.uid()) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = clientes.loja_id))))));

DROP POLICY IF EXISTS "clientes_update_gerente_loja" ON public.clientes;
CREATE POLICY "clientes_update_gerente_loja" ON public.clientes
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = clientes.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = clientes.loja_id))))));

DROP POLICY IF EXISTS "clientes_delete_gerente_loja" ON public.clientes;
CREATE POLICY "clientes_delete_gerente_loja" ON public.clientes
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = clientes.loja_id))))));

-- ─── contas_receber ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contas_receber_loja_isolado" ON public.contas_receber;
CREATE POLICY "contas_receber_loja_isolado" ON public.contas_receber
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = contas_receber.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = contas_receber.loja_id))))));

-- ─── documentos_fiscais_pendentes ───────────────────────────────────────────
DROP POLICY IF EXISTS "doc_fiscal_loja_isolado" ON public.documentos_fiscais_pendentes;
CREATE POLICY "doc_fiscal_loja_isolado" ON public.documentos_fiscais_pendentes
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM ((vendas v
       JOIN caixas c ON ((c.id = v.caixa_id)))
       JOIN usuarios u ON ((u.id = ( SELECT auth.uid() AS uid))))
    WHERE ((v.id = documentos_fiscais_pendentes.venda_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = c.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM ((vendas v
       JOIN caixas c ON ((c.id = v.caixa_id)))
       JOIN usuarios u ON ((u.id = ( SELECT auth.uid() AS uid))))
    WHERE ((v.id = documentos_fiscais_pendentes.venda_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = c.loja_id))))));

-- ─── liquidacoes_receber ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "liquidacoes_loja_isolado" ON public.liquidacoes_receber;
CREATE POLICY "liquidacoes_loja_isolado" ON public.liquidacoes_receber
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM (contas_receber cr
       JOIN usuarios u ON ((u.id = ( SELECT auth.uid() AS uid))))
    WHERE ((cr.id = liquidacoes_receber.titulo_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = cr.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM (contas_receber cr
       JOIN usuarios u ON ((u.id = ( SELECT auth.uid() AS uid))))
    WHERE ((cr.id = liquidacoes_receber.titulo_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = cr.loja_id))))));

-- ─── itens_venda ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "itens_venda_select_loja" ON public.itens_venda;
CREATE POLICY "itens_venda_select_loja" ON public.itens_venda
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM ((vendas v
       JOIN caixas cx ON ((cx.id = v.caixa_id)))
       JOIN usuarios u ON ((u.id = ( SELECT auth.uid() AS uid))))
    WHERE ((v.id = itens_venda.venda_id) AND ((u.perfil = 'ADMIN'::text) OR (cx.loja_id = u.loja_id))))));

DROP POLICY IF EXISTS "itens_venda_write_gerente_loja" ON public.itens_venda;
CREATE POLICY "itens_venda_write_gerente_loja" ON public.itens_venda
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM ((vendas v
       JOIN caixas cx ON ((cx.id = v.caixa_id)))
       JOIN usuarios u ON ((u.id = ( SELECT auth.uid() AS uid))))
    WHERE ((v.id = itens_venda.venda_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (cx.loja_id = u.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM ((vendas v
       JOIN caixas cx ON ((cx.id = v.caixa_id)))
       JOIN usuarios u ON ((u.id = ( SELECT auth.uid() AS uid))))
    WHERE ((v.id = itens_venda.venda_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (cx.loja_id = u.loja_id))))));

-- ─── ordens_compra ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ordens_compra_gerente_loja" ON public.ordens_compra;
CREATE POLICY "ordens_compra_gerente_loja" ON public.ordens_compra
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = ordens_compra.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = ordens_compra.loja_id))))));

-- ─── ordens_compra_itens ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ordens_compra_itens_gerente_loja" ON public.ordens_compra_itens;
CREATE POLICY "ordens_compra_itens_gerente_loja" ON public.ordens_compra_itens
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM (ordens_compra oc
       JOIN usuarios u ON ((u.id = ( SELECT auth.uid() AS uid))))
    WHERE ((oc.id = ordens_compra_itens.ordem_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = oc.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM (ordens_compra oc
       JOIN usuarios u ON ((u.id = ( SELECT auth.uid() AS uid))))
    WHERE ((oc.id = ordens_compra_itens.ordem_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = oc.loja_id))))));

-- ─── pdv_config ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pdv_config_select_gerencial" ON public.pdv_config;
CREATE POLICY "pdv_config_select_gerencial" ON public.pdv_config
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = pdv_config.loja_id) OR (pdv_config.loja_id IS NULL))))));

DROP POLICY IF EXISTS "pdv_config_update_dono" ON public.pdv_config;
CREATE POLICY "pdv_config_update_dono" ON public.pdv_config
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = pdv_config.loja_id) OR (pdv_config.loja_id IS NULL))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = pdv_config.loja_id) OR (pdv_config.loja_id IS NULL))))));

-- ─── produtos ───────────────────────────────────────────────────────────────
-- NOTA (ver DECISIONS DEC-03): caixa_policy/painel_policy usam auth.jwt()->>'role'
-- ('caixa'/'painel'), um esquema de auth legado que a aplicação atual não emite.
-- São vestigiais/no-op no fluxo atual (o SELECT de produtos funciona via
-- produtos_leitura). Versionadas aqui apenas para paridade exata com produção;
-- candidatas a remoção posterior.
DROP POLICY IF EXISTS "caixa_policy" ON public.produtos;
CREATE POLICY "caixa_policy" ON public.produtos
  AS PERMISSIVE FOR SELECT TO public
  USING (((auth.jwt() ->> 'role'::text) = 'caixa'::text));

DROP POLICY IF EXISTS "painel_policy" ON public.produtos;
CREATE POLICY "painel_policy" ON public.produtos
  AS PERMISSIVE FOR SELECT TO public
  USING (((auth.jwt() ->> 'role'::text) = 'painel'::text));

-- ─── tokens_desconto_gerente ────────────────────────────────────────────────
DROP POLICY IF EXISTS "tokens_desconto_select_gerente" ON public.tokens_desconto_gerente;
CREATE POLICY "tokens_desconto_select_gerente" ON public.tokens_desconto_gerente
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (tokens_desconto_gerente.criado_por = ( SELECT auth.uid() AS uid)))))));

-- ─── transferencias_idempotencia ────────────────────────────────────────────
DROP POLICY IF EXISTS "transferencias_idempotencia_select_gerente" ON public.transferencias_idempotencia;
CREATE POLICY "transferencias_idempotencia_select_gerente" ON public.transferencias_idempotencia
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
     FROM usuarios
    WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

DROP POLICY IF EXISTS "transferencias_idempotencia_insert_gerente" ON public.transferencias_idempotencia;
CREATE POLICY "transferencias_idempotencia_insert_gerente" ON public.transferencias_idempotencia
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
     FROM usuarios
    WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

DROP POLICY IF EXISTS "transferencias_idempotencia_delete_gerente" ON public.transferencias_idempotencia;
CREATE POLICY "transferencias_idempotencia_delete_gerente" ON public.transferencias_idempotencia
  AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
     FROM usuarios
    WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

COMMIT;

-- ─── VERIFICAÇÃO (rodar após aplicar) ───────────────────────────────────────
-- Deve retornar 19 (todas as policies versionadas presentes):
--   SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname IN (
--     'clientes_loja_isolado','clientes_insert_loja','clientes_update_gerente_loja',
--     'clientes_delete_gerente_loja','contas_receber_loja_isolado','doc_fiscal_loja_isolado',
--     'liquidacoes_loja_isolado','itens_venda_select_loja','itens_venda_write_gerente_loja',
--     'ordens_compra_gerente_loja','ordens_compra_itens_gerente_loja','pdv_config_select_gerencial',
--     'pdv_config_update_dono','caixa_policy','painel_policy','tokens_desconto_select_gerente',
--     'transferencias_idempotencia_select_gerente','transferencias_idempotencia_insert_gerente',
--     'transferencias_idempotencia_delete_gerente');
