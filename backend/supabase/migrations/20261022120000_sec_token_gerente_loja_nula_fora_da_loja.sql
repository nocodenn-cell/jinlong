-- SEC: token de gerente com loja_id NULL deixa de valer globalmente.
--
-- Antes (20260916120000), um token sem loja_id emitido por DONO/ADMIN passava em
-- qualquer loja, inclusive de outra empresa. Agora `loja_id IS NULL` = fora da loja.
-- Emissores atuais: validar-gerente sempre grava loja_id (patch ESCOPO_GERENTE_SEM_EMPRESA);
-- o emissor legado do sync-outbox grava criado_por NULL, que já era tratado como fora da loja.
--
-- NÃO APLICAR no Supabase remoto sem revisão do dono e validação em homologação.
-- Antes de aplicar: SELECT count(*) FROM public.tokens_desconto_gerente
--   WHERE loja_id IS NULL AND usado = false AND expira_em > now();  (somente leitura)

BEGIN;

CREATE OR REPLACE FUNCTION internal.token_gerente_fora_da_loja(
  p_token text,
  p_loja_id uuid
)
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
         OR t.loja_id IS NULL
         OR btrim(t.loja_id::text) = ''
         OR p_loja_id IS NULL
         OR (u.perfil NOT IN ('DONO', 'ADMIN') AND u.loja_id IS DISTINCT FROM p_loja_id)
         OR lower(btrim(t.loja_id::text)) IS DISTINCT FROM p_loja_id::text
       )
  );
$function$;

COMMENT ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) IS
  'SEC-04 + loja nula: true quando o token existe e NÃO pertence à loja (emissor ausente, loja_id do token nulo/vazio/divergente, ou emissor não DONO/ADMIN de outra loja). Token inexistente = false.';

REVOKE ALL ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
