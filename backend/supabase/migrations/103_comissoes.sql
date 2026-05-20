-- Comissão por produto e por vendedor.
--
-- Campos adicionados em produtos:
--   comissao_tipo  — 'percentual' | 'fixo' | NULL (herda global)
--   comissao_valor — valor/percentual numérico
--
-- Tabela comissoes_vendedores:
--   Uma linha por venda concluída, com o total de comissão do operador.
--
-- Trigger fn_registrar_comissao:
--   Dispara AFTER UPDATE em vendas quando status muda para 'CONCLUIDA'.
--   Prioridade: comissao_tipo/valor do produto > comissao_padrao_percentual global.
--
-- RPC resumo_comissoes_por_operador(p_loja_id, p_de, p_ate):
--   Retorna resumo agrupado por operador para exibição na página /gerente/comissoes.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Campos em produtos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS comissao_tipo  text CHECK (comissao_tipo IN ('percentual', 'fixo')),
  ADD COLUMN IF NOT EXISTS comissao_valor numeric(10, 4) CHECK (comissao_valor >= 0);

COMMENT ON COLUMN public.produtos.comissao_tipo  IS 'Tipo de comissão: percentual ou valor fixo por unidade. NULL = herda global.';
COMMENT ON COLUMN public.produtos.comissao_valor IS 'Taxa percentual (ex: 5 = 5%) ou valor fixo (ex: 2.50).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabela comissoes_vendedores
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comissoes_vendedores (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id     uuid        NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  operador_id  uuid        NOT NULL REFERENCES public.usuarios(id),
  loja_id      uuid        NOT NULL REFERENCES public.lojas(id),
  valor_comissao  numeric(14, 2) NOT NULL DEFAULT 0,
  base_calculo    numeric(14, 2) NOT NULL DEFAULT 0,
  status       text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  pago_em      timestamptz,
  pago_por     uuid        REFERENCES public.usuarios(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS comissoes_vendedores_venda_operador_unique
  ON public.comissoes_vendedores (venda_id, operador_id);

CREATE INDEX IF NOT EXISTS idx_comissoes_vendedores_loja
  ON public.comissoes_vendedores (loja_id);

CREATE INDEX IF NOT EXISTS idx_comissoes_vendedores_operador
  ON public.comissoes_vendedores (operador_id);

CREATE INDEX IF NOT EXISTS idx_comissoes_vendedores_status
  ON public.comissoes_vendedores (status);

ALTER TABLE public.comissoes_vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY comissoes_select_gerencial
  ON public.comissoes_vendedores FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE POLICY comissoes_update_gerencial
  ON public.comissoes_vendedores FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger: registra comissão ao concluir uma venda
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_registrar_comissao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_comissao  numeric(14,2) := 0;
  v_base_calculo    numeric(14,2) := 0;
  v_taxa_global     numeric(10,4) := 0;
  v_loja_id         uuid;
  v_operador_id     uuid;
  r                 record;
BEGIN
  -- Só processa transições para CONCLUIDA
  IF NEW.status <> 'CONCLUIDA' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'CONCLUIDA' THEN
    RETURN NEW;
  END IF;

  v_loja_id    := NEW.loja_id;
  v_operador_id := NEW.operador_id;

  -- Taxa global de fallback (0 se não configurada)
  SELECT COALESCE(valor::numeric, 0)
    INTO v_taxa_global
    FROM public.configuracoes_gerais
   WHERE chave = 'comissao_padrao_percentual'
   LIMIT 1;

  -- Itera sobre os itens da venda
  FOR r IN
    SELECT
      iv.quantidade,
      iv.preco_unitario,
      p.comissao_tipo,
      p.comissao_valor
    FROM public.itens_venda iv
    JOIN public.produtos p ON p.id = iv.produto_id
    WHERE iv.venda_id = NEW.id
  LOOP
    DECLARE
      v_base_item  numeric(14,2);
      v_com_item   numeric(14,2);
    BEGIN
      v_base_item := r.quantidade * r.preco_unitario;
      v_base_calculo := v_base_calculo + v_base_item;

      IF r.comissao_tipo = 'percentual' AND r.comissao_valor IS NOT NULL THEN
        v_com_item := ROUND(v_base_item * r.comissao_valor / 100.0, 2);
      ELSIF r.comissao_tipo = 'fixo' AND r.comissao_valor IS NOT NULL THEN
        v_com_item := ROUND(r.comissao_valor * r.quantidade, 2);
      ELSE
        v_com_item := ROUND(v_base_item * v_taxa_global / 100.0, 2);
      END IF;

      v_total_comissao := v_total_comissao + v_com_item;
    END;
  END LOOP;

  INSERT INTO public.comissoes_vendedores (
    venda_id, operador_id, loja_id, valor_comissao, base_calculo, status
  )
  VALUES (
    NEW.id, v_operador_id, v_loja_id,
    GREATEST(0, v_total_comissao),
    v_base_calculo,
    'pendente'
  )
  ON CONFLICT (venda_id, operador_id) DO UPDATE
    SET valor_comissao = EXCLUDED.valor_comissao,
        base_calculo   = EXCLUDED.base_calculo;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrar_comissao ON public.vendas;
CREATE TRIGGER trg_registrar_comissao
  AFTER UPDATE OF status ON public.vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_registrar_comissao();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: resumo de comissões por operador (uso na página /gerente/comissoes)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resumo_comissoes_por_operador(
  p_loja_id uuid,
  p_de      date DEFAULT NULL,
  p_ate     date DEFAULT NULL,
  p_status  text DEFAULT 'todos'
)
RETURNS TABLE (
  operador_id     uuid,
  operador_nome   text,
  total_vendas    bigint,
  total_comissao  numeric,
  total_pago      numeric,
  total_pendente  numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.operador_id,
    u.nome                                           AS operador_nome,
    COUNT(*)                                         AS total_vendas,
    SUM(c.valor_comissao)                            AS total_comissao,
    SUM(CASE WHEN c.status = 'pago'     THEN c.valor_comissao ELSE 0 END) AS total_pago,
    SUM(CASE WHEN c.status = 'pendente' THEN c.valor_comissao ELSE 0 END) AS total_pendente
  FROM public.comissoes_vendedores c
  JOIN public.usuarios u ON u.id = c.operador_id
  WHERE c.loja_id = p_loja_id
    AND (p_de  IS NULL OR c.created_at::date >= p_de)
    AND (p_ate IS NULL OR c.created_at::date <= p_ate)
    AND (p_status = 'todos' OR c.status = p_status)
  GROUP BY c.operador_id, u.nome
  ORDER BY total_pendente DESC, u.nome;
$$;

GRANT EXECUTE ON FUNCTION public.resumo_comissoes_por_operador(uuid, date, date, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: detalhe de comissões de um operador (auditoria)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.detalhe_comissoes_operador(
  p_loja_id    uuid,
  p_operador_id uuid,
  p_de          date DEFAULT NULL,
  p_ate         date DEFAULT NULL
)
RETURNS TABLE (
  comissao_id    uuid,
  venda_id       uuid,
  valor_comissao numeric,
  base_calculo   numeric,
  status         text,
  pago_em        timestamptz,
  created_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id            AS comissao_id,
    c.venda_id,
    c.valor_comissao,
    c.base_calculo,
    c.status,
    c.pago_em,
    c.created_at
  FROM public.comissoes_vendedores c
  WHERE c.loja_id    = p_loja_id
    AND c.operador_id = p_operador_id
    AND (p_de  IS NULL OR c.created_at::date >= p_de)
    AND (p_ate IS NULL OR c.created_at::date <= p_ate)
  ORDER BY c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.detalhe_comissoes_operador(uuid, uuid, date, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC: marcar comissões como pagas (bulk por operador + período)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marcar_comissoes_pagas(
  p_loja_id     uuid,
  p_operador_id uuid,
  p_ids         uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_perfil  text;
  v_count   integer;
BEGIN
  SELECT u.perfil INTO v_perfil
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'COMISSOES_MARCAR_PAGAS_PERMISSAO';
  END IF;

  UPDATE public.comissoes_vendedores
     SET status  = 'pago',
         pago_em = now(),
         pago_por = v_uid
   WHERE loja_id    = p_loja_id
     AND operador_id = p_operador_id
     AND id = ANY(p_ids)
     AND status = 'pendente';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_comissoes_pagas(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_comissoes_pagas(uuid, uuid, uuid[]) TO authenticated;
