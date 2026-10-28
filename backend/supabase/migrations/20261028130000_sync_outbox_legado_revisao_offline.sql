-- 20261028130000_sync_outbox_legado_revisao_offline.sql
-- Decisões do dono (28/10/2026), itens 2 e 3:
--   2) sync-outbox no modo legado (Empresa 1, chave compartilhada) valida usuário, status ativo, vínculo e permissão
--      atual em TODA operação, como no modo dispositivo. Nenhum fluxo legado contorna as regras.
--   3) Vendas offline de funcionário inativado: separar (a) comprovadamente feitas enquanto ativo, (b) feitas depois
--      da inativação e (c) sem prova. Sem confiar só no relógio do dispositivo. Legítimas reconciliam; suspeitas
--      ficam pendentes para DONO/GERENTE decidir, com trilha completa. Nada é descartado em silêncio e o usuário
--      inativo nunca volta a operar.
--
-- NÃO APLICAR no Supabase remoto sem autorização expressa. Depende de #620/#623 (20261028100000..20261028122000):
-- usa internal.fp_usuario_ativo_com_papel, internal.fp_aprovador_ativo_na_empresa e internal.tokens_revogacao_log.
-- Rollback: backend/supabase/rollback/20261028130000_sync_outbox_legado_revisao_offline.rollback.sql
--
-- Evidência aceita (só do SERVIDOR):
--   * perda de acesso: internal.tokens_revogacao_log.em (gravado pelos gatilhos de 20261028120000 quando o usuário é
--     inativado, muda de perfil ou perde/altera vínculo) e tokens_desconto_gerente.revogado_em;
--   * existência do evento: internal.sync_eventos_recebidos.primeiro_recebimento_em (now() do servidor na 1ª vez que
--     o evento chegou, com o MESMO sha256 do payload e do MESMO computador);
--   * token de gerente: tokens_desconto_gerente.created_at (servidor).
-- Regra simples: o relógio do dispositivo só pode PIORAR a classificação (dizer "depois"), nunca provar "antes".
--   (a) ANTES_INATIVACAO: o servidor recebeu o evento antes da perda de acesso ⇒ reconcilia sozinho (status
--       RECONCILIADO_AUTO, registro na fila para auditoria).
--   (b) APOS_INATIVACAO: o dispositivo diz que foi depois, ou o token usado foi emitido depois ⇒ PENDENTE.
--   (c) NAO_COMPROVAVEL: o resto (inclui venda sem operador no modo legado e perda de acesso sem registro) ⇒ PENDENTE.
-- Operador que NUNCA teve vínculo com a loja (outra empresa) continua recusado como hoje (EVENTO_OPERADOR_SEM_VINCULO).

BEGIN;

-- 1. Recibos de sincronização (servidor) ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal.sync_eventos_recebidos (
  event_id text PRIMARY KEY,
  tipo text NOT NULL,
  payload_sha256 text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('dispositivo', 'legado')),
  dispositivo_id uuid NULL,
  device_fingerprint text NULL,
  primeiro_recebimento_em timestamptz NOT NULL DEFAULT now(),
  ultimo_recebimento_em timestamptz NOT NULL DEFAULT now(),
  recebimentos integer NOT NULL DEFAULT 1,
  payload_divergente boolean NOT NULL DEFAULT false
);
REVOKE ALL ON internal.sync_eventos_recebidos FROM PUBLIC;
COMMENT ON TABLE internal.sync_eventos_recebidos IS
  'Recibo do servidor para cada evento da outbox (1ª chegada). Prova de existência para a reconciliação offline. Só service_role via RPC.';

