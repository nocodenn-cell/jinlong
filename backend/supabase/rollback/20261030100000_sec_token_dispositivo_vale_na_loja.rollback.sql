-- Rollback de 20261030100000: volta a regra de 20261028120100 (emissor ausente nunca vale).
-- Efeito: tokens de dispositivo voltam a ser recusados no sync-outbox em modo estrito. Não toca dados.
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
         OR t.revogado_em IS NOT NULL
         OR (u.perfil <> 'DONO' AND u.loja_id IS DISTINCT FROM p_loja_id)
         OR (t.loja_id IS NOT NULL
             AND lower(btrim(t.loja_id)) IS DISTINCT FROM p_loja_id::text)
         OR (u.perfil = 'DONO'
             AND NOT EXISTS (
               SELECT 1
                WHERE public.fp_empresa_da_loja(p_loja_id) IS NOT NULL
                  AND (
                    public.fp_empresa_da_loja(u.loja_id) = public.fp_empresa_da_loja(p_loja_id)
                    OR EXISTS (
                      SELECT 1
                        FROM public.usuario_vinculos v
                       WHERE v.usuario_id = u.id
                         AND v.ativo
                         AND v.empresa_id = public.fp_empresa_da_loja(p_loja_id)
                         AND (v.papel = 'DONO' OR v.loja_id = p_loja_id)
                    )
                  )
             ))
         -- 20261028120100: emissor e aprovador precisam estar ativos, com papel e vínculo na loja AGORA.
         OR NOT internal.fp_usuario_ativo_com_papel(t.criado_por, p_loja_id, ARRAY['DONO', 'GERENTE', 'OPERADOR'])
         OR (t.aprovador_id IS NOT NULL
             AND NOT internal.fp_aprovador_ativo_na_empresa(t.aprovador_id, p_loja_id))
       )
  );
$function$;

COMMENT ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) IS
  'SEC-04 + empresa + Corte ADMIN + revogação (20261028120100): true quando o token existe e NÃO vale na loja (emissor ausente/inativo/sem vínculo; aprovador inativo/sem vínculo; revogado; loja divergente; DONO sem vínculo com a empresa). Token inexistente = false.';

COMMIT;
