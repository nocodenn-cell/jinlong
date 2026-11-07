-- SEC-04 + dispositivo ativado (revisão Codex do PR #652, P1): token emitido pelo dispositivo (validar_gerente
-- do PDV) grava criado_por NULL, loja_id = loja do dispositivo e aprovador_id = gerente cuja senha foi conferida.
-- A regra anterior tratava "emissor ausente" como fora da loja, então fp_token_gerente_vale_na_loja (usado pelo
-- sync-outbox com STRICT_MANAGER_DISCOUNT_AUTH) recusava TODO token de dispositivo.
--
-- Nova regra: emissor ausente só vale quando o token é DA loja consultada e o aprovador ainda está ativo e
-- vinculado à empresa da loja (mesma checagem de internal.fp_aprovador_ativo_na_empresa usada no consumo).
-- Sem loja, sem aprovador ou aprovador inativo/sem vínculo continua fora (fail closed). Emissor presente segue
-- exatamente a regra de 20261028120100 (emissor, revogação, aprovador).
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
         -- Token de dispositivo (sem emissor): vale só na própria loja, revogado não, com aprovador ativo da empresa.
         (t.criado_por IS NULL AND NOT COALESCE(
            t.revogado_em IS NULL
            AND t.loja_id IS NOT NULL
            AND p_loja_id IS NOT NULL
            AND lower(btrim(t.loja_id)) = p_loja_id::text
            AND t.aprovador_id IS NOT NULL
            AND internal.fp_aprovador_ativo_na_empresa(t.aprovador_id, p_loja_id), false))
         -- Token com emissor: regra de 20261028120100 (inalterada).
         OR (t.criado_por IS NOT NULL AND (
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
         ))
       )
  );
$function$;

COMMENT ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) IS
  'SEC-04 + revogação + dispositivo (20261030100000): true quando o token existe e NÃO vale na loja. Token de dispositivo (sem emissor) vale só na própria loja, não revogado, com aprovador ativo na empresa da loja; com emissor, regra de 20261028120100. Token inexistente = false.';

COMMIT;