CREATE OR REPLACE FUNCTION public.sync_registrar_recebimento(
  p_event_id text, p_tipo text, p_payload_sha256 text, p_origem text, p_dispositivo uuid, p_fingerprint text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO internal.sync_eventos_recebidos AS r
    (event_id, tipo, payload_sha256, origem, dispositivo_id, device_fingerprint)
  VALUES (btrim(p_event_id), p_tipo, lower(p_payload_sha256), p_origem, p_dispositivo, nullif(lower(btrim(p_fingerprint)), ''))
  ON CONFLICT (event_id) DO UPDATE
    SET ultimo_recebimento_em = now(),
        recebimentos = r.recebimentos + 1,
        payload_divergente = r.payload_divergente
          OR r.payload_sha256 IS DISTINCT FROM EXCLUDED.payload_sha256
          OR r.device_fingerprint IS DISTINCT FROM EXCLUDED.device_fingerprint
          OR r.tipo IS DISTINCT FROM EXCLUDED.tipo;
$$;
REVOKE ALL ON FUNCTION public.sync_registrar_recebimento(text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_registrar_recebimento(text, text, text, text, uuid, text) TO service_role;

-- 2. Fila de revisão (trilha permanente) -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_eventos_revisao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial NOT NULL UNIQUE,
  event_id text NOT NULL UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('VENDA_REGISTRADA', 'CAIXA_ABERTO', 'MOVIMENTO_CAIXA', 'CAIXA_FECHADO')),
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('dispositivo', 'legado')),
  dispositivo_id uuid NULL,
  device_fingerprint text NULL,
  empresa_id uuid NOT NULL,
  loja_id uuid NOT NULL,
  caixa_id uuid NULL,
  venda_id uuid NULL,
  operador_id uuid NULL,
  horario_dispositivo timestamptz NULL,
  classificacao text NOT NULL CHECK (classificacao IN ('ANTES_INATIVACAO', 'APOS_INATIVACAO', 'NAO_COMPROVAVEL')),
  motivo text NOT NULL,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO', 'RECONCILIADO_AUTO')),
  decidido_por uuid NULL,
  decidido_em timestamptz NULL,
  decisao_motivo text NULL,
  CONSTRAINT sync_eventos_revisao_decisao_ck CHECK (
    (status = 'PENDENTE' AND decidido_em IS NULL AND decidido_por IS NULL)
    OR (status IN ('APROVADO', 'REJEITADO') AND decidido_em IS NOT NULL AND decidido_por IS NOT NULL
        AND length(btrim(coalesce(decisao_motivo, ''))) >= 5)
    OR (status = 'RECONCILIADO_AUTO' AND decidido_em IS NOT NULL AND decidido_por IS NULL))
);
CREATE INDEX IF NOT EXISTS sync_eventos_revisao_pendentes_idx ON public.sync_eventos_revisao (loja_id, seq) WHERE status = 'PENDENTE';
CREATE INDEX IF NOT EXISTS sync_eventos_revisao_caixa_idx ON public.sync_eventos_revisao (caixa_id) WHERE status = 'PENDENTE';
COMMENT ON TABLE public.sync_eventos_revisao IS
  'Eventos offline do PDV que não entraram direto (operador sem acesso, sem operador, caixa em revisão). Nunca são apagados. '
  'DONO/GERENTE da loja decide por public.revisar_evento_offline. RECONCILIADO_AUTO = provado anterior à perda de acesso.';

ALTER TABLE public.sync_eventos_revisao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sync_eventos_revisao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sync_eventos_revisao TO authenticated;
REVOKE ALL ON SEQUENCE public.sync_eventos_revisao_seq_seq FROM PUBLIC, anon, authenticated;
-- Guarda de tenant pelo mecanismo padrão (fase 2), que já nasce otimizada pela fase 4 (sem fp_pode_* por linha).
SELECT internal.fp_aplicar_guarda('sync_eventos_revisao', 'L', 'public.fp_pode_loja(loja_id::uuid, NULL)', 'loja_id');
DROP POLICY IF EXISTS sync_eventos_revisao_select_gestor ON public.sync_eventos_revisao;
CREATE POLICY sync_eventos_revisao_select_gestor ON public.sync_eventos_revisao FOR SELECT TO authenticated
  USING (loja_id IN (SELECT public.fp_lojas_permitidas(ARRAY['DONO', 'GERENTE'])));

