-- Rollback de 20261028100000_sec_token_gerente_loja_nula_fora_da_loja.sql.
-- Restaura internal.token_gerente_fora_da_loja(text, uuid) ao corpo de 20260916120000_sec04_token_gerente_vinculo_loja_v4.sql
-- (sem o ramo DONO/ADMIN por empresa). Efeito: volta a aceitar token de DONO/ADMIN emitido em outra empresa.
-- Não há dados a restaurar: a migration só substitui a função e o comentário.
-- Pré-requisito: reverter ANTES, nesta ordem, as migrations posteriores que reescrevem esta mesma função
-- (se aplicadas): 20261030100000, 20261028122000, 20261028121000, 20261028120100, 20261028110000 (cada uma tem rollback próprio).
-- Sem esse passo, o rollback derruba as guardas de revogação/Corte ADMIN que dependem desta função.
-- Permissões: a migration faz REVOKE ALL FROM PUBLIC, anon, authenticated; o rollback mantém o mesmo REVOKE.

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
         OR (u.perfil NOT IN ('DONO', 'ADMIN') AND u.loja_id IS DISTINCT FROM p_loja_id)
         OR (t.loja_id IS NOT NULL
             AND lower(btrim(t.loja_id)) IS DISTINCT FROM p_loja_id::text)
       )
  );
$function$;

COMMENT ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) IS
  'SEC-04: true quando o token de gerente existe e NÃO pertence à loja (emissor criado_por fora da loja e sem perfil DONO/ADMIN, ou loja_id gravado divergente). Token inexistente = false (existência/uso/expiração ficam com a v4_unscoped).';

REVOKE ALL ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
