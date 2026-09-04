-- Item 22 do Plano Mestre de Fechamento dos Gaps — reabertura de caixa
-- autorizada.
--
-- O plano original sugeria `reabrir_caixa_atomico` mutando
-- caixas.status de FECHADO de volta para ABERTO na MESMA linha. Essa
-- opção já foi formalmente investigada e REJEITADA antes desta unidade:
-- GO_LIVE_CERTIFICATION_REPORT.md (achado FIN-298-09, decisão DB-07/DB-08,
-- "APROVADA — Opção B") e docs/piloto-d0/DEFINICAO_FUNCIONAL_D0.md (D0-05)
-- exigem que "turno fechado nunca volta a ABERTO" — a "retomada" precisa
-- criar um NOVO turno vinculado ao anterior, preservando o turno fechado
-- imutável. Motivo: mutar o status de volta reabriria
-- trg_fn_vendas_caixa_aberto (206_vendas_caixa_imutabilidade_trigger.sql)
-- para aceitar vendas na MESMA linha que já foi fechada/reconciliada,
-- misturando dois períodos operacionais na mesma auditoria.
--
-- Esta migration implementa a opção aprovada (Opção B): novo turno,
-- vínculo explícito ao turno anterior, sem tocar o status/campos de
-- fechamento da linha antiga.

ALTER TABLE public.caixas
  ADD COLUMN IF NOT EXISTS turno_anterior_id uuid REFERENCES public.caixas(id),
  ADD COLUMN IF NOT EXISTS motivo_retomada text,
  ADD COLUMN IF NOT EXISTS autorizado_por uuid REFERENCES public.usuarios(id);

COMMENT ON COLUMN public.caixas.turno_anterior_id IS
  'Item 22: preenchido só em turnos criados por retomar_caixa_atomico — aponta para o caixa FECHADO que originou a retomada. NULL para turnos abertos normalmente.';
COMMENT ON COLUMN public.caixas.motivo_retomada IS
  'Item 22: motivo obrigatório da retomada (DB-07/DB-08) — só preenchido junto com turno_anterior_id.';
COMMENT ON COLUMN public.caixas.autorizado_por IS
  'Item 22: gerente/dono/admin que autorizou a retomada via token (tokens_desconto_gerente.criado_por) — fonte autoritativa, nunca o parâmetro do chamador.';