-- Imutável: sem DELETE (nem service_role); UPDATE só na transição PENDENTE → APROVADO/REJEITADO.
CREATE OR REPLACE FUNCTION internal.tg_sync_eventos_revisao_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SYNC_REVISAO_IMUTAVEL' USING ERRCODE = '42501', DETAIL = 'trilha de auditoria não pode ser apagada';
  END IF;
  IF OLD.status <> 'PENDENTE' OR NEW.status NOT IN ('APROVADO', 'REJEITADO')
     OR (NEW.id, NEW.seq, NEW.event_id, NEW.tipo, NEW.payload, NEW.payload_sha256, NEW.origem, NEW.dispositivo_id,
         NEW.device_fingerprint, NEW.empresa_id, NEW.loja_id, NEW.caixa_id, NEW.venda_id, NEW.operador_id,
         NEW.horario_dispositivo, NEW.classificacao, NEW.motivo, NEW.evidencias, NEW.recebido_em)
        IS DISTINCT FROM
        (OLD.id, OLD.seq, OLD.event_id, OLD.tipo, OLD.payload, OLD.payload_sha256, OLD.origem, OLD.dispositivo_id,
         OLD.device_fingerprint, OLD.empresa_id, OLD.loja_id, OLD.caixa_id, OLD.venda_id, OLD.operador_id,
         OLD.horario_dispositivo, OLD.classificacao, OLD.motivo, OLD.evidencias, OLD.recebido_em) THEN
    RAISE EXCEPTION 'SYNC_REVISAO_IMUTAVEL' USING ERRCODE = '42501', DETAIL = 'só PENDENTE → APROVADO/REJEITADO';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_sync_eventos_revisao_imutavel() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_eventos_revisao_imutavel ON public.sync_eventos_revisao;
CREATE TRIGGER trg_sync_eventos_revisao_imutavel BEFORE UPDATE OR DELETE ON public.sync_eventos_revisao
  FOR EACH ROW EXECUTE FUNCTION internal.tg_sync_eventos_revisao_imutavel();

