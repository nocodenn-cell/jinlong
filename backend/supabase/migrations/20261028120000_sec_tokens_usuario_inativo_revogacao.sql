-- 20261028120000_sec_tokens_usuario_inativo_revogacao.sql
-- Decisão do dono (28/10/2026, item 3 "Tokens de usuários inativos — corrigir antes do GO"):
-- usuário inativado ou sem vínculo NÃO pode continuar executando operações protegidas com tokens antigos.
--
-- NÃO APLICAR no Supabase remoto sem autorização expressa. Depende de #620 (20261028100000, 20261028101000)
-- e #623 (20261028110000_corte_admin_papeis). Aditivo; rollback em
-- backend/supabase/rollback/20261028120000_sec_tokens_usuario_inativo_revogacao.rollback.sql
--
-- Regra única, verificada NO USO (não na emissão):
--   * internal.fp_usuario_ativo_com_papel(usuario, loja, papeis): usuarios.ativo = true, perfil atual ∈ papeis e
--     vínculo ATIVO na empresa da loja (DONO cobre a empresa; GERENTE/OPERADOR só a própria loja) com papel ∈ papeis.
--     Usa public.fp_usuario_pode_loja (mesma regra das guardas multiempresa) ⇒ isolamento entre empresas mantido.
--   * Token de gerente (tokens_desconto_gerente — desconto, limite de crédito, retomada de caixa) e token tipado
--     (tokens_autorizacao_operacao — sangria, pagamento AP): ao CONSUMIR (usado false → true) um gatilho confere
--     emissor/solicitante (DONO/GERENTE/OPERADOR, vínculo na loja), aprovador (DONO/GERENTE com vínculo na
--     empresa da loja — a senha de gerente é por empresa) e o usuário que está agindo
--     (auth.uid(), quando houver). Falha ⇒ TOKEN_GERENTE_REVOGADO e a transação do consumidor aborta.
--     Cobre todos os consumidores (finalizar_venda v4/legado, retomar_caixa_atomico, aprovar_movimentacao,
--     registrar_pagamento_contas_pagar) sem reescrever cada função.
--   * internal.token_gerente_fora_da_loja passa a considerar fora da loja o token cujo emissor/aprovador não está
--     mais ativo/vinculado (consumidores que checam antes de escrever recusam cedo).
--   * Revogação ativa: inativar usuário, trocar perfil, desativar/remover vínculo ⇒ tokens pendentes desse usuário
--     (como emissor, solicitante ou aprovador) são marcados usados + revogado_em/revogado_motivo, com trilha em
--     internal.tokens_revogacao_log.
--   * consumir_token_autorizacao_operacao sem o perfil ADMIN e exigindo vínculo do aprovador e do solicitante.
--   * public.fp_token_gerente_vale_na_loja(token, loja): leitura para o sync-outbox (service_role) conferir o token
--     informado numa venda offline (existe, da loja e com emissor/aprovador válidos), sem consumir.
-- Guardas de RLS/RPC (fp_pode_loja, fp_lojas_permitidas, fp_assert_loja) já exigem usuarios.ativo e vínculo ativo
-- a cada consulta — não mudam aqui (os testes de homologação provam a revogação imediata por elas).

BEGIN;

-- 1. Colunas de auditoria/aprovador -----------------------------------------------------------------
ALTER TABLE public.tokens_desconto_gerente
  ADD COLUMN IF NOT EXISTS aprovador_id uuid NULL,
  ADD COLUMN IF NOT EXISTS revogado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revogado_motivo text NULL;
COMMENT ON COLUMN public.tokens_desconto_gerente.aprovador_id IS
  'Gerente/DONO cuja senha foi conferida (pdv_config.gerente_id). Conferido ativo/vinculado no consumo.';
ALTER TABLE public.tokens_autorizacao_operacao
  ADD COLUMN IF NOT EXISTS revogado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revogado_motivo text NULL;

CREATE INDEX IF NOT EXISTS tokens_desconto_gerente_pend_criado_por_idx
  ON public.tokens_desconto_gerente (criado_por) WHERE usado = false;
CREATE INDEX IF NOT EXISTS tokens_desconto_gerente_pend_aprovador_idx
  ON public.tokens_desconto_gerente (aprovador_id) WHERE usado = false;
CREATE INDEX IF NOT EXISTS tokens_autorizacao_operacao_pend_gerente_idx
  ON public.tokens_autorizacao_operacao (gerente_id) WHERE usado = false;
CREATE INDEX IF NOT EXISTS tokens_autorizacao_operacao_pend_solicitante_idx
  ON public.tokens_autorizacao_operacao (solicitante_id) WHERE usado = false;

