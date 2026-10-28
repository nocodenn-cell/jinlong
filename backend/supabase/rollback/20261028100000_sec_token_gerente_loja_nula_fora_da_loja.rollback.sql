-- Rollback de 20261028100000_sec_token_gerente_loja_nula_fora_da_loja.sql (PR #620).
-- Restaura internal.token_gerente_fora_da_loja com o corpo EXATO de produção antes do #620 (pg_get_functiondef,
-- 2026-10-28; md5 do corpo normalizado caac75282d9f0306fe104eebace8033e) e remove a versão do ledger.
BEGIN;
CREATE OR REPLACE FUNCTION internal.token_gerente_fora_da_loja(p_token text, p_loja_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.tokens_desconto_gerente t
      LEFT JOIN public.usuarios u ON u.id = t.criado_por
     WHERE t.token = p_token
       AND (
         u.id IS NULL
         OR (u.perfil NOT IN ('DONO', 'ADMIN') AND u.loja_id IS DISTINCT FROM p_loja_id)
         OR (t.loja_id IS NOT NULL
             AND lower(btrim(t.loja_id)) IS DISTINCT FROM p_loja_id::text)
       )
  );
$function$;
REVOKE ALL ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) FROM PUBLIC, anon, authenticated;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261028100000';
COMMIT;
