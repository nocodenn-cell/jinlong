-- D-11 (2026-11-07): cadastro do produto é a fonte única de preço de atacado.
--
-- Decisão do dono: produtos.preco_atacado e produtos.quantidade_gatilho_atacado
-- são a fonte única de varejo, atacado e quantidade mínima. Faixas de
-- precos_atacado são PRESERVADAS (nenhuma linha removida). As que não forem
-- migradas ficam com ativo = false.
--
-- ESTA MIGRATION NÃO MOVE DADOS. Ela cria regras, auditoria e as funções de
-- plano/execução. A migração das faixas é um passo separado (ver
-- docs/planos/D11_ATACADO_FONTE_UNICA.md): depende do inventário de produção,
-- ainda não autorizado. Não aplicar em produção sem essa autorização.
--
-- Conteúdo:
--  1. Trigger de invariantes em produtos (atacado >= 1 e atacado < varejo).
--     É TRIGGER e não CHECK: dispara só em escrita nas colunas envolvidas e não
--     varre as linhas existentes (6 produtos em homologação têm gatilho = 0).
--  2. historico_atacado_produto: auditoria de preço e gatilho (padrão de
--     historico_precos_produto), com motivo via app.d11_motivo.
--  3. calcular_preco_produto: mesma assinatura e mesmas chaves de retorno.
--     Transitório: tier ativo em precos_atacado ainda vence (sem mudança de
--     preço ao aplicar). Depois da execução do plano, vale o cadastro:
--     fonte = 'produto' quando quantidade >= quantidade_gatilho_atacado.
--  4. d11_plano_migracao_faixas_atacado(): leitura, classifica cada faixa ativa.
--  5. d11_executar_migracao_faixas_atacado(motivo): só service_role, com motivo.
--  6. Seleção manual de atacado: só GERENTE/DONO, com motivo, auditada.
--
-- ROLLBACK: backend/supabase/rollback/20261107120000_d11_atacado_fonte_unica_produto.rollback.sql

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Invariantes do cadastro de atacado
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validar_cadastro_atacado_produto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.preco_atacado IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.quantidade_gatilho_atacado IS NULL OR NEW.quantidade_gatilho_atacado < 1 THEN
    RAISE EXCEPTION 'ATACADO_QUANTIDADE_MINIMA_INVALIDA: quantidade mínima do atacado deve ser >= 1 quando há preço de atacado (produto %)',
      NEW.id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.preco_varejo IS NOT NULL AND NEW.preco_atacado >= NEW.preco_varejo THEN
    RAISE EXCEPTION 'ATACADO_NAO_MENOR_QUE_VAREJO: preco_atacado (%) deve ser menor que preco_varejo (%) (produto %)',
      NEW.preco_atacado, NEW.preco_varejo, NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validar_cadastro_atacado_produto() IS
  'D-11: rejeita preco_atacado sem quantidade_gatilho_atacado >= 1 ou com preco_atacado >= preco_varejo. Dispara só em escrita nas colunas envolvidas.';

