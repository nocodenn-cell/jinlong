-- 127_kardex_vendas_imutavel.sql
-- Fecha 3 lacunas do fluxo de gestão ponta a ponta:
--
--  1. KARDEX REAL DE VENDAS
--     Antes: a baixa de venda só gravava em `estoque_baixas` (ledger de idempotência
--     SEM quantidade) e o kardex de venda era *reconstruído* na view v_kardex_unificado.
--     Agora: `decrementar_estoque_seguro` grava uma linha física e imutável em
--     `movimentos_estoque_log` (tipo_codigo='SAIDA_VENDA'), com a quantidade exata
--     (delta negativo) e o `venda_id` vinculado — auditoria limpa na origem.
--
--  2. ENGINE SEM GIRO
--     Nova RPC `relatorio_produtos_sem_giro_periodo` para identificar capital parado:
--     produtos com saldo positivo na loja que NÃO tiveram saída por venda no período.
--
--  Consequência tratada: a view v_kardex_unificado deixa de duplicar a saída de venda.
--  A partir desta migration a saída vem da linha física do log; o ramo legado de
--  `estoque_baixas` é mantido APENAS para vendas anteriores a esta migration (anti-join),
--  preservando histórico sem dupla contagem.

-- ---------------------------------------------------------------------------
-- 1. Tipo de movimento de saída por venda (FK exigida por movimentos_estoque_log)
-- ---------------------------------------------------------------------------
INSERT INTO public.tipos_movimento_estoque (
  codigo, rotulo, exige_gerente, permite_entrada, permite_saida
)
VALUES
  ('SAIDA_VENDA', 'Saída por venda (PDV)', false, false, true)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Vínculo da venda no log + guarda de idempotência
-- ---------------------------------------------------------------------------
ALTER TABLE public.movimentos_estoque_log
  ADD COLUMN IF NOT EXISTS venda_id uuid REFERENCES public.vendas(id);

CREATE INDEX IF NOT EXISTS idx_mov_estoque_venda
  ON public.movimentos_estoque_log (venda_id)
  WHERE venda_id IS NOT NULL;

-- Garante no máximo UMA linha de saída por venda por produto (idempotência forte,
-- alinhada à idempotência de `estoque_baixas` por (venda_id, produto_id)).
CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_estoque_saida_venda
  ON public.movimentos_estoque_log (venda_id, produto_id)
  WHERE venda_id IS NOT NULL AND tipo_codigo = 'SAIDA_VENDA';

