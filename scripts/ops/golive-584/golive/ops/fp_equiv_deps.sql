SELECT k FROM (
SELECT 'dep|'||classid::regclass||'|'||coalesce((SELECT proname FROM pg_proc WHERE oid=d.objid),(SELECT relname FROM pg_class WHERE oid=d.objid),(SELECT tgname FROM pg_trigger WHERE oid=d.objid),d.objid::text)||'|'||deptype::text k FROM pg_depend d WHERE refobjid='public.pdv_registrar_alertas_margem_venda(uuid)'::regprocedure
UNION ALL SELECT 'trg|'||tgrelid::regclass||'|'||tgname k FROM pg_trigger WHERE tgfoid='public.pdv_registrar_alertas_margem_venda(uuid)'::regprocedure
UNION ALL SELECT 'caller|'||p.oid::regprocedure::text k FROM pg_proc p WHERE p.prosrc ILIKE '%pdv_registrar_alertas_margem_venda%' AND p.oid<>'public.pdv_registrar_alertas_margem_venda(uuid)'::regprocedure
UNION ALL SELECT 'meta|owner='||pg_get_userbyid(proowner)||'|acl='||coalesce(proacl::text,'')||'|vol='||provolatile::text||'|par='||proparallel::text||'|leak='||proleakproof||'|strict='||proisstrict||'|cost='||procost FROM pg_proc WHERE oid='public.pdv_registrar_alertas_margem_venda(uuid)'::regprocedure
) u ORDER BY k COLLATE "C";