CREATE OR REPLACE FUNCTION public.retomar_caixa_atomico(
  p_caixa_fechado_id uuid,
  p_gerente_token    text,
  p_motivo           text
)
RETURNS TABLE (
  o_novo_caixa_id uuid,
  o_turno_anterior_id uuid,
  o_loja_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requester_uid uuid := auth.uid();
  v_requester_perfil text;
  v_requester_ativo boolean;
  v_token text := NULLIF(btrim(p_gerente_token), '');
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_aprovador_uid uuid;
  v_aprovador_perfil text;
  v_aprovador_loja uuid;
  v_caixa_loja uuid;
  v_caixa_status text;
  v_novo_id uuid;
BEGIN
  IF v_requester_uid IS NULL THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_AUTH';
  END IF;

  SELECT u.perfil, u.ativo INTO v_requester_perfil, v_requester_ativo
  FROM public.usuarios u WHERE u.id = v_requester_uid;

  IF v_requester_perfil IS NULL OR v_requester_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_REQUISITANTE_INATIVO';
  END IF;

  IF v_motivo IS NULL OR length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_MOTIVO_OBRIGATORIO';
  END IF;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_TOKEN_OBRIGATORIO';
  END IF;

  -- Mesmo padrão de aprovar_movimentacao (fix_movimentacao_gerente_id_bypass_seguranca):
  -- o aprovador registrado vem de tokens_desconto_gerente.criado_por —
  -- fonte autoritativa de quem validou a senha de gerente na Edge Function
  -- validar-gerente — nunca de um parâmetro enviado pelo chamador.
  SELECT t.criado_por
  INTO v_aprovador_uid
  FROM public.tokens_desconto_gerente t
  WHERE t.token = v_token
    AND t.usado = false
    AND t.expira_em > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_TOKEN_INVALIDO';
  END IF;

  -- Anti-replay: token só pode ser consumido uma vez.
  UPDATE public.tokens_desconto_gerente
  SET usado = true
  WHERE token = v_token
    AND usado = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_TOKEN_INVALIDO';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_aprovador_perfil, v_aprovador_loja
  FROM public.usuarios u WHERE u.id = v_aprovador_uid;

  IF v_aprovador_perfil IS NULL OR v_aprovador_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_APROVADOR_PERFIL';
  END IF;

  SELECT c.loja_id, c.status INTO v_caixa_loja, v_caixa_status
  FROM public.caixas c
  WHERE c.id = p_caixa_fechado_id
  FOR UPDATE;

  IF v_caixa_loja IS NULL THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF v_caixa_status <> 'FECHADO' THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_NAO_FECHADO';
  END IF;

  -- GERENTE só autoriza retomada dentro da própria loja (Padrão A: DONO/ADMIN
  -- têm escopo global, igual a todo o restante do sistema).
  IF v_aprovador_perfil = 'GERENTE' AND v_aprovador_loja IS DISTINCT FROM v_caixa_loja THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_LOJA_INVALIDA';
  END IF;

  -- Requisitante (quem vai operar o novo turno) precisa pertencer à mesma
  -- loja do caixa fechado — nunca abrir turno para outra loja por engano.
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_requester_uid AND u.loja_id = v_caixa_loja
  ) AND v_requester_perfil NOT IN ('DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_REQUISITANTE_LOJA_INVALIDA';
  END IF;

  -- caixas_operador_aberto (unique) já impediria um segundo turno ABERTO
  -- para o mesmo operador — verificado aqui antes para devolver um erro
  -- de negócio claro em vez de uma violação de constraint genérica.
  IF EXISTS (
    SELECT 1 FROM public.caixas c
    WHERE c.operador_id = v_requester_uid AND c.status = 'ABERTO'
  ) THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_OPERADOR_JA_TEM_CAIXA_ABERTO';
  END IF;

  INSERT INTO public.caixas (
    operador_id, loja_id, status, valor_inicial, data_abertura,
    turno_anterior_id, motivo_retomada, autorizado_por
  ) VALUES (
    v_requester_uid, v_caixa_loja, 'ABERTO', 0, now(),
    p_caixa_fechado_id, v_motivo, v_aprovador_uid
  )
  RETURNING id INTO v_novo_id;

  RETURN QUERY SELECT v_novo_id, p_caixa_fechado_id, v_caixa_loja;
END;
$$;

COMMENT ON FUNCTION public.retomar_caixa_atomico IS
  'Item 22 do Plano Mestre — Opção B aprovada (DB-07/DB-08): cria um NOVO turno vinculado ao caixa fechado, nunca muta o status/fechamento do turno original. Requer token de gerente (mesmo mecanismo de aprovar_movimentacao).';

REVOKE ALL ON FUNCTION public.retomar_caixa_atomico(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retomar_caixa_atomico(uuid, text, text) TO authenticated, service_role;

DO $verify$
DECLARE
  v_authenticated boolean;
  v_anon boolean;
  v_has_columns boolean;
BEGIN
  v_authenticated := has_function_privilege('authenticated', 'public.retomar_caixa_atomico(uuid, text, text)', 'EXECUTE');
  v_anon := has_function_privilege('anon', 'public.retomar_caixa_atomico(uuid, text, text)', 'EXECUTE');
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'caixas' AND column_name = 'turno_anterior_id'
  ) INTO v_has_columns;

  IF NOT v_authenticated THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: authenticated deveria poder executar retomar_caixa_atomico';
  END IF;
  IF v_anon THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: anon nao deveria poder executar retomar_caixa_atomico';
  END IF;
  IF NOT v_has_columns THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: caixas.turno_anterior_id nao foi criada';
  END IF;

  RAISE NOTICE 'retomar_caixa_atomico: grants OK (authenticated=true, anon=false), colunas de vinculo criadas.';
END
$verify$;