-- ---------------------------------------------------------------------------
-- 3. decrementar_estoque_seguro: decremento atômico + log físico de SAIDA_VENDA
--    (mantém a semântica/segurança da migration 038; adiciona o registro de kardex)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decrementar_estoque_seguro(
  p_produto_id UUID,
  p_quantidade NUMERIC,
  p_venda_id UUID
)
RETURNS TABLE(
  sucesso BOOLEAN,
  mensagem TEXT,
  estoque_atual NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quantidade_atual NUMERIC;
  v_version INTEGER;
  v_baixa_existente BOOLEAN;
  v_loja_id uuid;
  v_operador_id uuid;
BEGIN
  -- Loja e operador a partir da venda/caixa (a venda já existe neste ponto do fluxo v2).
  SELECT c.loja_id, v.operador_id
    INTO v_loja_id, v_operador_id
  FROM public.vendas v
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE v.id = p_venda_id
  LIMIT 1;

  IF v_loja_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'VENDA_CAIXA_INVALIDA'::TEXT, NULL::NUMERIC;
    RETURN;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = p_venda_id
        AND v.operador_id = auth.uid()
    ) THEN
      RETURN QUERY SELECT FALSE, 'VENDA_NAO_AUTORIZADA'::TEXT, NULL::NUMERIC;
      RETURN;
    END IF;
  END IF;

  -- Idempotência: nada a fazer se a baixa desta (venda, produto) já ocorreu.
  SELECT EXISTS (
    SELECT 1
    FROM public.estoque_baixas eb
    WHERE eb.venda_id = p_venda_id
      AND eb.produto_id = p_produto_id
  ) INTO v_baixa_existente;

  IF v_baixa_existente THEN
    SELECT e.quantidade_atual INTO v_quantidade_atual
    FROM public.estoque e
    WHERE e.produto_id = p_produto_id
      AND e.loja_id = v_loja_id;

    RETURN QUERY SELECT TRUE, 'BAIXA_JA_EXISTE'::TEXT, v_quantidade_atual;
    RETURN;
  END IF;

  -- Lock de linha (lock otimista por version) para evitar race condition.
  SELECT e.quantidade_atual, e.version
  INTO v_quantidade_atual, v_version
  FROM public.estoque e
  WHERE e.produto_id = p_produto_id
    AND e.loja_id = v_loja_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'PRODUTO_NAO_ENCONTRADO_NO_ESTOQUE'::TEXT, NULL::NUMERIC;
    RETURN;
  END IF;

  IF v_quantidade_atual < p_quantidade THEN
    RETURN QUERY SELECT FALSE, 'ESTOQUE_INSUFICIENTE'::TEXT, v_quantidade_atual;
    RETURN;
  END IF;

  UPDATE public.estoque e
  SET
    quantidade_atual = e.quantidade_atual - p_quantidade,
    version = e.version + 1,
    updated_at = NOW()
  WHERE e.produto_id = p_produto_id
    AND e.loja_id = v_loja_id
    AND e.version = v_version;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'CONCORRENCIA_DETECTADA'::TEXT, NULL::NUMERIC;
    RETURN;
  END IF;

  -- Ledger de idempotência (mantido).
  INSERT INTO public.estoque_baixas (venda_id, produto_id)
  VALUES (p_venda_id, p_produto_id)
  ON CONFLICT (venda_id, produto_id) DO NOTHING;

  -- Kardex físico e imutável da saída de venda. Delta negativo = saída.
  -- usuario_id é NOT NULL: usa o operador da venda; cai para auth.uid() se necessário.
  INSERT INTO public.movimentos_estoque_log (
    loja_id, produto_id, tipo_codigo, quantidade_delta, venda_id, usuario_id, observacao
  )
  VALUES (
    v_loja_id,
    p_produto_id,
    'SAIDA_VENDA',
    (-p_quantidade)::numeric(10,3),
    p_venda_id,
    COALESCE(v_operador_id, auth.uid()),
    'Baixa automática por venda'
  )
  ON CONFLICT (venda_id, produto_id)
    WHERE venda_id IS NOT NULL AND tipo_codigo = 'SAIDA_VENDA'
  DO NOTHING;

  RETURN QUERY SELECT TRUE, 'SUCESSO'::TEXT, (v_quantidade_atual - p_quantidade);
END;
$$;

COMMENT ON FUNCTION public.decrementar_estoque_seguro(uuid, numeric, uuid) IS
  'Decrementa estoque por loja do caixa da venda (lock otimista + idempotência por '
  '(venda_id, produto_id)) e grava linha física SAIDA_VENDA em movimentos_estoque_log '
  'para kardex/auditoria limpa.';

-- ---------------------------------------------------------------------------
-- 4. v_kardex_unificado: sem dupla contagem da saída de venda
--    A saída de venda agora vem da linha física do log. O ramo de `estoque_baixas`
--    só emite para vendas SEM linha física correspondente (histórico pré-127).
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_kardex_unificado;

CREATE VIEW public.v_kardex_unificado
WITH (security_invoker = true)
AS
SELECT
  ('mel:' || m.id::text)::text AS evento_id,
  m.created_at AS ocorrido_em,
  m.loja_id,
  m.produto_id,
  m.quantidade_delta,
  'movimentos_estoque_log'::text AS origem,
  m.tipo_codigo,
  COALESCE(m.venda_id, m.id) AS referencia_id,
  m.usuario_id,
  m.observacao
FROM public.movimentos_estoque_log m

UNION ALL

-- Histórico de vendas anteriores à migration 127 (sem linha física no log).
SELECT
  ('eb:' || eb.venda_id::text || ':' || eb.produto_id::text)::text AS evento_id,
  eb.created_at AS ocorrido_em,
  c.loja_id,
  eb.produto_id,
  (-COALESCE(eb.quantidade, ivsum.qtd, 0::numeric))::numeric(10, 3) AS quantidade_delta,
  'estoque_baixas'::text AS origem,
  'SAIDA_VENDA'::text AS tipo_codigo,
  eb.venda_id AS referencia_id,
  v.operador_id AS usuario_id,
  NULL::text AS observacao
FROM public.estoque_baixas eb
INNER JOIN public.vendas v ON v.id = eb.venda_id
INNER JOIN public.caixas c ON c.id = v.caixa_id
LEFT JOIN LATERAL (
  SELECT SUM(iv.quantidade)::numeric(10, 3) AS qtd
  FROM public.itens_venda iv
  WHERE iv.venda_id = eb.venda_id
    AND iv.produto_id = eb.produto_id
) ivsum ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.movimentos_estoque_log mel
  WHERE mel.venda_id = eb.venda_id
    AND mel.produto_id = eb.produto_id
    AND mel.tipo_codigo = 'SAIDA_VENDA'
)

