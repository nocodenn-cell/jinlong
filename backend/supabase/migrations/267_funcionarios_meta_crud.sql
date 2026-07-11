-- Migration 246: Funcionários Management System
-- Criado em: 11 de julho de 2026
-- Propósito: Implementar cadastro de funcionários/operadores com integração a comissões, auditoria e relatórios

-- ============================================================================
-- FASE 1: SCHEMA
-- ============================================================================

-- Criar tabela funcionarios_meta
CREATE TABLE IF NOT EXISTS public.funcionarios_meta (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id            uuid NOT NULL UNIQUE REFERENCES public.usuarios(id) ON DELETE CASCADE,
  loja_id               uuid NOT NULL REFERENCES public.lojas(id),

  -- Identificação
  nome_exibicao         text NOT NULL,
  email                 text NOT NULL,
  cargo                 text NOT NULL CHECK (cargo IN ('operador', 'gerente', 'supervisor', 'outro')),

  -- Comissão (override de produto + default global)
  comissao_percentual   numeric(5, 2) CHECK (comissao_percentual >= 0 AND comissao_percentual <= 100),
  comissao_tipo         text CHECK (comissao_tipo IN ('percentual', 'fixo') OR comissao_tipo IS NULL),
  comissao_valor        numeric(10, 4) CHECK (comissao_valor >= 0),

  -- Auditoria
  data_admissao         date NOT NULL DEFAULT CURRENT_DATE,
  criado_por            uuid NOT NULL REFERENCES public.usuarios(id),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_por        uuid REFERENCES public.usuarios(id),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  ativo                 boolean NOT NULL DEFAULT true,

  CONSTRAINT email_loja_unique UNIQUE (email, loja_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_funcionarios_meta_loja_id
  ON public.funcionarios_meta(loja_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_meta_usuario_id
  ON public.funcionarios_meta(usuario_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_meta_email_loja
  ON public.funcionarios_meta(email, loja_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_meta_ativo
  ON public.funcionarios_meta(ativo);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.funcionarios_meta ENABLE ROW LEVEL SECURITY;

-- Policy SELECT: OPERADOR vê só seus dados
DROP POLICY IF EXISTS "funcionarios_meta_select_operador" ON public.funcionarios_meta;
CREATE POLICY "funcionarios_meta_select_operador"
  ON public.funcionarios_meta FOR SELECT
  USING (usuario_id = auth.uid());

-- Policy SELECT: GERENTE/ADMIN vê funcionários da sua loja
DROP POLICY IF EXISTS "funcionarios_meta_select_gerente" ON public.funcionarios_meta;
CREATE POLICY "funcionarios_meta_select_gerente"
  ON public.funcionarios_meta FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'ADMIN')
        AND u.loja_id = funcionarios_meta.loja_id
    )
  );

-- Policy SELECT: DONO vê tudo
DROP POLICY IF EXISTS "funcionarios_meta_select_dono" ON public.funcionarios_meta;
CREATE POLICY "funcionarios_meta_select_dono"
  ON public.funcionarios_meta FOR SELECT
  USING (public.auth_usuario_eh_dono());

-- Policy INSERT: GERENTE/ADMIN cria na sua loja
DROP POLICY IF EXISTS "funcionarios_meta_insert_gerente" ON public.funcionarios_meta;
CREATE POLICY "funcionarios_meta_insert_gerente"
  ON public.funcionarios_meta FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'ADMIN')
        AND u.loja_id = funcionarios_meta.loja_id
    )
  );

-- Policy INSERT: DONO cria em qualquer loja
DROP POLICY IF EXISTS "funcionarios_meta_insert_dono" ON public.funcionarios_meta;
CREATE POLICY "funcionarios_meta_insert_dono"
  ON public.funcionarios_meta FOR INSERT
  WITH CHECK (public.auth_usuario_eh_dono());

-- Policy UPDATE: GERENTE/ADMIN atualiza na sua loja
DROP POLICY IF EXISTS "funcionarios_meta_update_gerente" ON public.funcionarios_meta;
CREATE POLICY "funcionarios_meta_update_gerente"
  ON public.funcionarios_meta FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'ADMIN')
        AND u.loja_id = funcionarios_meta.loja_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'ADMIN')
        AND u.loja_id = funcionarios_meta.loja_id
    )
  );