CREATE TABLE IF NOT EXISTS internal.tokens_revogacao_log (
  id bigserial PRIMARY KEY,
  usuario_id uuid NOT NULL,
  motivo text NOT NULL,
  tokens_gerente int NOT NULL DEFAULT 0,
  tokens_operacao int NOT NULL DEFAULT 0,
  ator uuid NULL DEFAULT auth.uid(),
  em timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON internal.tokens_revogacao_log FROM PUBLIC;
REVOKE ALL ON SEQUENCE internal.tokens_revogacao_log_id_seq FROM PUBLIC;

-- 2. Regra única: usuário ativo, com papel atual e vínculo na empresa da loja -------------------------
CREATE OR REPLACE FUNCTION internal.fp_usuario_ativo_com_papel(p_usuario uuid, p_loja uuid, p_papeis text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_usuario IS NOT NULL AND p_loja IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.id = p_usuario AND u.ativo IS TRUE
                    AND (p_papeis IS NULL OR u.perfil = ANY (p_papeis)))
     AND public.fp_usuario_pode_loja(p_usuario, p_loja, p_papeis);
$$;
REVOKE ALL ON FUNCTION internal.fp_usuario_ativo_com_papel(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION internal.fp_usuario_ativo_com_papel(uuid, uuid, text[]) IS
  'Ativo + perfil atual ∈ papeis + vínculo ativo na empresa da loja (fp_usuario_pode_loja). Base da revogação de tokens.';

-- Aprovador (senha de gerente é da EMPRESA — pdv_config por empresa): ativo, perfil atual DONO/GERENTE e vínculo
-- ativo DONO/GERENTE na MESMA empresa da loja (qualquer loja dela). Outra empresa ⇒ false.
CREATE OR REPLACE FUNCTION internal.fp_aprovador_ativo_na_empresa(p_usuario uuid, p_loja uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_usuario IS NOT NULL AND p_loja IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.id = p_usuario AND u.ativo IS TRUE AND u.perfil IN ('DONO', 'GERENTE'))
     AND EXISTS (SELECT 1 FROM public.usuario_vinculos v
                   JOIN public.lojas l ON l.id = p_loja AND l.empresa_id = v.empresa_id
                  WHERE v.usuario_id = p_usuario AND v.ativo AND v.papel IN ('DONO', 'GERENTE'));
$$;
REVOKE ALL ON FUNCTION internal.fp_aprovador_ativo_na_empresa(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Loja de referência do token: a gravada no token; sem ela, a loja cadastral do emissor (legado).
CREATE OR REPLACE FUNCTION internal.fp_token_gerente_motivo_invalido(
  p_loja_ref uuid, p_emissor uuid, p_aprovador uuid, p_papeis_emissor text[])
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ator uuid := auth.uid();
BEGIN
  IF p_emissor IS NOT NULL
     AND NOT internal.fp_usuario_ativo_com_papel(p_emissor, p_loja_ref, p_papeis_emissor) THEN
    RETURN 'EMISSOR_INATIVO_OU_SEM_VINCULO';
  END IF;
  IF p_aprovador IS NOT NULL
     AND NOT internal.fp_aprovador_ativo_na_empresa(p_aprovador, p_loja_ref) THEN
    RETURN 'APROVADOR_INATIVO_OU_SEM_VINCULO';
  END IF;
  IF v_ator IS NOT NULL
     AND NOT internal.fp_usuario_ativo_com_papel(v_ator, p_loja_ref, ARRAY['DONO', 'GERENTE', 'OPERADOR']) THEN
    RETURN 'ATOR_INATIVO_OU_SEM_VINCULO';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION internal.fp_token_gerente_motivo_invalido(uuid, uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;

-- 3. Gatilho de consumo ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.tg_token_gerente_consumo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid; v_motivo text;
BEGIN
  -- Só o consumo (false → true). Revogação marca revogado_em e passa direto.
  IF NOT (OLD.usado IS DISTINCT FROM true AND NEW.usado IS TRUE) OR NEW.revogado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.revogado_em IS NOT NULL THEN
    RAISE EXCEPTION 'TOKEN_GERENTE_REVOGADO' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'tokens_desconto_gerente' THEN
    v_loja := CASE WHEN NEW.loja_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   THEN lower(btrim(NEW.loja_id))::uuid END;
    IF v_loja IS NULL AND NEW.criado_por IS NOT NULL THEN
      SELECT u.loja_id INTO v_loja FROM public.usuarios u WHERE u.id = NEW.criado_por;
    END IF;
    IF v_loja IS NULL AND NEW.criado_por IS NULL AND NEW.aprovador_id IS NULL THEN
      RETURN NEW; -- emissor legado do cliente 1 (PDV desktop, chave compartilhada): sem identidade a conferir
    END IF;
    IF v_loja IS NULL THEN
      RAISE EXCEPTION 'TOKEN_GERENTE_REVOGADO' USING ERRCODE = '42501', DETAIL = 'LOJA_DO_TOKEN_DESCONHECIDA';
    END IF;
    v_motivo := internal.fp_token_gerente_motivo_invalido(v_loja, NEW.criado_por, NEW.aprovador_id,
                  ARRAY['DONO', 'GERENTE', 'OPERADOR']);
  ELSE
    v_motivo := internal.fp_token_gerente_motivo_invalido(NEW.loja_id, NEW.solicitante_id, NEW.gerente_id,
                  ARRAY['DONO', 'GERENTE', 'OPERADOR']);
  END IF;
  IF v_motivo IS NOT NULL THEN
    RAISE EXCEPTION 'TOKEN_GERENTE_REVOGADO' USING ERRCODE = '42501', DETAIL = v_motivo;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_token_gerente_consumo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_token_gerente_consumo ON public.tokens_desconto_gerente;
CREATE TRIGGER trg_token_gerente_consumo BEFORE UPDATE OF usado ON public.tokens_desconto_gerente
  FOR EACH ROW EXECUTE FUNCTION internal.tg_token_gerente_consumo();
DROP TRIGGER IF EXISTS trg_token_gerente_consumo ON public.tokens_autorizacao_operacao;
CREATE TRIGGER trg_token_gerente_consumo BEFORE UPDATE OF usado ON public.tokens_autorizacao_operacao
  FOR EACH ROW EXECUTE FUNCTION internal.tg_token_gerente_consumo();

-- 4. Revogação ativa -----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fp_revogar_tokens_usuario(p_usuario uuid, p_motivo text, p_empresa uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n1 int := 0; n2 int := 0;
BEGIN
  IF p_usuario IS NULL THEN RETURN 0; END IF;
  UPDATE public.tokens_desconto_gerente t
     SET usado = true, revogado_em = now(), revogado_motivo = p_motivo
   WHERE t.usado = false AND (t.criado_por = p_usuario OR t.aprovador_id = p_usuario)
     AND (p_empresa IS NULL OR t.loja_id IS NULL
          OR t.loja_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          OR public.fp_empresa_da_loja(lower(btrim(t.loja_id))::uuid) IS NOT DISTINCT FROM p_empresa
          OR public.fp_empresa_da_loja(lower(btrim(t.loja_id))::uuid) IS NULL);
  GET DIAGNOSTICS n1 = ROW_COUNT;
  UPDATE public.tokens_autorizacao_operacao t
     SET usado = true, revogado_em = now(), revogado_motivo = p_motivo
   WHERE t.usado = false AND (t.gerente_id = p_usuario OR t.solicitante_id = p_usuario)
     AND (p_empresa IS NULL OR public.fp_empresa_da_loja(t.loja_id) IS NOT DISTINCT FROM p_empresa);
  GET DIAGNOSTICS n2 = ROW_COUNT;
  INSERT INTO internal.tokens_revogacao_log (usuario_id, motivo, tokens_gerente, tokens_operacao)
  VALUES (p_usuario, p_motivo, n1, n2);
  RETURN n1 + n2;
END $$;
REVOKE ALL ON FUNCTION internal.fp_revogar_tokens_usuario(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.tg_revogar_tokens_usuario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'usuarios' THEN
    IF NEW.ativo IS DISTINCT FROM true AND OLD.ativo IS TRUE THEN
      PERFORM internal.fp_revogar_tokens_usuario(NEW.id, 'USUARIO_INATIVADO');
    ELSIF NEW.perfil IS DISTINCT FROM OLD.perfil THEN
      PERFORM internal.fp_revogar_tokens_usuario(NEW.id, 'PERFIL_ALTERADO');
    END IF;
    RETURN NEW;
  END IF;
  -- usuario_vinculos
  IF TG_OP = 'DELETE' THEN
    PERFORM internal.fp_revogar_tokens_usuario(OLD.usuario_id, 'VINCULO_REMOVIDO', OLD.empresa_id);
    RETURN OLD;
  END IF;
  IF OLD.ativo IS TRUE AND NEW.ativo IS DISTINCT FROM true THEN
    PERFORM internal.fp_revogar_tokens_usuario(OLD.usuario_id, 'VINCULO_DESATIVADO', OLD.empresa_id);
  ELSIF OLD.ativo IS TRUE AND (NEW.papel IS DISTINCT FROM OLD.papel OR NEW.loja_id IS DISTINCT FROM OLD.loja_id
                               OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id) THEN
    PERFORM internal.fp_revogar_tokens_usuario(OLD.usuario_id, 'VINCULO_ALTERADO', OLD.empresa_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_revogar_tokens_usuario() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_revogar_tokens_usuario ON public.usuarios;
CREATE TRIGGER trg_revogar_tokens_usuario AFTER UPDATE OF ativo, perfil ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION internal.tg_revogar_tokens_usuario();
DROP TRIGGER IF EXISTS trg_revogar_tokens_vinculo ON public.usuario_vinculos;
CREATE TRIGGER trg_revogar_tokens_vinculo AFTER UPDATE OR DELETE ON public.usuario_vinculos
  FOR EACH ROW EXECUTE FUNCTION internal.tg_revogar_tokens_usuario();

-- 5. token_gerente_fora_da_loja: regra de #620/#623 + emissor/aprovador ativos e vinculados ------------
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
         -- 20261028120000: emissor e aprovador precisam estar ativos, com papel e vínculo na loja AGORA.
         OR NOT internal.fp_usuario_ativo_com_papel(t.criado_por, p_loja_id, ARRAY['DONO', 'GERENTE', 'OPERADOR'])
         OR (t.aprovador_id IS NOT NULL
             AND NOT internal.fp_aprovador_ativo_na_empresa(t.aprovador_id, p_loja_id))
       )
  );
$function$;
COMMENT ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) IS
  'SEC-04 + empresa + Corte ADMIN + revogação (20261028120000): true quando o token existe e NÃO vale na loja (emissor ausente/inativo/sem vínculo; aprovador inativo/sem vínculo; revogado; loja divergente; DONO sem vínculo com a empresa). Token inexistente = false.';

-- Leitura para o sync-outbox (venda offline em modo estrito): token existe, é da loja e emissor/aprovador valem.
CREATE OR REPLACE FUNCTION public.fp_token_gerente_vale_na_loja(p_token text, p_loja_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_token IS NOT NULL AND p_loja_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.tokens_desconto_gerente t WHERE t.token = p_token AND t.revogado_em IS NULL)
     AND NOT internal.token_gerente_fora_da_loja(p_token, p_loja_id);
$$;
REVOKE ALL ON FUNCTION public.fp_token_gerente_vale_na_loja(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fp_token_gerente_vale_na_loja(text, uuid) TO service_role;

-- 6. consumir_token_autorizacao_operacao sem ADMIN e com vínculo --------------------------------------
CREATE OR REPLACE FUNCTION public.consumir_token_autorizacao_operacao(
  p_token text,
  p_finalidade text,
  p_alvo_id text,
  p_loja_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_token text := NULLIF(btrim(p_token), '');
  v_gerente uuid;
  v_solicitante uuid;
BEGIN
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'AUTORIZACAO_TOKEN_OBRIGATORIO';
  END IF;
  IF p_finalidade IS NULL OR p_finalidade NOT IN ('SANGRIA', 'PAGAMENTO_AP') THEN
    RAISE EXCEPTION 'AUTORIZACAO_FINALIDADE_DESCONHECIDA';
  END IF;
  IF NULLIF(btrim(COALESCE(p_alvo_id, '')), '') IS NULL OR p_loja_id IS NULL THEN
    RAISE EXCEPTION 'AUTORIZACAO_ALVO_OBRIGATORIO';
  END IF;

  SELECT t.gerente_id, t.solicitante_id
  INTO v_gerente, v_solicitante
  FROM public.tokens_autorizacao_operacao t
  WHERE t.token = v_token
    AND t.finalidade = p_finalidade
    AND t.alvo_id = btrim(p_alvo_id)
    AND t.loja_id = p_loja_id
    AND t.usado = false
    AND t.revogado_em IS NULL
    AND t.expira_em > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTORIZACAO_TOKEN_INVALIDO';
  END IF;

  -- Aprovador: ativo, perfil GERENTE/DONO (ADMIN descontinuado), loja cadastral = loja da operação
  -- (regra anterior) E vínculo ativo com papel aprovador na empresa da loja (20261028120000).
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios g
    WHERE g.id = v_gerente
      AND g.ativo = true
      AND g.loja_id = p_loja_id
      AND g.perfil IN ('GERENTE', 'DONO')
  ) OR NOT internal.fp_aprovador_ativo_na_empresa(v_gerente, p_loja_id) THEN
    RAISE EXCEPTION 'AUTORIZACAO_GERENTE_INVALIDO';
  END IF;

  IF v_solicitante IS NOT NULL
     AND NOT internal.fp_usuario_ativo_com_papel(v_solicitante, p_loja_id, ARRAY['DONO', 'GERENTE', 'OPERADOR']) THEN
    RAISE EXCEPTION 'AUTORIZACAO_SOLICITANTE_INVALIDO';
  END IF;

  UPDATE public.tokens_autorizacao_operacao
  SET usado = true, usado_em = now()
  WHERE token = v_token AND usado = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTORIZACAO_TOKEN_INVALIDO';
  END IF;

  RETURN v_gerente;
END;
$fn$;
REVOKE ALL ON FUNCTION public.consumir_token_autorizacao_operacao(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consumir_token_autorizacao_operacao(text, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_token_autorizacao_operacao(text, text, text, uuid) TO service_role;

COMMIT;
