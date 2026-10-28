-- Rollback de 20261028120000_sec_tokens_usuario_inativo_revogacao.sql (somente com autorização do dono).
-- Remove gatilhos/helpers novos e devolve token_gerente_fora_da_loja e consumir_token_autorizacao_operacao às
-- definições vigentes após 20261028110000_corte_admin_papeis.sql (copiadas abaixo, extraídas do banco de homologação). Colunas novas e a trilha
-- internal.tokens_revogacao_log ficam (aditivas, sem efeito sem os gatilhos) — preservam a auditoria.
BEGIN;
DROP TRIGGER IF EXISTS trg_token_gerente_consumo ON public.tokens_desconto_gerente;
DROP TRIGGER IF EXISTS trg_token_gerente_consumo ON public.tokens_autorizacao_operacao;
DROP TRIGGER IF EXISTS trg_revogar_tokens_usuario ON public.usuarios;
DROP TRIGGER IF EXISTS trg_revogar_tokens_vinculo ON public.usuario_vinculos;
DROP FUNCTION IF EXISTS internal.tg_token_gerente_consumo();
DROP FUNCTION IF EXISTS internal.tg_revogar_tokens_usuario();
DROP FUNCTION IF EXISTS internal.fp_revogar_tokens_usuario(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.fp_token_gerente_vale_na_loja(text, uuid);

-- Definições anteriores (pós-corte ADMIN, pré-20261028120000):
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
       )
  );
$function$;
CREATE OR REPLACE FUNCTION public.consumir_token_autorizacao_operacao(p_token text, p_finalidade text, p_alvo_id text, p_loja_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token text := NULLIF(btrim(p_token), '');
  v_gerente uuid;
BEGIN
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'AUTORIZACAO_TOKEN_OBRIGATORIO';
  END IF;

  -- Finalidade fora do conjunto conhecido é negada explicitamente.
  IF p_finalidade IS NULL OR p_finalidade NOT IN ('SANGRIA', 'PAGAMENTO_AP') THEN
    RAISE EXCEPTION 'AUTORIZACAO_FINALIDADE_DESCONHECIDA';
  END IF;

  IF NULLIF(btrim(COALESCE(p_alvo_id, '')), '') IS NULL OR p_loja_id IS NULL THEN
    RAISE EXCEPTION 'AUTORIZACAO_ALVO_OBRIGATORIO';
  END IF;

  SELECT t.gerente_id
  INTO v_gerente
  FROM public.tokens_autorizacao_operacao t
  WHERE t.token = v_token
    AND t.finalidade = p_finalidade
    AND t.alvo_id = btrim(p_alvo_id)
    AND t.loja_id = p_loja_id
    AND t.usado = false
    AND t.expira_em > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTORIZACAO_TOKEN_INVALIDO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios g
    WHERE g.id = v_gerente
      AND g.ativo = true
      AND g.loja_id = p_loja_id
      AND g.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'AUTORIZACAO_GERENTE_INVALIDO';
  END IF;

  -- Uso único: sob o FOR UPDATE acima duas transações concorrentes serializam e
  -- apenas a primeira encontra `usado = false`.
  UPDATE public.tokens_autorizacao_operacao
  SET usado = true, usado_em = now()
  WHERE token = v_token AND usado = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTORIZACAO_TOKEN_INVALIDO';
  END IF;

  RETURN v_gerente;
END;
$function$;
REVOKE ALL ON FUNCTION public.consumir_token_autorizacao_operacao(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_token_autorizacao_operacao(text, text, text, uuid) TO service_role;
DROP FUNCTION IF EXISTS internal.fp_token_gerente_motivo_invalido(uuid, uuid, uuid, text[]);
DROP FUNCTION IF EXISTS internal.fp_aprovador_ativo_na_empresa(uuid, uuid);
DROP FUNCTION IF EXISTS internal.fp_usuario_ativo_com_papel(uuid, uuid, text[]);
COMMIT;