-- Policy UPDATE: DONO atualiza em qualquer loja
DROP POLICY IF EXISTS "funcionarios_meta_update_dono" ON public.funcionarios_meta;
CREATE POLICY "funcionarios_meta_update_dono"
  ON public.funcionarios_meta FOR UPDATE
  USING (public.auth_usuario_eh_dono())
  WITH CHECK (public.auth_usuario_eh_dono());

-- ============================================================================
-- AUDIT TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS trg_funcionarios_meta_audit_update ON public.funcionarios_meta;
DROP FUNCTION IF EXISTS fn_audit_update_funcionarios_meta();

CREATE FUNCTION fn_audit_update_funcionarios_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_por = auth.uid();
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_funcionarios_meta_audit_update
  BEFORE UPDATE ON public.funcionarios_meta
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_update_funcionarios_meta();

-- ============================================================================
-- FASE 7: RPCs (CRUD + RELATÓRIOS)
-- ============================================================================

-- RPC: Criar funcionário (recebe usuario_id já criado)
DROP FUNCTION IF EXISTS public.fn_criar_funcionario(
  uuid, uuid, text, text, text,
  numeric DEFAULT NULL, text DEFAULT NULL, numeric DEFAULT NULL
);

CREATE OR REPLACE FUNCTION public.fn_criar_funcionario(
  p_usuario_id          uuid,
  p_loja_id             uuid,
  p_nome_exibicao       text,
  p_email               text,
  p_cargo               text,
  p_comissao_percentual numeric DEFAULT NULL,
  p_comissao_tipo       text DEFAULT NULL,
  p_comissao_valor      numeric DEFAULT NULL
)
RETURNS TABLE (
  ok                  boolean,
  message             text,
  funcionario_id      uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gerente_id         uuid;
  v_funcionario_id     uuid;
BEGIN
  v_gerente_id := auth.uid();

  -- Validar: usuario_id existe em usuarios
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios WHERE id = p_usuario_id
  ) THEN
    RETURN QUERY SELECT FALSE, 'USUARIO_NAO_ENCONTRADO'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Validar: usuario_id pertence à mesma loja (multi-tenant safety)
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_usuario_id AND u.loja_id = p_loja_id
  ) THEN
    RETURN QUERY SELECT FALSE, 'USUARIO_LOJA_MISMATCH'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Validar permissão: caller é GERENTE/ADMIN/DONO da loja
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_gerente_id
      AND u.perfil IN ('GERENTE', 'ADMIN')
      AND u.loja_id = p_loja_id
  ) AND NOT public.auth_usuario_eh_dono() THEN
    RETURN QUERY SELECT FALSE, 'PERMISSAO_NEGADA'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Validar: email não usado na loja
  IF EXISTS (
    SELECT 1 FROM public.funcionarios_meta fm
    WHERE fm.email = p_email AND fm.loja_id = p_loja_id
  ) THEN
    RETURN QUERY SELECT FALSE, 'EMAIL_JA_USADO'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Validar: campos obrigatórios
  IF p_nome_exibicao IS NULL OR trim(p_nome_exibicao) = '' THEN
    RETURN QUERY SELECT FALSE, 'NOME_OBRIGATORIO'::text, NULL::uuid;
    RETURN;
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN QUERY SELECT FALSE, 'EMAIL_OBRIGATORIO'::text, NULL::uuid;
    RETURN;
  END IF;

  IF p_cargo IS NULL OR trim(p_cargo) = '' THEN
    RETURN QUERY SELECT FALSE, 'CARGO_OBRIGATORIO'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Inserir funcionarios_meta
  BEGIN
    INSERT INTO public.funcionarios_meta (
      usuario_id,
      loja_id,
      nome_exibicao,
      email,
      cargo,
      comissao_percentual,
      comissao_tipo,
      comissao_valor,
      criado_por,
      criado_em,
      ativo
    ) VALUES (
      p_usuario_id,
      p_loja_id,
      p_nome_exibicao,
      p_email,
      p_cargo,
      p_comissao_percentual,
      p_comissao_tipo,
      p_comissao_valor,
      v_gerente_id,
      now(),
      true
    )
    RETURNING id INTO v_funcionario_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, 'ERRO_AO_CRIAR_FUNCIONARIO'::text, NULL::uuid;
    RETURN;
  END;

  RETURN QUERY SELECT TRUE, 'FUNCIONARIO_CRIADO'::text, v_funcionario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_criar_funcionario(uuid, uuid, text, text, text, numeric, text, numeric)
  TO authenticated;

