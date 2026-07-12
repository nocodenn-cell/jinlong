-- Etapa 1 — Sangria/Suprimento transacional com auditoria e idempotência
-- Objetivo: introduzir movimentacoes_caixa sem quebrar fluxo legado de movimentos_caixa.

ALTER TABLE public.caixas
  ADD COLUMN IF NOT EXISTS saldo_atual numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.caixas.saldo_atual IS
  'Saldo físico atual (espécie) da sessão de caixa, atualizado de forma transacional.';

-- Backfill inicial com a mesma lógica atualmente usada no fechamento.
WITH vendas_dinheiro AS (
  SELECT
    v.caixa_id,
    COALESCE(SUM(v.total_liquido), 0)::numeric(10,2) AS total_vendas_dinheiro
  FROM public.vendas v
  WHERE v.forma_pagamento = 'DINHEIRO'
    AND v.status = 'CONCLUIDA'
  GROUP BY v.caixa_id
),
movimentos_legado AS (
  SELECT
    m.caixa_id,
    COALESCE(SUM(CASE WHEN m.tipo = 'SUPRIMENTO' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS total_suprimento,
    COALESCE(SUM(CASE WHEN m.tipo = 'SANGRIA' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS total_sangria
  FROM public.movimentos_caixa m
  WHERE m.tipo IN ('SUPRIMENTO', 'SANGRIA')
  GROUP BY m.caixa_id
),
saldo_inicial AS (
  SELECT
    c.id,
    ROUND(
      COALESCE(c.valor_inicial, 0)
      + COALESCE(vd.total_vendas_dinheiro, 0)
      + COALESCE(ml.total_suprimento, 0)
      - COALESCE(ml.total_sangria, 0),
      2
    ) AS saldo_calculado
  FROM public.caixas c
  LEFT JOIN vendas_dinheiro vd ON vd.caixa_id = c.id
  LEFT JOIN movimentos_legado ml ON ml.caixa_id = c.id
)
UPDATE public.caixas c
SET saldo_atual = si.saldo_calculado
FROM saldo_inicial si
WHERE si.id = c.id;

ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS limite_sangria_sem_gerente numeric(10,2) NOT NULL DEFAULT 200;

COMMENT ON COLUMN public.pdv_config.limite_sangria_sem_gerente IS
  'Valor acima do qual a sangria fica pendente e exige aprovação gerencial.';

CREATE TABLE IF NOT EXISTS public.movimentacoes_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_sequencial bigserial UNIQUE,
  caixa_id uuid NOT NULL REFERENCES public.caixas(id),
  operador_id uuid NOT NULL REFERENCES public.usuarios(id),
  gerente_id uuid REFERENCES public.usuarios(id),
  tipo text NOT NULL CHECK (tipo IN ('suprimento', 'sangria', 'estorno')),
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'outro')),
  valor numeric(10,2) NOT NULL CHECK (valor > 0),
  motivo_codigo text NOT NULL DEFAULT 'OUTRO',
  motivo text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'cancelado')),
  movimentacao_origem_id uuid REFERENCES public.movimentacoes_caixa(id),
  idempotency_key text NOT NULL,
  saldo_antes numeric(10,2) NOT NULL DEFAULT 0,
  saldo_depois numeric(10,2) NOT NULL DEFAULT 0,
  ip_address inet,
  user_agent text,
  device_id text,
  terminal_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT chk_mov_caixa_nao_estornar_si_mesmo CHECK (id <> movimentacao_origem_id),
  CONSTRAINT chk_mov_caixa_sangria_apenas_dinheiro CHECK (tipo <> 'sangria' OR forma_pagamento = 'dinheiro'),
  CONSTRAINT chk_mov_caixa_origem_estorno CHECK (
    (tipo = 'estorno' AND movimentacao_origem_id IS NOT NULL)
    OR
    (tipo <> 'estorno' AND movimentacao_origem_id IS NULL)
  ),
  CONSTRAINT chk_mov_caixa_idempotency_key_not_blank CHECK (length(btrim(idempotency_key)) > 0)
);