UNION ALL

SELECT
  ('erc:' || erc.venda_id::text || ':' || erc.produto_id::text)::text AS evento_id,
  erc.created_at AS ocorrido_em,
  c.loja_id,
  erc.produto_id,
  erc.quantidade AS quantidade_delta,
  'estoque_reposicoes_cancelamento'::text AS origem,
  'ENTRADA_CANCELAMENTO_VENDA'::text AS tipo_codigo,
  erc.venda_id AS referencia_id,
  vca.operador_id AS usuario_id,
  vca.motivo AS observacao
FROM public.estoque_reposicoes_cancelamento erc
INNER JOIN public.vendas v ON v.id = erc.venda_id
INNER JOIN public.caixas c ON c.id = v.caixa_id
LEFT JOIN public.vendas_canceladas_auditoria vca ON vca.venda_id = erc.venda_id;

COMMENT ON VIEW public.v_kardex_unificado IS
  'Kardex lógico: movimentos_estoque_log (inclui SAIDA_VENDA físico a partir da 127) + '
  'baixas de venda legadas (anti-join p/ não duplicar) + reposições por cancelamento.';

GRANT SELECT ON public.v_kardex_unificado TO authenticated;
GRANT SELECT ON public.v_kardex_unificado TO service_role;

-- ---------------------------------------------------------------------------
-- 5. RPC relatorio_produtos_sem_giro_periodo: capital parado no período
--    Produtos com saldo positivo na loja que NÃO tiveram saída por venda no intervalo.
--    Gate de perfil/loja igual ao dashboard (SECURITY INVOKER + RLS das tabelas base).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.relatorio_produtos_sem_giro_periodo(
  p_loja_id uuid,
  p_data_inicio timestamptz,
  p_data_fim timestamptz
)
RETURNS TABLE (
  produto_id uuid,
  nome text,
  codigo_barras text,
  quantidade_atual numeric(10,3),
  estoque_minimo numeric(10,3),
  preco_custo numeric(10,2),
  valor_imobilizado numeric(14,2),
  ultima_venda timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF p_loja_id IS NULL THEN
    RAISE EXCEPTION 'loja_obrigatoria' USING ERRCODE = '22023';
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_inicio >= p_data_fim THEN
    RAISE EXCEPTION 'periodo_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT u.perfil, u.loja_id
    INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.codigo_barras,
    e.quantidade_atual::numeric(10,3),
    e.estoque_minimo::numeric(10,3),
    p.preco_custo,
    ROUND(e.quantidade_atual * COALESCE(p.preco_custo, 0), 2)::numeric(14,2) AS valor_imobilizado,
    uv.ultima_venda
  FROM public.estoque e
  JOIN public.produtos p ON p.id = e.produto_id
  LEFT JOIN LATERAL (
    SELECT MAX(v.data) AS ultima_venda
    FROM public.itens_venda iv
    JOIN public.vendas v ON v.id = iv.venda_id
    JOIN public.caixas c ON c.id = v.caixa_id
    WHERE iv.produto_id = e.produto_id
      AND c.loja_id = e.loja_id
      AND v.status = 'CONCLUIDA'
  ) uv ON true
  WHERE e.loja_id = p_loja_id
    AND e.quantidade_atual > 0
    AND p.ativo = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.itens_venda iv2
      JOIN public.vendas v2 ON v2.id = iv2.venda_id
      JOIN public.caixas c2 ON c2.id = v2.caixa_id
      WHERE iv2.produto_id = e.produto_id
        AND c2.loja_id = p_loja_id
        AND v2.status = 'CONCLUIDA'
        AND v2.data >= p_data_inicio
        AND v2.data < p_data_fim
    )
  ORDER BY valor_imobilizado DESC, p.nome ASC;
END;
$$;

COMMENT ON FUNCTION public.relatorio_produtos_sem_giro_periodo(uuid, timestamptz, timestamptz) IS
  'Produtos sem giro: saldo positivo na loja e sem saída por venda CONCLUIDA no intervalo '
  '[p_data_inicio, p_data_fim). Retorna capital imobilizado e data da última venda. '
  'Gate de perfil GERENTE/DONO/ADMIN; GERENTE restrito à própria loja.';

REVOKE ALL ON FUNCTION public.relatorio_produtos_sem_giro_periodo(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relatorio_produtos_sem_giro_periodo(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_produtos_sem_giro_periodo(uuid, timestamptz, timestamptz) TO service_role;
