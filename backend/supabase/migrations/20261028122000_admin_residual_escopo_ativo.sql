-- 20261028122000_admin_residual_escopo_ativo.sql
-- Homologação #620→#623 (varredura automática de ADMIN, 28/10/2026): com um ADMIN FORÇADO (ativo, sem vínculo),
-- três funções SECURITY DEFINER expostas a `authenticated` ainda concediam acesso GLOBAL e/ou não exigiam usuário
-- ativo/vínculo atual:
--   * public.auth_usuario_gerencial_loja(uuid)       — `u.perfil = 'ADMIN' OR u.loja_id = p_loja` e sem `ativo`
--                                                       (usada por 9 políticas RLS e RPCs gerenciais);
--   * public.produtos_custos_autorizados(uuid[])     — ADMIN via todas as lojas (view produtos_custos: 18 linhas
--                                                       de outra empresa visíveis);
--   * public.listar_caixas_elegiveis_desembolso()    — ADMIN listava caixas e não exigia `ativo`.
-- Regra nova (conservadora = interseção com a regra antiga, sem ampliar acesso de ninguém):
--   perfil atual DONO/GERENTE (OPERADOR só o próprio caixa), usuário ATIVO, mesma loja cadastral (regra antiga) E
--   vínculo ATIVO na empresa da loja (internal.fp_usuario_ativo_com_papel, migration 20261028120000).
-- Depende de: 20261028110000 (corte ADMIN) e 20261028120000. Rollback:
--   backend/supabase/rollback/20261028122000_admin_residual_escopo_ativo.rollback.sql

CREATE OR REPLACE FUNCTION public.auth_usuario_gerencial_loja(p_loja_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.usuarios u
     WHERE u.id = (SELECT auth.uid())
       AND u.ativo IS TRUE
       AND u.perfil IN ('GERENTE', 'DONO')
       AND u.loja_id = p_loja_id
       AND internal.fp_usuario_ativo_com_papel(u.id, p_loja_id, ARRAY['DONO', 'GERENTE'])
  );
$$;

CREATE OR REPLACE FUNCTION public.produtos_custos_autorizados(p_produto_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(produto_id uuid, loja_id uuid, preco_custo numeric, preco_custo_medio numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.loja_id, p.preco_custo, p.preco_custo_medio
    FROM public.produtos p
    JOIN public.usuarios u
      ON u.id = (SELECT auth.uid())
     AND u.ativo IS TRUE
     AND u.perfil IN ('GERENTE', 'DONO')
     AND u.loja_id = p.loja_id
   WHERE (p_produto_ids IS NULL OR p.id = ANY (p_produto_ids))
     AND internal.fp_usuario_ativo_com_papel(u.id, p.loja_id, ARRAY['DONO', 'GERENTE']);
$$;

CREATE OR REPLACE FUNCTION public.listar_caixas_elegiveis_desembolso()
RETURNS TABLE(id uuid, operador_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id,
         COALESCE(op.nome, left(c.id::text, 8)) AS operador_nome
    FROM public.usuarios me
    JOIN public.caixas c
      ON c.loja_id = me.loja_id
     AND c.status = 'ABERTO'
     AND (c.operador_id = me.id OR me.perfil IN ('GERENTE', 'DONO'))
    LEFT JOIN public.usuarios op ON op.id = c.operador_id
   WHERE me.id = auth.uid()
     AND me.ativo IS TRUE
     AND internal.fp_usuario_ativo_com_papel(me.id, me.loja_id, ARRAY['DONO', 'GERENTE', 'OPERADOR'])
   ORDER BY c.data_abertura ASC, c.id ASC;
$$;

-- Grants inalterados (CREATE OR REPLACE preserva); reafirma o mínimo.
REVOKE ALL ON FUNCTION public.auth_usuario_gerencial_loja(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.produtos_custos_autorizados(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_caixas_elegiveis_desembolso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_usuario_gerencial_loja(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.produtos_custos_autorizados(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_caixas_elegiveis_desembolso() TO authenticated, service_role;
