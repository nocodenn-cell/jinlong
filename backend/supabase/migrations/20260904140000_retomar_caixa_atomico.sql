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
--
-- Revisão pós-Codex (achados P1, todos corrigidos nesta mesma migration —
-- ainda não aplicada em produção, então edita o arquivo em vez de criar
-- follow-up):
--   1. Requisitante (quem chama a RPC) precisa ser GERENTE/DONO/ADMIN —
--      um OPERADOR ativo não pode mais retomar sozinho só por possuir um
--      token válido (D0-05 exige que a própria ação de retomada seja
--      executada por GERENTE/DONO).
--   2. Unique index em turno_anterior_id: garante no máximo UM turno
--      retomado por turno fechado, mesmo com requisitantes diferentes
--      (o FOR UPDATE na linha antiga serializa, mas não impedia duas
--      linhas novas distintas antes desta correção).
--   3. Aprovador do token precisa estar ativo (usuarios.ativo = true) —
--      antes só o perfil era checado; um gerente desativado após emitir
--      o token continuava autorizando até o token expirar (5 min).
--   4. Colunas de auditoria da retomada (turno_anterior_id/motivo_retomada/
--      autorizado_por) ficam fora do INSERT direto de `authenticated`
--      (mesmo padrão de coluna restrita já usado em
--      20260814012644_protect_cash_balance_authority.sql) — sem isso,
--      qualquer operador autenticado podia fabricar via REST uma
--      "retomada" aparentemente autorizada, sem token nenhum.
--   5. Trigger de imutabilidade: uma vez FECHADO, `caixas.status` nunca
--      mais muda (por nenhum papel, nem authenticated nem service_role) —
--      fecha o bypass de PATCH direto que reabriria o turno antigo sem
--      passar pela RPC.

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

-- Achado #2 (Codex): no máximo um turno retomado por turno fechado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_caixas_turno_anterior_id
  ON public.caixas (turno_anterior_id)
  WHERE turno_anterior_id IS NOT NULL;

-- Achado #4 (Codex): colunas de auditoria da retomada nunca são graváveis
-- por INSERT direto de `authenticated` — só a RPC (SECURITY DEFINER, dono
-- postgres) grava esses campos.
--
-- `REVOKE INSERT (col) ... FROM authenticated` sozinho NÃO bastaria: o
-- grant de INSERT existente em `caixas` é de TABELA (não por coluna) —
-- confirmado via has_column_privilege ainda retornando true após um
-- REVOKE só de coluna, porque um grant de tabela e um grant de coluna são
-- entradas de ACL independentes (a coluna herda do grant de tabela mesmo
-- que a entrada de coluna seja revogada). Mesmo padrão já usado para
-- UPDATE em 20260814012644_protect_cash_balance_authority.sql: primeiro
-- revoga o grant de tabela inteiro, depois regrant só nas colunas que o
-- produto legitimamente insere (as 11 pré-existentes), deixando as 3
-- novas colunas de auditoria de fora.
REVOKE INSERT ON public.caixas FROM authenticated, anon;
GRANT INSERT (
  id, loja_id, operador_id, status, valor_inicial, data_abertura,
  data_fechamento, valor_fechamento, fechamento_diferenca, fechamento_observacao,
  saldo_atual
) ON public.caixas TO authenticated;

-- Achado #5 (Codex): uma vez FECHADO, status nunca muda — para qualquer
-- role, inclusive service_role/SECURITY DEFINER (trigger não olha grant).
-- Fecha o bypass de PATCH direto (authenticated tem UPDATE(status) desde
-- 20260814012644_protect_cash_balance_authority.sql) que reabriria o
-- turno antigo sem passar por retomar_caixa_atomico.
CREATE OR REPLACE FUNCTION public.trg_caixas_fechado_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'FECHADO' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'CAIXA_FECHADO_STATUS_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_caixas_fechado_imutavel ON public.caixas;
CREATE TRIGGER trg_caixas_fechado_imutavel
  BEFORE UPDATE ON public.caixas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_caixas_fechado_imutavel();

COMMENT ON FUNCTION public.trg_caixas_fechado_imutavel IS
  'Item 22 (achado Codex #5): FECHADO é terminal — status nunca muda depois, nem via RPC SECURITY DEFINER. Reabertura sempre cria novo turno (retomar_caixa_atomico), nunca muta o antigo.';

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
  v_requester_loja uuid;
  v_token text := NULLIF(btrim(p_gerente_token), '');
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_aprovador_uid uuid;
  v_aprovador_perfil text;
  v_aprovador_loja uuid;
  v_aprovador_ativo boolean;
  v_caixa_loja uuid;
  v_caixa_status text;
  v_novo_id uuid;
