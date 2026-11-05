-- Rollback de 20261028100000_sec_token_gerente_loja_nula_fora_da_loja.sql.
-- STATUS: PREPARADO PARA HOMOLOGAÇÃO. NÃO APLICADO EM PRODUÇÃO. Executar só com autorização do dono.
--
-- Restaura internal.token_gerente_fora_da_loja à definição anterior à 20261028100000, copiada de
-- 20260916120000_sec04_token_gerente_vinculo_loja_v4.sql (única definição anterior no repositório).
-- Não toca dados nem outras funções.
--
-- ORDEM OBRIGATÓRIA: se 20261028110000 ou 20261028120100 estiverem aplicadas, reverter ANTES os rollbacks
-- delas (120100 → 110000 → esta), porque elas redefinem a mesma função.
-- Execução prevista: psql "$DB_URL" -v ON_ERROR_STOP=1 -f <este arquivo>
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

REVOKE ALL ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