-- 3. Helpers -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.fp_ts_ou_null(p text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION internal.fp_uuid_ou_null(p text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p ~* '^\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s*$' THEN lower(btrim(p))::uuid END;
$$;

-- Última perda de acesso registrada pelo servidor (inativação, perfil, vínculo).
CREATE OR REPLACE FUNCTION internal.fp_usuario_perdeu_acesso_em(p_usuario uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT max(l.em) FROM internal.tokens_revogacao_log l
   WHERE l.usuario_id = p_usuario
     AND l.motivo IN ('USUARIO_INATIVADO', 'PERFIL_ALTERADO', 'VINCULO_DESATIVADO', 'VINCULO_REMOVIDO', 'VINCULO_ALTERADO');
$$;
REVOKE ALL ON FUNCTION internal.fp_usuario_perdeu_acesso_em(uuid) FROM PUBLIC, anon, authenticated;

-- Já teve vínculo (ativo ou não) cobrindo a loja: distingue "funcionário desligado" de "usuário de outra empresa".
-- p_empresa_toda: aprovador (senha de gerente é da EMPRESA) vale em qualquer loja da empresa.
CREATE OR REPLACE FUNCTION internal.fp_usuario_teve_vinculo_na_loja(p_usuario uuid, p_loja uuid, p_papeis text[],
  p_empresa_toda boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_usuario IS NOT NULL AND p_loja IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.usuario_vinculos v JOIN public.lojas l ON l.id = p_loja AND l.empresa_id = v.empresa_id
     WHERE v.usuario_id = p_usuario AND v.papel = ANY (p_papeis)
       AND (p_empresa_toda OR v.papel = 'DONO' OR v.loja_id = p_loja));
$$;
REVOKE ALL ON FUNCTION internal.fp_usuario_teve_vinculo_na_loja(uuid, uuid, text[], boolean) FROM PUBLIC, anon, authenticated;

-- 4. Avaliação de um evento (chamada pelo sync-outbox, service_role) --------------------------------
-- p: {event_id, tipo, payload_sha256, device_fingerprint, loja_id, caixa_id, operador_id, horario_dispositivo,
--     desconto_token, exige_token, empresa_legado}
-- Retorna {acao: PROCESSAR|RECONCILIAR|REVISAO|REJEITAR, classificacao, motivo, evidencias}.
-- internal.sync_avaliar_evento_base classifica o evento em si; public.sync_avaliar_evento aplica a ordem do caixa.
CREATE OR REPLACE FUNCTION internal.sync_avaliar_evento_base(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_event text := nullif(btrim(p->>'event_id'), '');
  v_tipo text := p->>'tipo';
  v_sha text := lower(p->>'payload_sha256');
  v_fp text := nullif(lower(btrim(p->>'device_fingerprint')), '');
  v_loja uuid := internal.fp_uuid_ou_null(p->>'loja_id');
  v_caixa uuid := internal.fp_uuid_ou_null(p->>'caixa_id');
  v_op uuid := internal.fp_uuid_ou_null(p->>'operador_id');
  v_hora timestamptz := internal.fp_ts_ou_null(p->>'horario_dispositivo');
  v_token text := nullif(btrim(p->>'desconto_token'), '');
  v_exige_token boolean := coalesce((p->>'exige_token')::boolean, false);
  v_emp_legado uuid := internal.fp_uuid_ou_null(p->>'empresa_legado');
  v_empresa uuid;
  v_tok public.tokens_desconto_gerente%ROWTYPE;
  v_tem_tok boolean := false;
  v_ev jsonb;
  v_perdas jsonb := '[]'::jsonb;
  v_t timestamptz;
  v_perdeu timestamptz;
  v_rec internal.sync_eventos_recebidos%ROWTYPE;
  v_tok_loja uuid;
BEGIN
  IF v_event IS NULL OR v_loja IS NULL OR v_tipo IS NULL OR v_sha IS NULL THEN
    RAISE EXCEPTION 'SYNC_AVALIAR_PARAMETROS';
  END IF;
  v_empresa := public.fp_empresa_da_loja(v_loja);
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'SYNC_AVALIAR_LOJA_DESCONHECIDA'; END IF;
  v_ev := jsonb_build_object('avaliado_em', now(), 'horario_dispositivo', v_hora);

  -- 1. Token de gerente (desconto em modo estrito): estrutura inválida = recusa (não é venda a reconciliar).
  IF v_exige_token THEN
    SELECT * INTO v_tok FROM public.tokens_desconto_gerente t WHERE t.token = v_token;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('acao', 'REJEITAR', 'motivo', 'GERENTE_TOKEN_INVALIDO_OU_REVOGADO', 'evidencias', v_ev);
    END IF;
    v_tem_tok := true;
    v_tok_loja := internal.fp_uuid_ou_null(v_tok.loja_id);
    IF v_tok_loja IS NOT NULL AND v_tok_loja <> v_loja THEN
      RETURN jsonb_build_object('acao', 'REJEITAR', 'motivo', 'GERENTE_TOKEN_DE_OUTRA_LOJA', 'evidencias', v_ev);
    END IF;
    IF v_tok.criado_por IS NULL THEN
      -- emissor legado (PDV desktop do cliente 1): só na empresa legada e com aprovador identificado.
      IF v_emp_legado IS NULL OR v_empresa IS DISTINCT FROM v_emp_legado OR v_tok.aprovador_id IS NULL THEN
        RETURN jsonb_build_object('acao', 'REJEITAR', 'motivo', 'GERENTE_TOKEN_LEGADO_FORA_DO_ESCOPO', 'evidencias', v_ev);
      END IF;
    ELSIF NOT internal.fp_usuario_teve_vinculo_na_loja(v_tok.criado_por, v_loja, ARRAY['DONO', 'GERENTE', 'OPERADOR']) THEN
      RETURN jsonb_build_object('acao', 'REJEITAR', 'motivo', 'GERENTE_TOKEN_DE_OUTRA_EMPRESA', 'evidencias', v_ev);
    END IF;
    IF v_tok.aprovador_id IS NOT NULL
       AND NOT internal.fp_usuario_teve_vinculo_na_loja(v_tok.aprovador_id, v_loja, ARRAY['DONO', 'GERENTE'], true) THEN
      RETURN jsonb_build_object('acao', 'REJEITAR', 'motivo', 'GERENTE_TOKEN_DE_OUTRA_EMPRESA', 'evidencias', v_ev);
    END IF;
    v_ev := v_ev || jsonb_build_object('token_criado_em', v_tok.created_at, 'token_revogado_em', v_tok.revogado_em,
                                       'token_revogado_motivo', v_tok.revogado_motivo);
  END IF;

  -- 2. Operador: sem operador não há quem validar ⇒ não comprovável (nunca entra direto).
  IF v_op IS NULL THEN
    RETURN jsonb_build_object('acao', 'REVISAO', 'classificacao', 'NAO_COMPROVAVEL', 'motivo', 'SEM_OPERADOR', 'evidencias', v_ev);
  END IF;

  -- 3. Quem perdeu acesso (operador; emissor e aprovador do token) e quando (servidor).
  IF NOT internal.fp_usuario_ativo_com_papel(v_op, v_loja, ARRAY['DONO', 'GERENTE', 'OPERADOR']) THEN
    v_perdeu := internal.fp_usuario_perdeu_acesso_em(v_op);
    IF v_perdeu IS NULL AND NOT internal.fp_usuario_teve_vinculo_na_loja(v_op, v_loja, ARRAY['DONO', 'GERENTE', 'OPERADOR']) THEN
      RETURN jsonb_build_object('acao', 'REJEITAR', 'motivo', 'EVENTO_OPERADOR_SEM_VINCULO', 'evidencias', v_ev);
    END IF;
    v_perdas := v_perdas || jsonb_build_object('usuario', v_op, 'papel', 'operador', 'perdeu_acesso_em', v_perdeu);
  END IF;
  IF v_tem_tok THEN
    IF v_tok.criado_por IS NOT NULL
       AND NOT internal.fp_usuario_ativo_com_papel(v_tok.criado_por, v_loja, ARRAY['DONO', 'GERENTE', 'OPERADOR']) THEN
      v_perdas := v_perdas || jsonb_build_object('usuario', v_tok.criado_por, 'papel', 'emissor_token',
                                                 'perdeu_acesso_em', internal.fp_usuario_perdeu_acesso_em(v_tok.criado_por));
    END IF;
    IF v_tok.aprovador_id IS NOT NULL AND NOT internal.fp_aprovador_ativo_na_empresa(v_tok.aprovador_id, v_loja) THEN
      v_perdas := v_perdas || jsonb_build_object('usuario', v_tok.aprovador_id, 'papel', 'aprovador_token',
                                                 'perdeu_acesso_em', internal.fp_usuario_perdeu_acesso_em(v_tok.aprovador_id));
    END IF;
    IF v_tok.revogado_em IS NOT NULL THEN
      v_perdas := v_perdas || jsonb_build_object('usuario', NULL, 'papel', 'token', 'perdeu_acesso_em', v_tok.revogado_em);
    END IF;
  END IF;

  IF jsonb_array_length(v_perdas) = 0 THEN
    RETURN jsonb_build_object('acao', 'PROCESSAR');
  END IF;
  v_ev := v_ev || jsonb_build_object('perdas_de_acesso', v_perdas);

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_perdas) x WHERE x->>'perdeu_acesso_em' IS NULL) THEN
    RETURN jsonb_build_object('acao', 'REVISAO', 'classificacao', 'NAO_COMPROVAVEL', 'motivo', 'PERDA_DE_ACESSO_SEM_REGISTRO',
                              'evidencias', v_ev);
  END IF;
  SELECT min((x->>'perdeu_acesso_em')::timestamptz) INTO v_t FROM jsonb_array_elements(v_perdas) x;
  v_ev := v_ev || jsonb_build_object('perda_de_acesso_em', v_t);

  -- (a) prova do servidor: recebido antes da perda de acesso, mesmo conteúdo e mesmo computador.
  SELECT * INTO v_rec FROM internal.sync_eventos_recebidos r WHERE r.event_id = v_event;
  IF FOUND THEN
    v_ev := v_ev || jsonb_build_object('primeiro_recebimento_em', v_rec.primeiro_recebimento_em,
                                       'recebimentos', v_rec.recebimentos, 'payload_divergente', v_rec.payload_divergente);
    IF NOT v_rec.payload_divergente AND v_rec.payload_sha256 = v_sha AND v_rec.device_fingerprint IS NOT DISTINCT FROM v_fp
       AND v_rec.primeiro_recebimento_em < v_t THEN
      RETURN jsonb_build_object('acao', 'RECONCILIAR', 'classificacao', 'ANTES_INATIVACAO',
                                'motivo', 'RECEBIDO_PELO_SERVIDOR_ANTES_DA_PERDA_DE_ACESSO', 'evidencias', v_ev);
    END IF;
  END IF;

  -- (b) depois: o próprio dispositivo diz que foi depois, ou o token foi emitido depois (servidor).
  IF v_hora IS NOT NULL AND v_hora >= v_t THEN
    RETURN jsonb_build_object('acao', 'REVISAO', 'classificacao', 'APOS_INATIVACAO', 'motivo', 'HORARIO_DO_DISPOSITIVO_APOS_A_PERDA',
                              'evidencias', v_ev);
  END IF;
  IF v_tem_tok AND v_tok.created_at >= v_t THEN
    RETURN jsonb_build_object('acao', 'REVISAO', 'classificacao', 'APOS_INATIVACAO', 'motivo', 'TOKEN_EMITIDO_APOS_A_PERDA',
                              'evidencias', v_ev);
  END IF;

  -- (c) sem prova do servidor de que foi antes.
  RETURN jsonb_build_object('acao', 'REVISAO', 'classificacao', 'NAO_COMPROVAVEL', 'motivo', 'SEM_PROVA_DO_SERVIDOR_ANTERIOR_A_PERDA',
                            'evidencias', v_ev);
END $$;
REVOKE ALL ON FUNCTION internal.sync_avaliar_evento_base(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_avaliar_evento(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_d jsonb := internal.sync_avaliar_evento_base(p);
  v_caixa uuid := internal.fp_uuid_ou_null(p->>'caixa_id');
  v_event text := nullif(btrim(p->>'event_id'), '');
BEGIN
  -- Ordem do caixa: com evento pendente no caixa, os seguintes também esperam a decisão (recusa continua recusa).
  -- A classificação do próprio evento é preservada para quem revisa.
  IF v_d->>'acao' <> 'REJEITAR' AND v_caixa IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.sync_eventos_revisao r
                  WHERE r.caixa_id = v_caixa AND r.status = 'PENDENTE' AND r.event_id <> v_event) THEN
    RETURN jsonb_build_object(
      'acao', 'REVISAO',
      'classificacao', coalesce(v_d->>'classificacao', 'NAO_COMPROVAVEL'),
      'motivo', 'CAIXA_EM_REVISAO' || coalesce(':' || (v_d->>'motivo'), ''),
      'evidencias', coalesce(v_d->'evidencias', jsonb_build_object('avaliado_em', now())) || jsonb_build_object('caixa_em_revisao', true,
                                                                                       'acao_original', v_d->>'acao'));
  END IF;
  RETURN v_d;
END $$;
REVOKE ALL ON FUNCTION public.sync_avaliar_evento(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_avaliar_evento(jsonb) TO service_role;

-- 5. Enfileirar (PENDENTE) ou registrar reconciliação automática (RECONCILIADO_AUTO) ------------------
-- p: {event_id, tipo, payload(text json), payload_sha256, origem, dispositivo_id, device_fingerprint, loja_id, caixa_id,
--     venda_id, operador_id, horario_dispositivo, classificacao, motivo, evidencias, status}
CREATE OR REPLACE FUNCTION public.sync_enfileirar_revisao(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_loja uuid := internal.fp_uuid_ou_null(p->>'loja_id');
  v_status text := coalesce(p->>'status', 'PENDENTE');
  v_row public.sync_eventos_revisao%ROWTYPE;
BEGIN
  IF v_status NOT IN ('PENDENTE', 'RECONCILIADO_AUTO') THEN RAISE EXCEPTION 'SYNC_REVISAO_STATUS_INVALIDO'; END IF;
  INSERT INTO public.sync_eventos_revisao (event_id, tipo, payload, payload_sha256, origem, dispositivo_id, device_fingerprint,
      empresa_id, loja_id, caixa_id, venda_id, operador_id, horario_dispositivo, classificacao, motivo, evidencias,
      status, decidido_em, decisao_motivo)
  VALUES (btrim(p->>'event_id'), p->>'tipo', (p->>'payload')::jsonb, lower(p->>'payload_sha256'), p->>'origem',
      internal.fp_uuid_ou_null(p->>'dispositivo_id'), nullif(lower(btrim(p->>'device_fingerprint')), ''),
      public.fp_empresa_da_loja(v_loja), v_loja, internal.fp_uuid_ou_null(p->>'caixa_id'),
      internal.fp_uuid_ou_null(p->>'venda_id'), internal.fp_uuid_ou_null(p->>'operador_id'),
      internal.fp_ts_ou_null(p->>'horario_dispositivo'), p->>'classificacao', p->>'motivo', coalesce(p->'evidencias', '{}'::jsonb),
      v_status, CASE WHEN v_status = 'RECONCILIADO_AUTO' THEN now() END,
      CASE WHEN v_status = 'RECONCILIADO_AUTO' THEN 'AUTOMATICO: recebido pelo servidor antes da perda de acesso' END)
  ON CONFLICT (event_id) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.sync_eventos_revisao WHERE event_id = btrim(p->>'event_id');
    RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'novo', false);
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'novo', true);
END $$;
REVOKE ALL ON FUNCTION public.sync_enfileirar_revisao(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_enfileirar_revisao(jsonb) TO service_role;

-- 6. Aplicação de um evento aprovado (mesmo caminho do sync-outbox, em SQL) -------------------------
CREATE OR REPLACE FUNCTION internal.sync_aplicar_evento_revisado(r public.sync_eventos_revisao)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p jsonb := r.payload;
  v_caixa_loja uuid;
  v_caixa_op uuid;
  v_status text;
  v_item jsonb;
  v_res record;
  v_parcelado boolean;
  v_claims text;
  v_sub text;
  v_role text;
BEGIN
  IF r.tipo IN ('CAIXA_ABERTO', 'VENDA_REGISTRADA') THEN
    SELECT c.loja_id INTO v_caixa_loja FROM public.caixas c WHERE c.id = r.caixa_id;
    IF FOUND AND v_caixa_loja IS DISTINCT FROM r.loja_id THEN RAISE EXCEPTION 'REVISAO_CAIXA_DE_OUTRA_LOJA'; END IF;
    IF NOT FOUND THEN
      INSERT INTO public.caixas (id, operador_id, valor_inicial, status, loja_id)
      VALUES (r.caixa_id, r.operador_id,
              coalesce(CASE WHEN r.tipo = 'CAIXA_ABERTO' THEN (p->>'valor_inicial')::numeric ELSE (p->>'troco_inicial_caixa')::numeric END, 0),
              'ABERTO', r.loja_id);
    END IF;
  END IF;

  IF r.tipo = 'VENDA_REGISTRADA' THEN
    v_parcelado := EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p->'pagamentos') = 'array' THEN p->'pagamentos' ELSE '[]'::jsonb END) x
                            WHERE coalesce((x->>'parcelas')::int, 1) > 1);
    IF v_parcelado THEN
      PERFORM public.registrar_venda_com_itens_v2(r.venda_id, r.caixa_id, r.operador_id, p->>'forma_pagamento',
        (p->>'total_bruto')::numeric, (p->>'total_desconto')::numeric, (p->>'total_liquido')::numeric, p->'itens',
        (p->>'desconto_gerente_percentual')::numeric, (p->>'desconto_gerente_valor')::numeric, p->>'gerente_id',
        CASE WHEN jsonb_typeof(p->'pagamentos') = 'array' THEN p->'pagamentos' END);
    ELSE
      PERFORM public.registrar_venda_com_itens(r.venda_id, r.caixa_id, r.operador_id, p->>'forma_pagamento',
        (p->>'total_bruto')::numeric, (p->>'total_desconto')::numeric, (p->>'total_liquido')::numeric, p->'itens',
        (p->>'desconto_gerente_percentual')::numeric, (p->>'desconto_gerente_valor')::numeric, p->>'gerente_id',
        CASE WHEN jsonb_typeof(p->'pagamentos') = 'array' THEN p->'pagamentos' END);
    END IF;
    PERFORM public.ensure_venda_evento_registrado(r.venda_id, 'sync_outbox_revisao');
    -- A baixa de estoque só aceita o próprio operador ou o service_role (caminho do sync-outbox). O revisor já foi
    -- autorizado em revisar_evento_offline; a baixa roda com o contexto do sync e o contexto do revisor é restaurado.
    v_claims := current_setting('request.jwt.claims', true);
    v_sub := current_setting('request.jwt.claim.sub', true);
    v_role := current_setting('request.jwt.claim.role', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    FOR v_item IN SELECT * FROM jsonb_array_elements(p->'itens') LOOP
      SELECT * INTO v_res FROM internal.decrementar_estoque_seguro(
        p_produto_id => (v_item->>'produto_id')::uuid, p_quantidade => (v_item->>'quantidade')::numeric, p_venda_id => r.venda_id);
      IF v_res.sucesso IS FALSE AND coalesce(v_res.mensagem, '') !~ 'BAIXA_JA_EXISTE' THEN
        RAISE EXCEPTION 'REVISAO_ERRO_ESTOQUE: %', v_res.mensagem;
      END IF;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    PERFORM set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
  ELSIF r.tipo = 'MOVIMENTO_CAIXA' THEN
    SELECT c.loja_id, c.operador_id INTO v_caixa_loja, v_caixa_op FROM public.caixas c WHERE c.id = r.caixa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REVISAO_CAIXA_INEXISTENTE: aprove antes a abertura do caixa'; END IF;
    IF v_caixa_loja IS DISTINCT FROM r.loja_id THEN RAISE EXCEPTION 'REVISAO_CAIXA_DE_OUTRA_LOJA'; END IF;
    PERFORM * FROM internal.registrar_movimentacao(
      p_caixa_id => r.caixa_id, p_tipo => CASE WHEN p->>'tipo' = 'SANGRIA' THEN 'sangria' ELSE 'suprimento' END,
      p_forma_pagamento => 'dinheiro', p_valor => (p->>'valor')::numeric,
      p_motivo => coalesce(nullif(btrim(p->>'observacao'), ''), 'Movimento sincronizado (PDV local, revisado)'),
      p_motivo_codigo => 'OUTRO', p_status => NULL, p_movimentacao_origem_id => NULL, p_idempotency_key => btrim(p->>'id'),
      p_ip_address => NULL, p_user_agent => NULL, p_device_id => NULL, p_terminal_id => 'sync-outbox-revisao',
      p_operador_id => v_caixa_op, p_gerente_id => NULL);
  ELSIF r.tipo = 'CAIXA_FECHADO' THEN
    SELECT c.status INTO v_status FROM public.caixas c WHERE c.id = r.caixa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REVISAO_CAIXA_INEXISTENTE: aprove antes a abertura do caixa'; END IF;
    IF v_status <> 'FECHADO' THEN
      PERFORM public.fechar_caixa_pdv_atomico(r.caixa_id, coalesce((p->>'valor_fechamento')::numeric, 0),
        nullif(btrim(p->>'fechamento_observacao'), ''), internal.fp_ts_ou_null(p->>'data_fechamento'));
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION internal.sync_aplicar_evento_revisado(public.sync_eventos_revisao) FROM PUBLIC, anon, authenticated;

-- 7. Decisão do DONO/GERENTE ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revisar_evento_offline(p_id uuid, p_decisao text, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r public.sync_eventos_revisao%ROWTYPE;
  v_motivo text := btrim(coalesce(p_motivo, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'REVISAO_EXIGE_USUARIO' USING ERRCODE = '42501'; END IF;
  IF p_decisao NOT IN ('APROVAR', 'REJEITAR') THEN RAISE EXCEPTION 'REVISAO_DECISAO_INVALIDA'; END IF;
  IF length(v_motivo) < 5 THEN RAISE EXCEPTION 'REVISAO_MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO v_r FROM public.sync_eventos_revisao WHERE id = p_id FOR UPDATE;
  -- Fora do escopo e inexistente respondem igual (não revela eventos de outra loja/empresa).
  IF NOT FOUND OR NOT internal.fp_usuario_ativo_com_papel(v_uid, v_r.loja_id, ARRAY['DONO', 'GERENTE']) THEN
    RAISE EXCEPTION 'REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'PENDENTE' THEN RAISE EXCEPTION 'REVISAO_JA_DECIDIDA'; END IF;
  IF v_r.operador_id IS NOT DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'REVISAO_AUTOAPROVACAO_PROIBIDA' USING ERRCODE = '42501';
  END IF;
  IF p_decisao = 'APROVAR' THEN
    IF v_r.caixa_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.sync_eventos_revisao o
         WHERE o.caixa_id = v_r.caixa_id AND o.status = 'PENDENTE' AND o.seq < v_r.seq) THEN
      RAISE EXCEPTION 'REVISAO_FORA_DE_ORDEM: decida antes os eventos anteriores deste caixa';
    END IF;
    PERFORM internal.sync_aplicar_evento_revisado(v_r);
  END IF;
  UPDATE public.sync_eventos_revisao
     SET status = CASE WHEN p_decisao = 'APROVAR' THEN 'APROVADO' ELSE 'REJEITADO' END,
         decidido_por = v_uid, decidido_em = now(), decisao_motivo = v_motivo
   WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'status', CASE WHEN p_decisao = 'APROVAR' THEN 'APROVADO' ELSE 'REJEITADO' END);
END $$;
REVOKE ALL ON FUNCTION public.revisar_evento_offline(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_evento_offline(uuid, text, text) TO authenticated;
COMMENT ON FUNCTION public.revisar_evento_offline(uuid, text, text) IS
  'Multiempresa revisado (20261028130000): exige DONO/GERENTE ativo com vínculo na loja do evento '
  '(internal.fp_usuario_ativo_com_papel); fora do escopo = não encontrado. Sem autoaprovação; motivo obrigatório; ordem por caixa.';

COMMIT;