DROP TRIGGER IF EXISTS trg_d11_validar_cadastro_atacado ON public.produtos;
CREATE TRIGGER trg_d11_validar_cadastro_atacado
  BEFORE INSERT OR UPDATE OF preco_atacado, quantidade_gatilho_atacado, preco_varejo
  ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_cadastro_atacado_produto();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Auditoria de atacado do cadastro
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historico_atacado_produto (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id                 uuid        NOT NULL REFERENCES public.produtos (id) ON DELETE CASCADE,
  preco_atacado_anterior     numeric,
  preco_atacado_novo         numeric,
  quantidade_gatilho_anterior integer,
  quantidade_gatilho_novo    integer,
  motivo                     text,
  origem                     text        NOT NULL DEFAULT 'CADASTRO',
  alterado_por               uuid        REFERENCES auth.users,
  alterado_em                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.historico_atacado_produto IS
  'D-11: registro append-only de preco_atacado e quantidade_gatilho_atacado de produtos. Alimentada só pela trigger trg_d11_historico_atacado_produto.';

CREATE INDEX IF NOT EXISTS idx_historico_atacado_produto_produto
  ON public.historico_atacado_produto (produto_id, alterado_em DESC);

ALTER TABLE public.historico_atacado_produto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_atacado_produto_leitura" ON public.historico_atacado_produto;
CREATE POLICY "historico_atacado_produto_leitura"
  ON public.historico_atacado_produto FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE OR REPLACE FUNCTION public.registrar_historico_atacado_produto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motivo text := NULLIF(btrim(current_setting('app.d11_motivo', true)), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.preco_atacado IS NULL THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.historico_atacado_produto (
      produto_id, preco_atacado_anterior, preco_atacado_novo,
      quantidade_gatilho_anterior, quantidade_gatilho_novo,
      motivo, origem, alterado_por
    ) VALUES (
      NEW.id, NULL, NEW.preco_atacado,
      NULL, NEW.quantidade_gatilho_atacado,
      v_motivo, 'CADASTRO_INICIAL', auth.uid()
    );
    RETURN NEW;
  END IF;

  IF NEW.preco_atacado IS DISTINCT FROM OLD.preco_atacado
     OR NEW.quantidade_gatilho_atacado IS DISTINCT FROM OLD.quantidade_gatilho_atacado THEN
    INSERT INTO public.historico_atacado_produto (
      produto_id, preco_atacado_anterior, preco_atacado_novo,
      quantidade_gatilho_anterior, quantidade_gatilho_novo,
      motivo, origem, alterado_por
    ) VALUES (
      NEW.id, OLD.preco_atacado, NEW.preco_atacado,
      OLD.quantidade_gatilho_atacado, NEW.quantidade_gatilho_atacado,
      v_motivo,
      CASE WHEN v_motivo LIKE 'D-11 migração%' THEN 'MIGRACAO_FAIXA' ELSE 'CADASTRO' END,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_d11_historico_atacado_produto ON public.produtos;
CREATE TRIGGER trg_d11_historico_atacado_produto
  AFTER INSERT OR UPDATE OF preco_atacado, quantidade_gatilho_atacado
  ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_historico_atacado_produto();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Resolução de preço (transitória até a execução do plano)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calcular_preco_produto(
  p_produto_id uuid,
  p_quantidade integer,
  p_loja_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_prod record;
  r record;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'quantidade_invalida'
    );
  END IF;

  SELECT p.preco_varejo, p.preco_atacado, p.quantidade_gatilho_atacado
  INTO v_prod
  FROM public.produtos p
  WHERE p.id = p_produto_id AND p.ativo = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'preco', NULL,
      'tipo', 'VAREJO',
      'erro', 'produto_nao_encontrado'
    );
  END IF;

  -- Transitório (D-11): faixa ativa ainda vence, como hoje. Após
  -- d11_executar_migracao_faixas_atacado não há faixa ativa e este bloco não casa.
  SELECT pa.preco_unitario, pa.id, pa.quantidade_minima
  INTO r
  FROM public.precos_atacado pa
  WHERE pa.produto_id = p_produto_id
    AND pa.ativo = true
    AND pa.quantidade_minima <= p_quantidade
    AND (pa.loja_id IS NULL OR pa.loja_id = p_loja_id)
  ORDER BY pa.quantidade_minima DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'preco', r.preco_unitario,
      'tipo', 'ATACADO',
      'fonte', 'tier',
      'regra_id', r.id,
      'quantidade_minima', r.quantidade_minima
    );
  END IF;

  -- Fonte única D-11: cadastro do produto. Inválido (gatilho < 1 ou atacado >= varejo) é ignorado.
  IF v_prod.preco_atacado IS NOT NULL
     AND v_prod.quantidade_gatilho_atacado >= 1
     AND v_prod.preco_atacado < v_prod.preco_varejo
     AND p_quantidade >= v_prod.quantidade_gatilho_atacado THEN
    RETURN jsonb_build_object(
      'preco', v_prod.preco_atacado,
      'tipo', 'ATACADO',
      'fonte', 'produto',
      'regra_id', NULL,
      'quantidade_minima', v_prod.quantidade_gatilho_atacado
    );
  END IF;

  RETURN jsonb_build_object(
    'preco', v_prod.preco_varejo,
    'tipo', 'VAREJO',
    'fonte', 'varejo',
    'regra_id', NULL,
    'quantidade_minima', NULL
  );
END;
$function$;

COMMENT ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) IS
  'D-11: resolve preço por faixa ativa (transitório) e depois pelo cadastro do produto (preco_atacado com quantidade_gatilho_atacado); senão varejo. Retorna quantidade_minima do tier ou do cadastro aplicado.';

