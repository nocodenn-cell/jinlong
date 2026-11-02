-- 20261028121000_provisionamento_automatico_bloqueado.sql
-- Decisão do dono (28/10/2026, item 2): o hub comercial é o ponto OFICIAL de provisionamento de empresas;
-- o app das lojas não cria empresas; o teste grátis usará o mesmo mecanismo do hub; enquanto o hub não estiver
-- homologado o provisionamento AUTOMÁTICO fica BLOQUEADO; o procedimento manual é só contingência, documentada
-- e controlada (docs/PROVISIONAMENTO_CONTINGENCIA.md).
--
-- NÃO APLICAR no Supabase remoto sem autorização expressa. Rollback:
-- backend/supabase/rollback/20261028121000_provisionamento_automatico_bloqueado.rollback.sql
--
-- Como: o núcleo transacional existente (plataforma_provisionar_empresa, PR #584) vira
-- internal.plataforma_provisionar_empresa_nucleo (corpo intacto). A função pública com a MESMA assinatura passa a
-- ser uma porta fail-closed:
--   * libera se saas.parametros.provisionamento_automatico = 'habilitado' (só depois da homologação do hub); ou
--   * libera em CONTINGÊNCIA quando a sessão traz SET LOCAL fp.provisionamento_contingencia = '<chamado>' e
--     fp.provisionamento_responsavel = '<nome/e-mail>', gravando a trilha em internal.provisionamento_contingencia_log
--     (só service_role/postgres executam a função; anon/authenticated nunca);
--   * senão RAISE PROVISIONAMENTO_AUTOMATICO_BLOQUEADO.
-- plataforma_iniciar_trial (teste grátis) chama a função pública ⇒ fica bloqueado pelo mesmo interruptor.
-- Nenhum mecanismo novo de provisionamento é criado.

BEGIN;

INSERT INTO saas.parametros (chave, valor, descricao)
VALUES ('provisionamento_automatico', 'bloqueado',
        'Provisionamento automático de empresas (trial/self-service/hub). bloqueado | habilitado. Habilitar só após homologação do hub comercial.')
ON CONFLICT (chave) DO NOTHING;

CREATE TABLE IF NOT EXISTS internal.provisionamento_contingencia_log (
  id bigserial PRIMARY KEY,
  chamado text NOT NULL CHECK (length(btrim(chamado)) >= 3),
  responsavel text NOT NULL CHECK (length(btrim(responsavel)) >= 3),
  executado_por text NOT NULL DEFAULT session_user,
  papel_jwt text NULL DEFAULT current_setting('request.jwt.claim.role', true),
  payload_sha256 text NOT NULL,
  empresa_nome text NULL,
  resultado jsonb NULL,
  em timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON internal.provisionamento_contingencia_log FROM PUBLIC;
REVOKE ALL ON SEQUENCE internal.provisionamento_contingencia_log_id_seq FROM PUBLIC;

DO $$
BEGIN
  IF to_regprocedure('internal.plataforma_provisionar_empresa_nucleo(jsonb, uuid)') IS NULL THEN
    ALTER FUNCTION public.plataforma_provisionar_empresa(jsonb, uuid) SET SCHEMA internal;
    ALTER FUNCTION internal.plataforma_provisionar_empresa(jsonb, uuid) RENAME TO plataforma_provisionar_empresa_nucleo;
  END IF;
END $$;
REVOKE ALL ON FUNCTION internal.plataforma_provisionar_empresa_nucleo(jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.plataforma_provisionar_empresa(p jsonb, p_ator uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
DECLARE
  v_flag text := (SELECT valor FROM saas.parametros WHERE chave = 'provisionamento_automatico');
  v_chamado text := nullif(btrim(coalesce(current_setting('fp.provisionamento_contingencia', true), '')), '');
  v_resp text := nullif(btrim(coalesce(current_setting('fp.provisionamento_responsavel', true), '')), '');
  r jsonb;
BEGIN
  IF v_chamado IS NOT NULL THEN
    IF v_resp IS NULL THEN
      RAISE EXCEPTION 'PROVISIONAMENTO_CONTINGENCIA_SEM_RESPONSAVEL' USING ERRCODE = '42501';
    END IF;
    r := internal.plataforma_provisionar_empresa_nucleo(p, p_ator);
    INSERT INTO internal.provisionamento_contingencia_log (chamado, responsavel, payload_sha256, empresa_nome, resultado)
    VALUES (v_chamado, v_resp, encode(sha256(convert_to(p::text, 'UTF8')), 'hex'),
            p->'empresa'->>'nome', r);
    RETURN r;
  END IF;
  IF v_flag IS DISTINCT FROM 'habilitado' THEN
    RAISE EXCEPTION 'PROVISIONAMENTO_AUTOMATICO_BLOQUEADO' USING ERRCODE = '42501',
      HINT = 'Hub comercial ainda não homologado. Contingência: docs/PROVISIONAMENTO_CONTINGENCIA.md';
  END IF;
  RETURN internal.plataforma_provisionar_empresa_nucleo(p, p_ator);
END $$;
REVOKE ALL ON FUNCTION public.plataforma_provisionar_empresa(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plataforma_provisionar_empresa(jsonb, uuid) TO service_role;
COMMENT ON FUNCTION public.plataforma_provisionar_empresa(jsonb, uuid) IS
  'Porta fail-closed (20261028121000): bloqueada salvo saas.parametros.provisionamento_automatico=habilitado ou contingência registrada (fp.provisionamento_contingencia + fp.provisionamento_responsavel). Núcleo: internal.plataforma_provisionar_empresa_nucleo.';

COMMIT;
