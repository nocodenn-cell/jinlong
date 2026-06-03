-- 224_rls_initplan_wrap_auth_select.sql
--
-- PERFORMANCE (RLS initplan): envolve auth.uid()/auth.role() em (select ...).
--
-- Por quê: sem o subselect, o Postgres re-avalia a função de auth UMA VEZ POR
-- LINHA em cada query sob RLS (advisor `auth_rls_initplan`). Com `(select auth.uid())`
-- o planner promove a chamada a um InitPlan avaliado UMA VEZ por query. Em tabelas
-- grandes (vendas, itens_venda, movimentos_estoque_log, documentos_fiscais_*) isso
-- domina o custo de toda leitura do painel gerente.
--
-- SEM MUDANÇA DE COMPORTAMENTO: auth.uid()/auth.role() são STABLE dentro do
-- statement; avaliar uma vez vs. por-linha retorna o mesmo valor. As policies
-- mantêm exatamente a mesma lógica de acesso.
--
-- SEGURANÇA DA APLICAÇÃO: usa ALTER POLICY (não DROP/CREATE) — não há janela em
-- que a policy deixe de existir (que, com RLS default-deny, bloquearia usuários
-- no meio da migration). Roles e comandos (SELECT/INSERT/UPDATE/DELETE) ficam
-- intactos; só as expressões USING/WITH CHECK são reescritas.
--
-- Gerado a partir de pg_policies (schema public) em 2026-06-02. 93 policies.
-- Reversão: ver 224_rollback (abaixo, comentado) — basta re-rodar o advisor.

BEGIN;

ALTER POLICY "caixa_scan_telemetry_events_insert_own" ON public.caixa_scan_telemetry_events
  WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "caixas_delete_authenticated" ON public.caixas
  USING (((operador_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'DONO'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'ADMIN'::text])) AND (u.loja_id = caixas.loja_id))))))));

ALTER POLICY "caixas_insert_authenticated" ON public.caixas
  WITH CHECK (((operador_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.loja_id = caixas.loja_id))))));

ALTER POLICY "caixas_select_authenticated" ON public.caixas
  USING (((operador_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'DONO'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'ADMIN'::text])) AND (u.loja_id = caixas.loja_id))))))));

ALTER POLICY "caixas_update_authenticated" ON public.caixas
  USING (((operador_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'DONO'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'ADMIN'::text])) AND (u.loja_id = caixas.loja_id))))))))
  WITH CHECK (((operador_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'DONO'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'ADMIN'::text])) AND (u.loja_id = caixas.loja_id))))))));

ALTER POLICY "categorias_escrita" ON public.categorias
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "categorias_leitura" ON public.categorias
  USING (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "dono_gerente_all_cat_fin" ON public.categorias_financeiras
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['DONO'::text, 'GERENTE'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['DONO'::text, 'GERENTE'::text]))))));

ALTER POLICY "clientes_loja_isolado" ON public.clientes
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = clientes.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = clientes.loja_id))))));

ALTER POLICY "clientes_select_loja" ON public.clientes
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = clientes.loja_id))))));

ALTER POLICY "clientes_write_gerente_loja" ON public.clientes
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = clientes.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = clientes.loja_id))))));

ALTER POLICY "comissoes_select_gerencial" ON public.comissoes_vendedores
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = comissoes_vendedores.loja_id))))));

ALTER POLICY "comissoes_update_gerencial" ON public.comissoes_vendedores
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = comissoes_vendedores.loja_id))))));

ALTER POLICY "configuracoes_gerais_select_gerencial" ON public.configuracoes_gerais
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "configuracoes_gerais_update_gerencial" ON public.configuracoes_gerais
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "contas_pagar_gerente" ON public.contas_pagar
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = contas_pagar.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = contas_pagar.loja_id))))));

