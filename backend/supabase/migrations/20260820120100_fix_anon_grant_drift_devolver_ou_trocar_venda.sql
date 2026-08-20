-- Fecha regressão introduzida pela migration 20260820120000 (DROP+CREATE de
-- devolver_ou_trocar_venda): recriar a função reativa o comportamento padrão do
-- Supabase de conceder EXECUTE a `anon` na criação (anon é grantee direto, não
-- alcançado pelo REVOKE ALL FROM PUBLIC — mesmo drift já documentado e corrigido
-- uma vez em 20260717031639_248_fix_anon_grant_drift.sql).
REVOKE EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) FROM anon;
