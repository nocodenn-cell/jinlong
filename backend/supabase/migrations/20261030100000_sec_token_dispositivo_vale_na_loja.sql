-- SEC-04 + dispositivo ativado (revisão Codex do PR #652, P1): token emitido pelo dispositivo (validar_gerente
-- do PDV) grava criado_por NULL, loja_id = loja do dispositivo e aprovador_id = gerente cuja senha foi conferida.
-- A regra anterior tratava "emissor ausente" como fora da loja, então fp_token_gerente_vale_na_loja (usado pelo
-- sync-outbox com STRICT_MANAGER_DISCOUNT_AUTH) recusava TODO token de dispositivo.
--
-- Nova regra: emissor ausente só vale quando o token é DA loja consultada e o aprovador ainda está ativo e
-- vinculado à empresa da loja (mesma checagem de internal.fp_aprovador_ativo_na_empresa usada no consumo).
-- Sem loja, sem aprovador ou aprovador inativo/sem vínculo continua fora (fail closed). Emissor presente segue
-- exatamente a regra de 20261028110000.
--
-- Não altera dados. Não aplicar em produção sem o label deploy-prod:aprovado (deploy-governance).

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
         -- Token de dispositivo (sem emissor): vale só na própria loja, com aprovador ativo da empresa.
         (t.criado_por IS NULL AND NOT COALESCE(
            t.loja_id IS NOT NULL
            AND p_loja_id IS NOT NULL
            AND lower(btrim(t.loja_id)) = p_loja_id::text
            AND t.aprovador_id IS NOT NULL
            AND internal.fp_aprovador_ativo_na_empresa(t.aprovador_id, p_loja_id), false))
         -- Token com emissor: regra de 20261028110000.
         OR (t.criado_por IS NOT NULL AND (
           u.id IS NULL
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
         ))
       )
  );
$function$;
COMMENT ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) IS
  'SEC-04 + empresa + dispositivo: true quando o token existe e NÃO vale na loja. Emissor ausente só vale se o token for da loja e o aprovador estiver ativo na empresa; emissor ausente sem isso, emissor não-DONO de outra loja, loja_id divergente ou DONO sem vínculo ⇒ fora. Token inexistente = false.';

COMMIT;