ALTER POLICY "cpp_gerente" ON public.contas_pagar_pagamentos
  USING ((EXISTS ( SELECT 1
   FROM (contas_pagar cp
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((cp.id = contas_pagar_pagamentos.conta_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = cp.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (contas_pagar cp
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((cp.id = contas_pagar_pagamentos.conta_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = cp.loja_id))))));

ALTER POLICY "contas_receber_loja_isolado" ON public.contas_receber
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = contas_receber.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = contas_receber.loja_id))))));

ALTER POLICY "contas_receber_select_loja" ON public.contas_receber
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = contas_receber.loja_id))))));

ALTER POLICY "contas_receber_write_gerente_loja" ON public.contas_receber
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = contas_receber.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = contas_receber.loja_id))))));

ALTER POLICY "descontos_venda_delete_gerente_dono" ON public.descontos_venda
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "descontos_venda_insert_gerente_dono" ON public.descontos_venda
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "descontos_venda_select_gerente_dono" ON public.descontos_venda
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "descontos_venda_update_gerente_dono" ON public.descontos_venda
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "devolucoes_delete_gerente_loja" ON public.devolucoes
  USING ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = devolucoes.venda_id) AND (c.loja_id = u.loja_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "devolucoes_insert_loja" ON public.devolucoes
  WITH CHECK (((operador_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = devolucoes.venda_id) AND (c.loja_id = u.loja_id))))));

ALTER POLICY "devolucoes_select_loja" ON public.devolucoes
  USING ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = devolucoes.venda_id) AND (c.loja_id = u.loja_id) AND ((devolucoes.operador_id = (select auth.uid())) OR (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])))))));

ALTER POLICY "devolucoes_update_gerente_loja" ON public.devolucoes
  USING ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = devolucoes.venda_id) AND (c.loja_id = u.loja_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = devolucoes.venda_id) AND (c.loja_id = u.loja_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "doc_fiscal_eventos_select_loja" ON public.documentos_fiscais_eventos
  USING ((EXISTS ( SELECT 1
   FROM (((documentos_fiscais_pendentes d
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
     JOIN vendas v ON ((v.id = d.venda_id)))
     JOIN caixas c ON ((c.id = v.caixa_id)))
  WHERE ((d.id = documentos_fiscais_eventos.documento_id) AND ((u.perfil = 'ADMIN'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])) AND (c.loja_id = u.loja_id)))))));

ALTER POLICY "doc_fiscal_loja_isolado" ON public.documentos_fiscais_pendentes
  USING ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = documentos_fiscais_pendentes.venda_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = c.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = documentos_fiscais_pendentes.venda_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = c.loja_id))))));

ALTER POLICY "doc_fiscal_pendentes_delete_loja" ON public.documentos_fiscais_pendentes
  USING ((EXISTS ( SELECT 1
   FROM ((usuarios u
     JOIN vendas v ON ((v.id = documentos_fiscais_pendentes.venda_id)))
     JOIN caixas c ON ((c.id = v.caixa_id)))
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'ADMIN'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])) AND (c.loja_id = u.loja_id)))))));

ALTER POLICY "doc_fiscal_pendentes_insert_loja" ON public.documentos_fiscais_pendentes
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((usuarios u
     JOIN vendas v ON ((v.id = documentos_fiscais_pendentes.venda_id)))
     JOIN caixas c ON ((c.id = v.caixa_id)))
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'ADMIN'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])) AND (c.loja_id = u.loja_id)))))));

ALTER POLICY "doc_fiscal_pendentes_select_loja" ON public.documentos_fiscais_pendentes
  USING ((EXISTS ( SELECT 1
   FROM ((usuarios u
     JOIN vendas v ON ((v.id = documentos_fiscais_pendentes.venda_id)))
     JOIN caixas c ON ((c.id = v.caixa_id)))
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'ADMIN'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])) AND (c.loja_id = u.loja_id)))))));

