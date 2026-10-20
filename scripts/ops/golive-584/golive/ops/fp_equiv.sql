-- Impressão digital (somente leitura) dos objetos criados/alterados por 20261009180000/180001
SELECT k, v FROM (
SELECT 'view_def' k, md5(pg_get_viewdef('public.produtos_custos'::regclass,true)) v
UNION ALL SELECT 'view_opts', coalesce(array_to_string(c.reloptions,','),'') FROM pg_class c WHERE c.oid='public.produtos_custos'::regclass
UNION ALL SELECT 'view_owner', pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid='public.produtos_custos'::regclass
UNION ALL SELECT 'view_comment', md5(coalesce(obj_description('public.produtos_custos'::regclass,'pg_class'),''))
UNION ALL SELECT 'view_grants', (SELECT string_agg(grantee||':'||privilege_type,',' ORDER BY grantee,privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='produtos_custos' AND grantee IN ('anon','authenticated','service_role','PUBLIC'))
UNION ALL SELECT 'fn_margem_src', md5(p.prosrc)||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|secdef='||p.prosecdef||'|'||coalesce(array_to_string(p.proconfig,','),'')||'|'||l.lanname FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='public.pdv_registrar_alertas_margem_venda(uuid)'::regprocedure
UNION ALL SELECT 'fn_margem_acl', (SELECT string_agg(r,',' ORDER BY r) FROM (SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type r FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid='public.pdv_registrar_alertas_margem_venda(uuid)'::regprocedure AND (a.grantee=0 OR pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role'))) x)
UNION ALL SELECT 'fn_margem_comment', md5(coalesce(obj_description('public.pdv_registrar_alertas_margem_venda(uuid)'::regprocedure,'pg_proc'),''))
UNION ALL SELECT 'fn4_'||s, CASE WHEN position('p.preco_custo' in d)=0 AND (length(d)-length(replace(d,'LEFT JOIN public.produtos_custos pc','')))/length('LEFT JOIN public.produtos_custos pc')=1 THEN 'transformada_ok' ELSE 'NAO_TRANSFORMADA' END
  FROM (SELECT s, pg_get_functiondef(s::regprocedure) d FROM unnest(ARRAY['public.dashboard_gerente_resumo(uuid,text)','public.relatorio_margem_por_venda_periodo(date,date,text,integer)','public.relatorio_produtos_sem_giro_periodo(uuid,timestamp with time zone,timestamp with time zone)','public.relatorio_resumo_executivo_periodo(date,date,text)']) s) z
UNION ALL SELECT 'pol_sa_gerencial', (SELECT cmd||'|'||array_to_string(roles::text[],',')||'|'||md5(coalesce(qual,''))||'|'||coalesce(with_check,'') FROM pg_policies WHERE schemaname='public' AND tablename='system_alerts' AND policyname='system_alerts_select_gerencial')
UNION ALL SELECT 'pol_sa_auth_ausente', (SELECT (count(*)=0)::text FROM pg_policies WHERE schemaname='public' AND tablename='system_alerts' AND policyname='system_alerts_select_authenticated')
UNION ALL SELECT 'produtos_tbl_select_'||r, has_table_privilege(r,'public.produtos','SELECT')::text FROM unnest(ARRAY['anon','authenticated']) r
UNION ALL SELECT 'produtos_custo_select_'||r||'_'||c, has_column_privilege(r,'public.produtos',c,'SELECT')::text FROM unnest(ARRAY['anon','authenticated']) r, unnest(ARRAY['preco_custo','preco_custo_medio']) c
UNION ALL SELECT 'produtos_cols_sem_grant_'||r, (SELECT coalesce(string_agg(a.attname,',' ORDER BY a.attname),'') FROM pg_attribute a WHERE a.attrelid='public.produtos'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attname NOT IN ('preco_custo','preco_custo_medio') AND NOT has_column_privilege(r,'public.produtos',a.attname,'SELECT')) FROM unnest(ARRAY['anon','authenticated']) r
) u ORDER BY k COLLATE "C";