ALTER TABLE public.movimentacoes_caixa ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_main
  ON public.movimentacoes_caixa(caixa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_origem
  ON public.movimentacoes_caixa(movimentacao_origem_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_movimentacoes_caixa_idempotency
  ON public.movimentacoes_caixa(caixa_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_movimentacoes_caixa_estorno_ativo
  ON public.movimentacoes_caixa(movimentacao_origem_id)
  WHERE tipo = 'estorno' AND status IN ('pendente', 'aprovado');

DROP POLICY IF EXISTS "movimentacoes_caixa_select_loja" ON public.movimentacoes_caixa;
CREATE POLICY "movimentacoes_caixa_select_loja"
  ON public.movimentacoes_caixa FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = movimentacoes_caixa.caixa_id
        AND c.loja_id = u.loja_id
        AND (
          movimentacoes_caixa.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    )
  );

DROP TRIGGER IF EXISTS movimentacoes_caixa_updated_at ON public.movimentacoes_caixa;
CREATE TRIGGER movimentacoes_caixa_updated_at
  BEFORE UPDATE ON public.movimentacoes_caixa
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.registrar_movimentacao(
  p_caixa_id uuid,
  p_tipo text,
  p_forma_pagamento text,
  p_valor numeric,
  p_motivo text,
  p_motivo_codigo text DEFAULT 'OUTRO',
  p_status text DEFAULT NULL,
  p_movimentacao_origem_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_operador_id uuid DEFAULT NULL,
  p_gerente_id uuid DEFAULT NULL
)
RETURNS TABLE (
  movimentacao_id uuid,
  status_movimentacao text,
  saldo_atual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_caixa record;
  v_origem record;
  v_movimentacao_id uuid;
  v_idempotency_key text := NULLIF(btrim(p_idempotency_key), '');
  v_status text;
  v_valor numeric(10,2);
  v_forma text;
  v_delta numeric(10,2) := 0;
  v_saldo_antes numeric(10,2);
  v_saldo_depois numeric(10,2);
  v_limite_sangria numeric(10,2) := 200;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_AUTH';
  END IF;

  IF p_tipo NOT IN ('suprimento', 'sangria', 'estorno') THEN
    RAISE EXCEPTION 'MOV_CAIXA_TIPO_INVALIDO';
  END IF;

  IF p_forma_pagamento NOT IN ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'outro') THEN
    RAISE EXCEPTION 'MOV_CAIXA_FORMA_INVALIDA';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'MOV_CAIXA_VALOR_INVALIDO';
  END IF;

  IF v_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_IDEMPOTENCY_KEY_OBRIGATORIA';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('pendente', 'aprovado', 'cancelado') THEN
    RAISE EXCEPTION 'MOV_CAIXA_STATUS_INVALIDO';
  END IF;

  SELECT c.id, c.status, c.saldo_atual, c.loja_id
  INTO v_caixa
  FROM public.caixas c
  WHERE c.id = p_caixa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOV_CAIXA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF v_caixa.status <> 'ABERTO' THEN
    RAISE EXCEPTION 'MOV_CAIXA_FECHADO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.caixas c
    INNER JOIN public.usuarios u ON u.id = v_uid
    WHERE c.id = p_caixa_id
      AND c.loja_id = u.loja_id
      AND (
        c.operador_id = v_uid
        OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      )
  ) THEN
    RAISE EXCEPTION 'MOV_CAIXA_SEM_PERMISSAO';
  END IF;

  IF p_gerente_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios ug
      WHERE ug.id = p_gerente_id
        AND ug.loja_id = v_caixa.loja_id
        AND ug.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    ) THEN
      RAISE EXCEPTION 'MOV_CAIXA_GERENTE_INVALIDO';
    END IF;
  END IF;

  SELECT COALESCE(pc.limite_sangria_sem_gerente, 200)
  INTO v_limite_sangria
  FROM public.pdv_config pc
  WHERE pc.id = 1;

  IF p_tipo = 'estorno' THEN
    IF p_movimentacao_origem_id IS NULL THEN
      RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_SEM_ORIGEM';
    END IF;

    SELECT
      m.id,
      m.caixa_id,
      m.tipo,
      m.forma_pagamento,
      m.valor,
      m.status
    INTO v_origem
    FROM public.movimentacoes_caixa m
    WHERE m.id = p_movimentacao_origem_id
      AND m.caixa_id = p_caixa_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MOV_CAIXA_ORIGEM_NAO_ENCONTRADA';
    END IF;

    IF v_origem.tipo = 'estorno' THEN
      RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_DE_ESTORNO_NAO_PERMITIDO';
    END IF;

    IF v_origem.status <> 'aprovado' THEN
      RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_ORIGEM_NAO_APROVADA';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.movimentacoes_caixa e
      WHERE e.movimentacao_origem_id = v_origem.id
        AND e.tipo = 'estorno'
        AND e.status IN ('pendente', 'aprovado')
    ) THEN
      RAISE EXCEPTION 'MOV_CAIXA_ORIGEM_JA_ESTORNADA';
    END IF;

    v_valor := v_origem.valor;
    v_forma := v_origem.forma_pagamento;
  ELSE
    IF p_movimentacao_origem_id IS NOT NULL THEN
      RAISE EXCEPTION 'MOV_CAIXA_ORIGEM_SO_PARA_ESTORNO';
    END IF;
    v_valor := ROUND(p_valor, 2);
    v_forma := p_forma_pagamento;
  END IF;

  IF p_tipo = 'sangria' AND v_forma <> 'dinheiro' THEN
    RAISE EXCEPTION 'MOV_CAIXA_SANGRIA_FORMA_INVALIDA';
  END IF;

  v_status := COALESCE(
    p_status,
    CASE
      WHEN p_tipo = 'sangria' AND v_valor > v_limite_sangria AND p_gerente_id IS NULL THEN 'pendente'
      ELSE 'aprovado'
    END
  );

  IF p_tipo = 'sangria' AND v_valor > v_limite_sangria AND v_status = 'aprovado' AND p_gerente_id IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_SANGRIA_ALTA_EXIGE_GERENTE';
  END IF;

  v_saldo_antes := ROUND(COALESCE(v_caixa.saldo_atual, 0), 2);
  v_saldo_depois := v_saldo_antes;

  IF v_status = 'aprovado' THEN
    IF p_tipo = 'suprimento' THEN
      v_delta := CASE WHEN v_forma = 'dinheiro' THEN v_valor ELSE 0 END;
    ELSIF p_tipo = 'sangria' THEN
      v_delta := -v_valor;
    ELSIF p_tipo = 'estorno' THEN
      IF v_origem.tipo = 'sangria' THEN
        v_delta := v_valor;
      ELSIF v_origem.tipo = 'suprimento' AND v_origem.forma_pagamento = 'dinheiro' THEN
        v_delta := -v_valor;
      ELSE
        v_delta := 0;
      END IF;
    END IF;

    UPDATE public.caixas c
    SET saldo_atual = ROUND(c.saldo_atual + v_delta, 2)
    WHERE c.id = p_caixa_id
      AND (c.saldo_atual + v_delta) >= 0
    RETURNING c.saldo_atual INTO v_saldo_depois;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MOV_CAIXA_SALDO_INSUFICIENTE';
    END IF;
  END IF;

  INSERT INTO public.movimentacoes_caixa (
    caixa_id,
    operador_id,
    gerente_id,
    tipo,
    forma_pagamento,
    valor,
    motivo_codigo,
    motivo,
    status,
    movimentacao_origem_id,
    idempotency_key,
    saldo_antes,
    saldo_depois,
    ip_address,
    user_agent,
    device_id,
    terminal_id
  ) VALUES (
    p_caixa_id,
    v_uid,
    p_gerente_id,
    p_tipo,
    v_forma,
    v_valor,
    COALESCE(NULLIF(btrim(p_motivo_codigo), ''), 'OUTRO'),
    COALESCE(NULLIF(btrim(p_motivo), ''), 'Sem motivo informado'),
    v_status,
    p_movimentacao_origem_id,
    v_idempotency_key,
    v_saldo_antes,
    v_saldo_depois,
    p_ip_address,
    p_user_agent,
    p_device_id,
    p_terminal_id
  )
  RETURNING id INTO v_movimentacao_id;

  RETURN QUERY
  SELECT v_movimentacao_id, v_status, v_saldo_depois;