ALTER POLICY "doc_fiscal_pendentes_update_loja" ON public.documentos_fiscais_pendentes
  USING ((EXISTS ( SELECT 1
   FROM ((usuarios u
     JOIN vendas v ON ((v.id = documentos_fiscais_pendentes.venda_id)))
     JOIN caixas c ON ((c.id = v.caixa_id)))
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'ADMIN'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])) AND (c.loja_id = u.loja_id)))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((usuarios u
     JOIN vendas v ON ((v.id = documentos_fiscais_pendentes.venda_id)))
     JOIN caixas c ON ((c.id = v.caixa_id)))
  WHERE ((u.id = (select auth.uid())) AND ((u.perfil = 'ADMIN'::text) OR ((u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])) AND (c.loja_id = u.loja_id)))))));

ALTER POLICY "estoque_delete_gerente_loja" ON public.estoque
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND (u.loja_id = estoque.loja_id)))));

ALTER POLICY "estoque_insert_gerente_loja" ON public.estoque
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND (u.loja_id = estoque.loja_id)))));

ALTER POLICY "estoque_select_dono_todas_lojas" ON public.estoque
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = 'DONO'::text)))));

ALTER POLICY "estoque_select_mesma_loja" ON public.estoque
  USING ((loja_id = ( SELECT u.loja_id
   FROM usuarios u
  WHERE (u.id = (select auth.uid())))));

ALTER POLICY "estoque_update_gerente_loja" ON public.estoque
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND (u.loja_id = estoque.loja_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND (u.loja_id = estoque.loja_id)))));

ALTER POLICY "estoque_baixas_select_gerente_dono" ON public.estoque_baixas
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "estoque_reposicoes_cancelamento_insert_gerente" ON public.estoque_reposicoes_cancelamento
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = estoque_reposicoes_cancelamento.venda_id) AND (c.loja_id = u.loja_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "estoque_reposicoes_cancelamento_select_loja" ON public.estoque_reposicoes_cancelamento
  USING ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = estoque_reposicoes_cancelamento.venda_id) AND (c.loja_id = u.loja_id) AND ((v.operador_id = (select auth.uid())) OR (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])))))));

ALTER POLICY "Feature flags - DELETE para admin/service_role" ON public.feature_flags
  USING ((((select auth.role()) = 'service_role'::text) OR (((select auth.role()) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]))))))));

ALTER POLICY "Feature flags - INSERT para admin/service_role" ON public.feature_flags
  WITH CHECK ((((select auth.role()) = 'service_role'::text) OR (((select auth.role()) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]))))))));

ALTER POLICY "Feature flags - SELECT para authenticated" ON public.feature_flags
  USING (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "Feature flags - UPDATE para admin/service_role" ON public.feature_flags
  USING ((((select auth.role()) = 'service_role'::text) OR (((select auth.role()) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text]))))))));

ALTER POLICY "fornecedores_gerente_all" ON public.fornecedores
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "importacoes_nfe_gerente_all" ON public.importacoes_nfe
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "itens_gerente" ON public.itens_venda
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "itens_insert" ON public.itens_venda
  WITH CHECK (((EXISTS ( SELECT 1
   FROM vendas v
  WHERE ((v.id = itens_venda.venda_id) AND (v.operador_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])))))));