-- RPC: Listar funcionários (com filtros)
DROP FUNCTION IF EXISTS public.fn_listar_funcionarios_gerente(
  uuid, text DEFAULT NULL, text DEFAULT 'todos'
);

CREATE OR REPLACE FUNCTION public.fn_listar_funcionarios_gerente(
  p_loja_id uuid,
  p_termo   text DEFAULT NULL,
  p_status  text DEFAULT 'todos'
)
RETURNS TABLE (
  id                    uuid,
  usuario_id            uuid,
  nome_exibicao         text,
  email                 text,
  cargo                 text,
  comissao_percentual   numeric,
  comissao_tipo         text,
  comissao_valor        numeric,
  data_admissao         date,
  ativo                 boolean,
  criado_em             timestamptz,
  criado_por_nome       text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fm.id,
    fm.usuario_id,
    fm.nome_exibicao,
    fm.email,
    fm.cargo,
    fm.comissao_percentual,
    fm.comissao_tipo,
    fm.comissao_valor,
    fm.data_admissao,
    fm.ativo,
    fm.criado_em,
    u_criado.nome
  FROM public.funcionarios_meta fm
  LEFT JOIN public.usuarios u_criado ON u_criado.id = fm.criado_por
  WHERE fm.loja_id = p_loja_id
    AND (p_status = 'todos' OR (p_status = 'ativos' AND fm.ativo = true)
         OR (p_status = 'inativos' AND fm.ativo = false))
    AND (p_termo IS NULL OR fm.nome_exibicao ILIKE '%' || p_termo || '%'
         OR fm.email ILIKE '%' || p_termo || '%')
  ORDER BY fm.nome_exibicao ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_listar_funcionarios_gerente(uuid, text, text)
  TO authenticated;

-- RPC: Atualizar funcionário
DROP FUNCTION IF EXISTS public.fn_atualizar_funcionario(
  uuid,
  text DEFAULT NULL, text DEFAULT NULL, numeric DEFAULT NULL,
  text DEFAULT NULL, numeric DEFAULT NULL
);

CREATE OR REPLACE FUNCTION public.fn_atualizar_funcionario(
  p_funcionario_id       uuid,
  p_nome_exibicao        text DEFAULT NULL,
  p_cargo                text DEFAULT NULL,
  p_comissao_percentual  numeric DEFAULT NULL,
  p_comissao_tipo        text DEFAULT NULL,
  p_comissao_valor       numeric DEFAULT NULL
)
RETURNS TABLE (
  ok      boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gerente_id uuid;
  v_loja_id    uuid;
BEGIN
  v_gerente_id := auth.uid();

  -- Obter loja_id do funcionário
  SELECT fm.loja_id INTO v_loja_id
  FROM public.funcionarios_meta fm
  WHERE fm.id = p_funcionario_id;

  IF v_loja_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'FUNCIONARIO_NAO_ENCONTRADO'::text;
    RETURN;
  END IF;

  -- Validar permissão
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_gerente_id
      AND u.perfil IN ('GERENTE', 'ADMIN')
      AND u.loja_id = v_loja_id
  ) THEN
    RETURN QUERY SELECT FALSE, 'PERMISSAO_NEGADA'::text;
    RETURN;
  END IF;

  -- Atualizar
  UPDATE public.funcionarios_meta
  SET
    nome_exibicao = COALESCE(p_nome_exibicao, nome_exibicao),
    cargo = COALESCE(p_cargo, cargo),
    comissao_percentual = COALESCE(p_comissao_percentual, comissao_percentual),
    comissao_tipo = COALESCE(p_comissao_tipo, comissao_tipo),
    comissao_valor = COALESCE(p_comissao_valor, comissao_valor)
  WHERE id = p_funcionario_id;

  RETURN QUERY SELECT TRUE, 'FUNCIONARIO_ATUALIZADO'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_atualizar_funcionario(uuid, text, text, numeric, text, numeric)
  TO authenticated;

-- RPC: Desativar funcionário (soft delete)
DROP FUNCTION IF EXISTS public.fn_desativar_funcionario(uuid);

CREATE OR REPLACE FUNCTION public.fn_desativar_funcionario(p_funcionario_id uuid)
RETURNS TABLE (
  ok      boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gerente_id uuid;
  v_loja_id    uuid;
BEGIN
  v_gerente_id := auth.uid();

  SELECT fm.loja_id INTO v_loja_id
  FROM public.funcionarios_meta fm
  WHERE fm.id = p_funcionario_id;

  IF v_loja_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'FUNCIONARIO_NAO_ENCONTRADO'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_gerente_id
      AND u.perfil IN ('GERENTE', 'ADMIN')
      AND u.loja_id = v_loja_id
  ) THEN
    RETURN QUERY SELECT FALSE, 'PERMISSAO_NEGADA'::text;
    RETURN;
  END IF;

  UPDATE public.funcionarios_meta
  SET ativo = false
  WHERE id = p_funcionario_id;

  RETURN QUERY SELECT TRUE, 'FUNCIONARIO_DESATIVADO'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_desativar_funcionario(uuid)
  TO authenticated;

-- ============================================================================
-- FASE 5: RELATÓRIOS (Report RPCs)
-- ============================================================================

-- RPC: Total vendas por funcionário
DROP FUNCTION IF EXISTS public.total_vendas_por_funcionario(
  uuid, date DEFAULT NULL, date DEFAULT NULL
);

CREATE OR REPLACE FUNCTION public.total_vendas_por_funcionario(
  p_loja_id uuid,
  p_de      date DEFAULT NULL,
  p_ate     date DEFAULT NULL
)
RETURNS TABLE (
  funcionario_id  uuid,
  nome            text,
  total_vendas    bigint,
  valor_total     numeric,
  valor_medio     numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    fm.usuario_id,
    fm.nome_exibicao,
    COUNT(v.id) AS total_vendas,
    SUM(v.total_liquido) AS valor_total,
    AVG(v.total_liquido) AS valor_medio
  FROM public.funcionarios_meta fm
  LEFT JOIN public.usuarios u ON u.id = fm.usuario_id
  LEFT JOIN public.vendas v ON v.operador_id = u.id
  WHERE fm.loja_id = p_loja_id
    AND fm.ativo = true
    AND (p_de IS NULL OR DATE(v.created_at) >= p_de)
    AND (p_ate IS NULL OR DATE(v.created_at) <= p_ate)
    AND v.id IS NOT NULL
    AND v.status = 'CONCLUIDA'
  GROUP BY fm.usuario_id, fm.nome_exibicao
  ORDER BY valor_total DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.total_vendas_por_funcionario(uuid, date, date)
  TO authenticated;

-- RPC: Resumo comissões por funcionário
DROP FUNCTION IF EXISTS public.resumo_comissoes_por_funcionario(
  uuid, date DEFAULT NULL, date DEFAULT NULL
);

CREATE OR REPLACE FUNCTION public.resumo_comissoes_por_funcionario(
  p_loja_id uuid,
  p_de      date DEFAULT NULL,
  p_ate     date DEFAULT NULL
)
RETURNS TABLE (
  funcionario_id  uuid,
  nome            text,
  total_vendas    bigint,
  total_comissao  numeric,
  total_pago      numeric,
  total_pendente  numeric,
  cargo           text,
  data_admissao   date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    fm.usuario_id,
    fm.nome_exibicao,
    COUNT(c.id),
    SUM(c.valor_comissao),
    SUM(CASE WHEN c.status = 'pago' THEN c.valor_comissao ELSE 0 END),
    SUM(CASE WHEN c.status = 'pendente' THEN c.valor_comissao ELSE 0 END),
    fm.cargo,
    fm.data_admissao
  FROM public.funcionarios_meta fm
  LEFT JOIN public.usuarios u ON u.id = fm.usuario_id
  LEFT JOIN public.comissoes_vendedores c ON c.operador_id = u.id
  WHERE fm.loja_id = p_loja_id
    AND fm.ativo = true
    AND (p_de IS NULL OR DATE(c.created_at) >= p_de)
    AND (p_ate IS NULL OR DATE(c.created_at) <= p_ate)
    AND c.id IS NOT NULL
  GROUP BY fm.usuario_id, fm.nome_exibicao, fm.cargo, fm.data_admissao
  ORDER BY total_comissao DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.resumo_comissoes_por_funcionario(uuid, date, date)
  TO authenticated;