REVOKE ALL ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_preco_produto(uuid, integer, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Plano de migração das faixas (somente leitura)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.d11_plano_migracao_faixas_atacado()
RETURNS TABLE (
  produto_id uuid,
  precos_atacado_id uuid,
  loja_id uuid,
  quantidade_minima integer,
  preco_unitario numeric,
  decisao text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ativos AS (
    SELECT pa.*, count(*) OVER (PARTITION BY pa.produto_id) AS n_ativos
    FROM public.precos_atacado pa
    WHERE pa.ativo = true
  )
  SELECT
    a.produto_id,
    a.id,
    a.loja_id,
    a.quantidade_minima,
    a.preco_unitario,
    CASE
      WHEN a.n_ativos > 1 THEN 'NAO_MIGRADA_MULTIPLAS_FAIXAS'
      WHEN a.loja_id IS NOT NULL THEN 'NAO_MIGRADA_FAIXA_DE_LOJA'
      WHEN a.quantidade_minima IS NULL OR a.quantidade_minima < 1 THEN 'NAO_MIGRADA_INVALIDA'
      WHEN p.preco_varejo IS NULL OR a.preco_unitario >= p.preco_varejo THEN 'NAO_MIGRADA_INVALIDA'
      WHEN p.preco_atacado IS NOT NULL
           AND (p.preco_atacado IS DISTINCT FROM a.preco_unitario
                OR p.quantidade_gatilho_atacado IS DISTINCT FROM a.quantidade_minima)
        THEN 'NAO_MIGRADA_CONFLITO'
      ELSE 'MIGRAR'
    END AS decisao
  FROM ativos a
  JOIN public.produtos p ON p.id = a.produto_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Execução da migração (manual, service_role, com motivo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.d11_migracao_faixas_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id      uuid        NOT NULL,
  precos_atacado_id uuid      NOT NULL,
  loja_id         uuid,
  quantidade_minima integer,
  preco_unitario  numeric,
  decisao         text        NOT NULL,
  motivo          text        NOT NULL,
  executado_por   uuid,
  executado_em    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.d11_migracao_faixas_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.d11_executar_migracao_faixas_atacado(p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_migradas integer := 0;
  v_nao_migradas integer := 0;
BEGIN
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'D11_MOTIVO_OBRIGATORIO: informe o motivo com pelo menos 10 caracteres'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.d11_motivo', 'D-11 migração de faixas: ' || btrim(p_motivo), true);

  FOR r IN SELECT * FROM public.d11_plano_migracao_faixas_atacado() LOOP
    IF r.decisao = 'MIGRAR' THEN
      UPDATE public.produtos p
      SET preco_atacado = r.preco_unitario,
          quantidade_gatilho_atacado = r.quantidade_minima
      WHERE p.id = r.produto_id;
      v_migradas := v_migradas + 1;
    ELSE
      v_nao_migradas := v_nao_migradas + 1;
    END IF;

    UPDATE public.precos_atacado pa
    SET ativo = false
    WHERE pa.id = r.precos_atacado_id;

    INSERT INTO public.d11_migracao_faixas_log (
      produto_id, precos_atacado_id, loja_id, quantidade_minima,
      preco_unitario, decisao, motivo, executado_por
    ) VALUES (
      r.produto_id, r.precos_atacado_id, r.loja_id, r.quantidade_minima,
      r.preco_unitario, r.decisao, p_motivo, auth.uid()
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.precos_atacado WHERE ativo = true) THEN
    RAISE EXCEPTION 'D11_POS_CONDICAO: ainda há faixas ativas após a migração'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'migradas', v_migradas,
    'nao_migradas_desativadas', v_nao_migradas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.d11_plano_migracao_faixas_atacado() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.d11_plano_migracao_faixas_atacado() TO service_role;

REVOKE ALL ON FUNCTION public.d11_executar_migracao_faixas_atacado(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.d11_executar_migracao_faixas_atacado(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Seleção manual de atacado (GERENTE/DONO, com motivo, auditada)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.selecoes_manuais_atacado (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id       uuid        NOT NULL REFERENCES public.produtos (id) ON DELETE CASCADE,
  loja_id          uuid,
  quantidade       integer     NOT NULL CHECK (quantidade >= 1),
  preco_sugerido   numeric     NOT NULL,
  preco_aplicado   numeric     NOT NULL,
  motivo           text        NOT NULL CHECK (char_length(btrim(motivo)) >= 10),
  usuario_id       uuid        NOT NULL,
  perfil           text        NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.selecoes_manuais_atacado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "selecoes_manuais_atacado_leitura" ON public.selecoes_manuais_atacado;
CREATE POLICY "selecoes_manuais_atacado_leitura"
  ON public.selecoes_manuais_atacado FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

CREATE OR REPLACE FUNCTION public.d11_perfil_pode_selecao_manual_atacado(p_perfil text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_perfil IN ('GERENTE', 'DONO');
$$;

CREATE OR REPLACE FUNCTION public.registrar_selecao_manual_atacado(
  p_produto_id uuid,
  p_quantidade integer,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_prod record;
  v_calc jsonb;
  v_id uuid;
BEGIN
  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo = true;

  IF NOT FOUND OR NOT public.d11_perfil_pode_selecao_manual_atacado(v_perfil) THEN
    RAISE EXCEPTION 'SELECAO_MANUAL_PERMISSAO_NEGADA: somente GERENTE ou DONO'
      USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'SELECAO_MANUAL_MOTIVO_OBRIGATORIO: informe o motivo com pelo menos 10 caracteres'
      USING ERRCODE = '22023';
  END IF;

  IF p_quantidade IS NULL OR p_quantidade < 1 THEN
    RAISE EXCEPTION 'SELECAO_MANUAL_QUANTIDADE_INVALIDA' USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.loja_id, p.preco_atacado
  INTO v_prod
  FROM public.produtos p
  WHERE p.id = p_produto_id AND p.ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  IF v_perfil <> 'DONO' AND v_loja_usuario IS DISTINCT FROM v_prod.loja_id THEN
    RAISE EXCEPTION 'SELECAO_MANUAL_LOJA_DIVERGENTE: produto de outra loja'
      USING ERRCODE = '42501';
  END IF;

  IF v_prod.preco_atacado IS NULL THEN
    RAISE EXCEPTION 'SELECAO_MANUAL_SEM_PRECO_ATACADO: produto sem preço de atacado cadastrado'
      USING ERRCODE = '22023';
  END IF;

  v_calc := public.calcular_preco_produto(p_produto_id, p_quantidade, v_prod.loja_id);

  INSERT INTO public.selecoes_manuais_atacado (
    produto_id, loja_id, quantidade, preco_sugerido, preco_aplicado,
    motivo, usuario_id, perfil
  ) VALUES (
    p_produto_id, v_prod.loja_id, p_quantidade,
    COALESCE((v_calc->>'preco')::numeric, 0), v_prod.preco_atacado,
    btrim(p_motivo), v_uid, v_perfil
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'preco_aplicado', v_prod.preco_atacado,
    'preco_sugerido', v_calc->>'preco',
    'tipo_sugerido', v_calc->>'tipo'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.d11_perfil_pode_selecao_manual_atacado(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_selecao_manual_atacado(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_selecao_manual_atacado(uuid, integer, text) TO authenticated, service_role;

COMMIT;