ALTER POLICY "liquidacoes_loja_isolado" ON public.liquidacoes_receber
  USING ((EXISTS ( SELECT 1
   FROM (contas_receber cr
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((cr.id = liquidacoes_receber.titulo_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = cr.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (contas_receber cr
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((cr.id = liquidacoes_receber.titulo_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = cr.loja_id))))));

ALTER POLICY "liquidacoes_select_loja" ON public.liquidacoes_receber
  USING ((EXISTS ( SELECT 1
   FROM (contas_receber cr
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((cr.id = liquidacoes_receber.titulo_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = cr.loja_id))))));

ALTER POLICY "liquidacoes_write_gerente_loja" ON public.liquidacoes_receber
  USING ((EXISTS ( SELECT 1
   FROM (contas_receber cr
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((cr.id = liquidacoes_receber.titulo_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = cr.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (contas_receber cr
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((cr.id = liquidacoes_receber.titulo_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = 'ADMIN'::text) OR (u.loja_id = cr.loja_id))))));

ALTER POLICY "lojas_select_authenticated" ON public.lojas
  USING (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "lojas_write_gerente" ON public.lojas
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "marcas_escrita_gerencial" ON public.marcas
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "movimentacoes_caixa_select_loja" ON public.movimentacoes_caixa
  USING ((EXISTS ( SELECT 1
   FROM (caixas c
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((c.id = movimentacoes_caixa.caixa_id) AND (c.loja_id = u.loja_id) AND ((movimentacoes_caixa.operador_id = (select auth.uid())) OR (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])))))));

ALTER POLICY "movimentos_gerente" ON public.movimentos_caixa
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text]))))));

ALTER POLICY "movimentos_insert" ON public.movimentos_caixa
  WITH CHECK (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "mov_estoque_log_gerente_all" ON public.movimentos_estoque_log
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "oc_auth" ON public.ordens_compra
  USING ((loja_id = ( SELECT u.loja_id
   FROM usuarios u
  WHERE (u.id = (select auth.uid())))))
  WITH CHECK ((loja_id = ( SELECT u.loja_id
   FROM usuarios u
  WHERE (u.id = (select auth.uid())))));

ALTER POLICY "oci_auth" ON public.ordens_compra_itens
  USING ((EXISTS ( SELECT 1
   FROM (ordens_compra oc
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((oc.id = ordens_compra_itens.ordem_id) AND (oc.loja_id = u.loja_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (ordens_compra oc
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((oc.id = ordens_compra_itens.ordem_id) AND (oc.loja_id = u.loja_id)))));

ALTER POLICY "perfis_delete_policy" ON public.perfis
  USING ((EXISTS ( SELECT 1
   FROM perfis p
  WHERE ((p.user_id = (select auth.uid())) AND (p.loja_id = perfis.loja_id) AND (p.perfil = ANY (ARRAY['GERENTE'::text, 'ADMIN'::text]))))));

ALTER POLICY "perfis_insert_policy" ON public.perfis
  WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "perfis_select_policy" ON public.perfis
  USING ((((select auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM perfis p
  WHERE ((p.user_id = (select auth.uid())) AND (p.loja_id = perfis.loja_id) AND (p.perfil = ANY (ARRAY['GERENTE'::text, 'ADMIN'::text])))))));

ALTER POLICY "perfis_update_policy" ON public.perfis
  USING (((select auth.uid()) = user_id))
  WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "precos_atacado_escrita" ON public.precos_atacado
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text]))))));

ALTER POLICY "precos_atacado_leitura" ON public.precos_atacado
  USING (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "produtos_escrita" ON public.produtos
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "produtos_leitura" ON public.produtos
  USING (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "regras_escrita" ON public.regras_preco
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "regras_leitura" ON public.regras_preco
  USING (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "relatorio_settings_select_gerente_dono" ON public.relatorio_settings
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "relatorio_settings_update_gerente_dono" ON public.relatorio_settings
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "remessa_itens_gerente_all" ON public.remessa_itens
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "remessas_gerente_all" ON public.remessas
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "tipos_mov_select" ON public.tipos_movimento_estoque
  USING (((select auth.role()) = 'authenticated'::text));

ALTER POLICY "transferencias_idempotencia_delete_gerente" ON public.transferencias_idempotencia
  USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = (select auth.uid())) AND (usuarios.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "transferencias_idempotencia_insert_gerente" ON public.transferencias_idempotencia
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = (select auth.uid())) AND (usuarios.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "transferencias_idempotencia_select_gerente" ON public.transferencias_idempotencia
  USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = (select auth.uid())) AND (usuarios.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "transferencias_idempotencia_self_select" ON public.transferencias_idempotencia
  USING ((usuario_id = (select auth.uid())));

ALTER POLICY "usuario_select_own" ON public.usuarios
  USING (((select auth.uid()) = id));

ALTER POLICY "usuarios_update_idioma_gerente_dono" ON public.usuarios
  USING ((((select auth.uid()) = id) AND (perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text]))))
  WITH CHECK ((((select auth.uid()) = id) AND (perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text])) AND (idioma_preferido = ANY (ARRAY['pt'::text, 'zh'::text]))));