BEGIN
  IF v_requester_uid IS NULL THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_AUTH';
  END IF;

  SELECT u.perfil, u.ativo, u.loja_id INTO v_requester_perfil, v_requester_ativo, v_requester_loja
  FROM public.usuarios u WHERE u.id = v_requester_uid;

  IF v_requester_perfil IS NULL OR v_requester_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_REQUISITANTE_INATIVO';
  END IF;

  -- Achado #1 (Codex): a própria ação de retomada só pode ser executada
  -- por GERENTE/DONO/ADMIN — um OPERADOR não pode se auto-retomar mesmo
  -- de posse de um token de gerente válido (D0-05).
  IF v_requester_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_REQUISITANTE_PERFIL';
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

  SELECT u.perfil, u.loja_id, u.ativo INTO v_aprovador_perfil, v_aprovador_loja, v_aprovador_ativo
  FROM public.usuarios u WHERE u.id = v_aprovador_uid;

  IF v_aprovador_perfil IS NULL OR v_aprovador_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_APROVADOR_PERFIL';
  END IF;

  -- Achado #3 (Codex): o aprovador do token precisa estar ativo NO
  -- MOMENTO DO USO, não só quando o token foi emitido — um gerente
  -- desativado depois de emitir o token não pode continuar autorizando
  -- até o token expirar (5 min).
  IF v_aprovador_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_APROVADOR_INATIVO';
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

  -- Achado #2 (Codex): pré-checagem de negócio (a unique index é a
  -- garantia real contra corrida; isto só devolve um erro legível em vez
  -- de uma violação de constraint genérica no caminho feliz).
  IF EXISTS (
    SELECT 1 FROM public.caixas c WHERE c.turno_anterior_id = p_caixa_fechado_id
  ) THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_JA_RETOMADO';
  END IF;

  -- GERENTE só autoriza retomada dentro da própria loja (Padrão A: DONO/ADMIN
  -- têm escopo global, igual a todo o restante do sistema).
  IF v_aprovador_perfil = 'GERENTE' AND v_aprovador_loja IS DISTINCT FROM v_caixa_loja THEN
    RAISE EXCEPTION 'RETOMAR_CAIXA_LOJA_INVALIDA';
  END IF;

  -- Requisitante (quem vai operar o novo turno) precisa pertencer à mesma
  -- loja do caixa fechado — nunca abrir turno para outra loja por engano.
  IF v_requester_perfil = 'GERENTE' AND v_requester_loja IS DISTINCT FROM v_caixa_loja THEN
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
  'Item 22 do Plano Mestre — Opção B aprovada (DB-07/DB-08): cria um NOVO turno vinculado ao caixa fechado, nunca muta o status/fechamento do turno original. Requisitante e aprovador do token precisam ser GERENTE/DONO/ADMIN ativos; requer token de gerente (mesmo mecanismo de aprovar_movimentacao).';

REVOKE ALL ON FUNCTION public.retomar_caixa_atomico(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retomar_caixa_atomico(uuid, text, text) TO authenticated, service_role;

DO $verify$
DECLARE
  v_authenticated boolean;
  v_anon boolean;
  v_has_columns boolean;
  v_insert_col boolean;
BEGIN
  v_authenticated := has_function_privilege('authenticated', 'public.retomar_caixa_atomico(uuid, text, text)', 'EXECUTE');
  v_anon := has_function_privilege('anon', 'public.retomar_caixa_atomico(uuid, text, text)', 'EXECUTE');
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'caixas' AND column_name = 'turno_anterior_id'
  ) INTO v_has_columns;
  v_insert_col := has_column_privilege('authenticated', 'public.caixas', 'turno_anterior_id', 'INSERT');

  IF NOT v_authenticated THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: authenticated deveria poder executar retomar_caixa_atomico';
  END IF;
  IF v_anon THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: anon nao deveria poder executar retomar_caixa_atomico';
  END IF;
  IF NOT v_has_columns THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: caixas.turno_anterior_id nao foi criada';
  END IF;
  IF v_insert_col THEN
    RAISE EXCEPTION 'VERIFY_FALHOU: authenticated nao deveria poder INSERT direto em turno_anterior_id';
  END IF;

  RAISE NOTICE 'retomar_caixa_atomico: grants OK (authenticated=true, anon=false), colunas de vinculo protegidas, trigger de imutabilidade ativo.';
END
$verify$;