EXCEPTION
  WHEN unique_violation THEN
    IF EXISTS (
      SELECT 1
      FROM public.movimentacoes_caixa m
      WHERE m.caixa_id = p_caixa_id
        AND m.idempotency_key = v_idempotency_key
    ) THEN
      RETURN QUERY
      SELECT
        m.id,
        m.status,
        m.saldo_depois
      FROM public.movimentacoes_caixa m
      WHERE m.caixa_id = p_caixa_id
        AND m.idempotency_key = v_idempotency_key
      LIMIT 1;
      RETURN;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.aprovar_movimentacao(
  p_movimentacao_id uuid,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_gerente_id uuid DEFAULT NULL
)
RETURNS TABLE (
  movimentacao_id uuid,
  status_movimentacao text,
  saldo_atual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_gerente_id);
  v_mov record;
  v_caixa record;
  v_origem record;
  v_saldo_depois numeric(10,2);
  v_delta numeric(10,2) := 0;
  v_limite_sangria numeric(10,2) := 200;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_AUTH';
  END IF;

  SELECT m.*
  INTO v_mov
  FROM public.movimentacoes_caixa m
  WHERE m.id = p_movimentacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_NAO_ENCONTRADA';
  END IF;

  IF v_mov.status <> 'pendente' THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_STATUS_INVALIDO';
  END IF;

  SELECT c.id, c.status, c.saldo_atual, c.loja_id
  INTO v_caixa
  FROM public.caixas c
  WHERE c.id = v_mov.caixa_id
  FOR UPDATE;

  IF NOT FOUND OR v_caixa.status <> 'ABERTO' THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_CAIXA_FECHADO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = v_uid
      AND u.loja_id = v_caixa.loja_id
      AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_SEM_PERMISSAO';
  END IF;

  SELECT COALESCE(pc.limite_sangria_sem_gerente, 200)
  INTO v_limite_sangria
  FROM public.pdv_config pc
  WHERE pc.id = 1;

  IF v_mov.tipo = 'sangria' AND v_mov.valor > v_limite_sangria AND v_uid IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_GERENTE_OBRIGATORIO';
  END IF;

  IF v_mov.tipo = 'estorno' THEN
    SELECT o.*
    INTO v_origem
    FROM public.movimentacoes_caixa o
    WHERE o.id = v_mov.movimentacao_origem_id
      AND o.caixa_id = v_mov.caixa_id
    FOR UPDATE;

    IF NOT FOUND OR v_origem.status <> 'aprovado' THEN
      RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_ESTORNO_ORIGEM_INVALIDA';
    END IF;
  END IF;

  IF v_mov.tipo = 'suprimento' THEN
    v_delta := CASE WHEN v_mov.forma_pagamento = 'dinheiro' THEN v_mov.valor ELSE 0 END;
  ELSIF v_mov.tipo = 'sangria' THEN
    v_delta := -v_mov.valor;
  ELSIF v_mov.tipo = 'estorno' THEN
    IF v_origem.tipo = 'sangria' THEN
      v_delta := v_mov.valor;
    ELSIF v_origem.tipo = 'suprimento' AND v_origem.forma_pagamento = 'dinheiro' THEN
      v_delta := -v_mov.valor;
    ELSE
      v_delta := 0;
    END IF;
  END IF;

  UPDATE public.caixas c
  SET saldo_atual = ROUND(c.saldo_atual + v_delta, 2)
  WHERE c.id = v_mov.caixa_id
    AND (c.saldo_atual + v_delta) >= 0
  RETURNING c.saldo_atual INTO v_saldo_depois;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOV_CAIXA_APROVACAO_SALDO_INSUFICIENTE';
  END IF;

  UPDATE public.movimentacoes_caixa m
  SET
    status = 'aprovado',
    gerente_id = v_uid,
    saldo_antes = v_mov.saldo_depois,
    saldo_depois = v_saldo_depois,
    ip_address = COALESCE(p_ip_address, m.ip_address),
    user_agent = COALESCE(p_user_agent, m.user_agent),
    device_id = COALESCE(p_device_id, m.device_id),
    terminal_id = COALESCE(p_terminal_id, m.terminal_id),
    updated_at = now()
  WHERE m.id = v_mov.id;

  RETURN QUERY
  SELECT v_mov.id, 'aprovado'::text, v_saldo_depois;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_movimentacao(
  p_movimentacao_id uuid,
  p_motivo_cancelamento text DEFAULT NULL
)
RETURNS TABLE (
  movimentacao_id uuid,
  status_movimentacao text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mov record;
  v_is_manager boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_CANCELAMENTO_AUTH';
  END IF;

  SELECT m.*
  INTO v_mov
  FROM public.movimentacoes_caixa m
  WHERE m.id = p_movimentacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOV_CAIXA_CANCELAMENTO_NAO_ENCONTRADA';
  END IF;

  IF v_mov.status <> 'pendente' THEN
    RAISE EXCEPTION 'MOV_CAIXA_CANCELAMENTO_STATUS_INVALIDO';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.caixas c
    INNER JOIN public.usuarios u ON u.id = v_uid
    WHERE c.id = v_mov.caixa_id
      AND c.loja_id = u.loja_id
      AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) INTO v_is_manager;

  IF NOT (v_mov.operador_id = v_uid OR v_is_manager) THEN
    RAISE EXCEPTION 'MOV_CAIXA_CANCELAMENTO_SEM_PERMISSAO';
  END IF;

  UPDATE public.movimentacoes_caixa m
  SET
    status = 'cancelado',
    motivo = CASE
      WHEN p_motivo_cancelamento IS NULL OR btrim(p_motivo_cancelamento) = '' THEN m.motivo
      ELSE m.motivo || E'\n[CANCELADO] ' || btrim(p_motivo_cancelamento)
    END,
    updated_at = now()
  WHERE m.id = v_mov.id;

  RETURN QUERY
  SELECT v_mov.id, 'cancelado'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.estornar_movimentacao(
  p_movimentacao_origem_id uuid,
  p_motivo text,
  p_idempotency_key text DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_operador_id uuid DEFAULT NULL
)
RETURNS TABLE (
  movimentacao_id uuid,
  status_movimentacao text,
  saldo_atual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_origem record;
  v_key text := COALESCE(NULLIF(btrim(p_idempotency_key), ''), 'estorno:' || p_movimentacao_origem_id::text);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_AUTH';
  END IF;

  SELECT m.*
  INTO v_origem
  FROM public.movimentacoes_caixa m
  WHERE m.id = p_movimentacao_origem_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_NAO_ENCONTRADA';
  END IF;

  IF v_origem.status <> 'aprovado' THEN
    RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_ORIGEM_NAO_APROVADA';
  END IF;

  IF v_origem.tipo = 'estorno' THEN
    RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_DE_ESTORNO_NAO_PERMITIDO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.caixas c
    INNER JOIN public.usuarios u ON u.id = v_uid
    WHERE c.id = v_origem.caixa_id
      AND c.loja_id = u.loja_id
      AND (
        v_origem.operador_id = v_uid
        OR c.operador_id = v_uid
        OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      )
  ) THEN
    RAISE EXCEPTION 'MOV_CAIXA_ESTORNO_SEM_PERMISSAO';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.registrar_movimentacao(
    p_caixa_id => v_origem.caixa_id,
    p_tipo => 'estorno',
    p_forma_pagamento => v_origem.forma_pagamento,
    p_valor => v_origem.valor,
    p_motivo => p_motivo,
    p_motivo_codigo => 'ESTORNO',
    p_status => 'aprovado',
    p_movimentacao_origem_id => v_origem.id,
    p_idempotency_key => v_key,
    p_ip_address => p_ip_address,
    p_user_agent => p_user_agent,
    p_device_id => p_device_id,
    p_terminal_id => p_terminal_id,
    p_operador_id => v_uid,
    p_gerente_id => NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_saldo_caixa(
  p_caixa_id uuid
)
RETURNS TABLE (
  caixa_id uuid,
  saldo_anterior numeric,
  saldo_recalculado numeric,
  divergencia numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caixa record;
  v_total_mov numeric(10,2) := 0;
  v_recalculado numeric(10,2) := 0;
BEGIN
  SELECT c.id, c.valor_inicial, c.saldo_atual
  INTO v_caixa
  FROM public.caixas c
  WHERE c.id = p_caixa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MOV_CAIXA_RECALC_CAIXA_NAO_ENCONTRADO';
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN m.status <> 'aprovado' THEN 0
      WHEN m.tipo = 'suprimento' AND m.forma_pagamento = 'dinheiro' THEN m.valor
      WHEN m.tipo = 'sangria' THEN -m.valor
      WHEN m.tipo = 'estorno' THEN
        CASE
          WHEN o.tipo = 'sangria' THEN m.valor
          WHEN o.tipo = 'suprimento' AND o.forma_pagamento = 'dinheiro' THEN -m.valor
          ELSE 0
        END
      ELSE 0
    END
  ), 0)::numeric(10,2)
  INTO v_total_mov
  FROM public.movimentacoes_caixa m
  LEFT JOIN public.movimentacoes_caixa o ON o.id = m.movimentacao_origem_id
  WHERE m.caixa_id = p_caixa_id
    AND m.deleted_at IS NULL;

  v_recalculado := ROUND(COALESCE(v_caixa.valor_inicial, 0) + v_total_mov, 2);

  UPDATE public.caixas
  SET saldo_atual = v_recalculado
  WHERE id = p_caixa_id;

  RETURN QUERY
  SELECT
    v_caixa.id,
    ROUND(COALESCE(v_caixa.saldo_atual, 0), 2),
    v_recalculado,
    ROUND(v_recalculado - COALESCE(v_caixa.saldo_atual, 0), 2);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimentacao(
  uuid, text, text, numeric, text, text, text, uuid, text, inet, text, text, text, uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao(
  uuid, text, text, numeric, text, text, text, uuid, text, inet, text, text, text, uuid, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao(
  uuid, text, text, numeric, text, text, text, uuid, text, inet, text, text, text, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_movimentacao(
  uuid, inet, text, text, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.cancelar_movimentacao(
  uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_movimentacao(
  uuid, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_movimentacao(
  uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.estornar_movimentacao(
  uuid, text, text, inet, text, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estornar_movimentacao(
  uuid, text, text, inet, text, text, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_movimentacao(
  uuid, text, text, inet, text, text, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.recalcular_saldo_caixa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalcular_saldo_caixa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_saldo_caixa(uuid) TO service_role;

COMMENT ON TABLE public.movimentacoes_caixa IS
  'Movimentações transacionais de caixa (suprimento/sangria/estorno) com idempotência, status e auditoria.';