ALTER POLICY "vendas_delete_loja" ON public.vendas
  USING ((EXISTS ( SELECT 1
   FROM (caixas c
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((c.id = vendas.caixa_id) AND (c.loja_id = u.loja_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "vendas_insert_loja" ON public.vendas
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (caixas c
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((c.id = vendas.caixa_id) AND (c.loja_id = u.loja_id) AND ((vendas.operador_id = (select auth.uid())) OR (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])))))));

ALTER POLICY "vendas_select_dono_todas_lojas" ON public.vendas
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = 'DONO'::text)))));

ALTER POLICY "vendas_select_loja" ON public.vendas
  USING ((EXISTS ( SELECT 1
   FROM (caixas c
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((c.id = vendas.caixa_id) AND (c.loja_id = u.loja_id) AND ((vendas.operador_id = (select auth.uid())) OR (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])))))));

ALTER POLICY "vendas_update_loja" ON public.vendas
  USING ((EXISTS ( SELECT 1
   FROM (caixas c
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((c.id = vendas.caixa_id) AND (c.loja_id = u.loja_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (caixas c
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((c.id = vendas.caixa_id) AND (c.loja_id = u.loja_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "vendas_canceladas_auditoria_insert_gerente" ON public.vendas_canceladas_auditoria
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (caixas c
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((c.id = vendas_canceladas_auditoria.caixa_id) AND (c.loja_id = u.loja_id) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));

ALTER POLICY "vendas_canceladas_auditoria_select_loja" ON public.vendas_canceladas_auditoria
  USING ((EXISTS ( SELECT 1
   FROM (caixas c
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((c.id = vendas_canceladas_auditoria.caixa_id) AND (c.loja_id = u.loja_id) AND ((vendas_canceladas_auditoria.operador_id = (select auth.uid())) OR (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])))))));

ALTER POLICY "vendas_pagamentos_insert_loja" ON public.vendas_pagamentos
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = vendas_pagamentos.venda_id) AND (c.loja_id = u.loja_id) AND ((v.operador_id = (select auth.uid())) OR (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])))))));

ALTER POLICY "vendas_pagamentos_select_loja" ON public.vendas_pagamentos
  USING ((EXISTS ( SELECT 1
   FROM ((vendas v
     JOIN caixas c ON ((c.id = v.caixa_id)))
     JOIN usuarios u ON ((u.id = (select auth.uid()))))
  WHERE ((v.id = vendas_pagamentos.venda_id) AND (c.loja_id = u.loja_id) AND ((v.operador_id = (select auth.uid())) OR (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])))))));

ALTER POLICY "vinculos_forn_prod_gerente" ON public.vinculos_fornecedor_produto
  USING ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = vinculos_fornecedor_produto.loja_id))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = (select auth.uid())) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND ((u.perfil = ANY (ARRAY['DONO'::text, 'ADMIN'::text])) OR (u.loja_id = vinculos_fornecedor_produto.loja_id))))));

COMMIT;

-- ─── VERIFICAÇÃO (rodar após aplicar) ───────────────────────────────────────
-- Deve retornar 0:
--   SELECT count(*) FROM pg_policies
--   WHERE schemaname='public'
--     AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ 'auth\.(uid|role|jwt|email)\(\)'
--     AND (coalesce(qual,'')||' '||coalesce(with_check,'')) !~ '\( SELECT auth\.';
-- E o advisor `auth_rls_initplan` deve sumir (get_advisors performance).
