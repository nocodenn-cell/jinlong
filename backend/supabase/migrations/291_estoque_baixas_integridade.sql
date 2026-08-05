-- ============================================================================
-- 291 — Pacote 2 / Integridade de dados: fecha DAT-01, CA-01 e FLX-01.
--
-- Pré-condições verificadas em produção antes de escrever esta migration:
--   - Zero órfãos de venda/produto em estoque_baixas (56 linhas totais).
--   - Distribuição de `quantidade`: 34 linhas = 0, 20 = 1, 2 = 2 — NÃO é 100%
--     zero como o ticket DAT-01 original (dump de 2026-08-02) afirmava.
--   - O corpo vivo de `decrementar_estoque_seguro` grava
--     `INSERT INTO estoque_baixas (venda_id, produto_id)` sem `quantidade` —
--     confirma DAT-01 como defeito ativo, independente da distribuição acima.
--
-- CORREÇÃO DE DIAGNÓSTICO (achado desta sessão, não do ticket original):
--   DAT-01 citava evidência (`remote_schema.sql:8513`) de uma view chamada
--   `v_estoque_ledger_divergencia` com `COALESCE(eb.quantidade, ivsum.qtd, 0)`.
--   Essa view **existe, mas nunca teve essa lógica** — seu corpo real (fonte:
--   `20260801090000_v_estoque_ledger_divergencia.sql`, confirmado por
--   `pg_get_viewdef` ao vivo) compara `estoque.quantidade_atual` × soma de
--   `movimentos_estoque_log`, sem referenciar `estoque_baixas`. Além disso, essa
--   view **não existe em produção** apesar de a migration constar aplicada —
--   mesma classe de drift do SEC-02 — e é restaurada aqui, sem alteração de
--   lógica, como achado independente.
--
--   O mecanismo REAL de DAT-01 (`COALESCE(eb.quantidade, ivsum.qtd, 0)`,
--   confirmado por `pg_get_viewdef` ao vivo) está em `v_kardex_unificado`,
--   no branch `estoque_baixas` (fallback para vendas sem linha em
--   `movimentos_estoque_log`). É essa view que este arquivo corrige.
-- ============================================================================

BEGIN;

-- ============================================================================
-- DAT-01 (parte 1) — decrementar_estoque_seguro passa a gravar quantidade.
-- Corpo idêntico ao vigente em produção, exceto o INSERT em estoque_baixas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrementar_estoque_seguro(
  p_produto_id uuid,
  p_quantidade numeric,
  p_venda_id uuid
)
RETURNS TABLE(sucesso boolean, mensagem text, estoque_atual numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quantidade_atual NUMERIC;
  v_version INTEGER;
  v_baixa_existente BOOLEAN;
  v_loja_id uuid;
  v_operador_id uuid;
BEGIN
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

  -- DAT-01: quantidade agora é gravada — antes só (venda_id, produto_id).
  INSERT INTO public.estoque_baixas (venda_id, produto_id, quantidade)
  VALUES (p_venda_id, p_produto_id, p_quantidade)
  ON CONFLICT (venda_id, produto_id) DO NOTHING;

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

-- ============================================================================
-- v_kardex_unificado depende de estoque_baixas.quantidade (RETURN rule) — a
-- ALTER COLUMN TYPE abaixo exige remover essa dependência antes. Zero outras
-- views dependem dela (verificado via pg_depend nesta sessão). ACL capturada
-- antes do DROP: anon=SELECT/REFERENCES/TRIGGER/MAINTAIN,
-- authenticated=ALL, service_role=ALL — reaplicada ao final, idêntica.
-- ============================================================================

DROP VIEW public.v_kardex_unificado;

-- ============================================================================
-- CA-01 — escala coerente com o resto do módulo (numeric(10,3)).
-- DAT-01 (parte 2) — DEFAULT vira NULL: uma baixa é sempre de quantidade
-- positiva por regra de negócio; `0` não é um valor de baixa válido, só
-- sobrava do INSERT omisso. Não altera linhas existentes.
-- ============================================================================

ALTER TABLE public.estoque_baixas
  ALTER COLUMN quantidade TYPE numeric(10,3),
  ALTER COLUMN quantidade DROP DEFAULT;

-- ============================================================================
-- FLX-01 — FKs para vendas e produtos. Zero órfãos confirmado nesta sessão;
-- ADD CONSTRAINT direto (tabela pequena, lock instantâneo).
-- ON DELETE RESTRICT: baixa de estoque é fato contábil, não some com a venda.
-- ============================================================================

ALTER TABLE public.estoque_baixas
  ADD CONSTRAINT estoque_baixas_venda_id_fkey
    FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE RESTRICT,
  ADD CONSTRAINT estoque_baixas_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;

-- ============================================================================
-- Recriação de v_kardex_unificado — corpo idêntico ao capturado por
-- pg_get_viewdef ao vivo, ÚNICA mudança: NULLIF(eb.quantidade, 0) no branch
-- `estoque_baixas`. É este o COALESCE que DAT-01 descreveu; a partir desta
-- migration, linhas históricas com quantidade=0 (pré-fix) caem no fallback
-- ivsum.qtd (soma real de itens_venda) em vez de mascarar o delta como zero.
-- ============================================================================

CREATE VIEW public.v_kardex_unificado
WITH (security_invoker = true) AS
SELECT
  'mel:' || m.id::text AS evento_id,
  m.created_at AS ocorrido_em,
  m.loja_id,
  m.produto_id,
  m.quantidade_delta,
  'movimentos_estoque_log' AS origem,
  m.tipo_codigo,
  COALESCE(m.venda_id, m.id) AS referencia_id,
  m.usuario_id,
  m.observacao
FROM movimentos_estoque_log m
UNION ALL
SELECT
  'eb:' || eb.venda_id::text || ':' || eb.produto_id::text AS evento_id,
  eb.created_at AS ocorrido_em,
  c.loja_id,
  eb.produto_id,
  (- COALESCE(NULLIF(eb.quantidade, 0), ivsum.qtd, 0::numeric))::numeric(10,3) AS quantidade_delta,
  'estoque_baixas' AS origem,
  'SAIDA_VENDA' AS tipo_codigo,
  eb.venda_id AS referencia_id,
  v.operador_id AS usuario_id,
  NULL::text AS observacao
FROM estoque_baixas eb
JOIN vendas v ON v.id = eb.venda_id
JOIN caixas c ON c.id = v.caixa_id
LEFT JOIN LATERAL (
  SELECT sum(iv.quantidade)::numeric(10,3) AS qtd
  FROM itens_venda iv
  WHERE iv.venda_id = eb.venda_id AND iv.produto_id = eb.produto_id
) ivsum ON true
WHERE NOT EXISTS (
  SELECT 1 FROM movimentos_estoque_log mel
  WHERE mel.venda_id = eb.venda_id AND mel.produto_id = eb.produto_id AND mel.tipo_codigo = 'SAIDA_VENDA'
)
UNION ALL
SELECT
  'erc:' || erc.venda_id::text || ':' || erc.produto_id::text AS evento_id,
  erc.created_at AS ocorrido_em,
  c.loja_id,
  erc.produto_id,
  erc.quantidade AS quantidade_delta,
  'estoque_reposicoes_cancelamento' AS origem,
  'ENTRADA_CANCELAMENTO_VENDA' AS tipo_codigo,
  erc.venda_id AS referencia_id,
  vca.operador_id AS usuario_id,
  vca.motivo AS observacao
FROM estoque_reposicoes_cancelamento erc
JOIN vendas v ON v.id = erc.venda_id
JOIN caixas c ON c.id = v.caixa_id
LEFT JOIN vendas_canceladas_auditoria vca ON vca.venda_id = erc.venda_id
UNION ALL
SELECT
  'erd:' || erd.operacao_id::text || ':' || erd.produto_id::text AS evento_id,
  erd.created_at AS ocorrido_em,
  c.loja_id,
  erd.produto_id,
  erd.quantidade AS quantidade_delta,
  'estoque_reposicoes_devolucao' AS origem,
  'ENTRADA_DEVOLUCAO_CLIENTE' AS tipo_codigo,
  o.venda_id AS referencia_id,
  o.operador_id AS usuario_id,
  o.motivo AS observacao
FROM estoque_reposicoes_devolucao erd
JOIN venda_pos_venda_operacoes o ON o.id = erd.operacao_id
JOIN caixas c ON c.id = o.caixa_id;

COMMENT ON VIEW public.v_kardex_unificado IS
  'Kardex: movimentos_estoque_log + baixas legadas + cancelamento + devolução parcial. DAT-01 (2026-08-05): NULLIF(eb.quantidade,0) no branch estoque_baixas — zero histórico não mascara mais o fallback para soma de itens_venda.';

GRANT SELECT, REFERENCES, TRIGGER, MAINTAIN ON public.v_kardex_unificado TO anon;
GRANT ALL ON public.v_kardex_unificado TO authenticated;
GRANT ALL ON public.v_kardex_unificado TO service_role;

-- ============================================================================
-- Restauração de drift — v_estoque_ledger_divergencia ausente apesar de
-- 20260801090000 constar aplicada. Corpo EXATO do arquivo-fonte, sem alteração
-- de lógica (achado independente do DAT-01 real, ver cabeçalho).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_estoque_ledger_divergencia
WITH (security_invoker = true) AS
SELECT
  e.loja_id,
  e.produto_id,
  p.nome                                        AS produto_nome,
  p.codigo_barras,
  e.quantidade_atual                            AS saldo_estoque,
  COALESCE(l.soma_delta, 0)                     AS soma_movimentos,
  e.quantidade_atual - COALESCE(l.soma_delta, 0) AS divergencia,
  COALESCE(l.qtd_movimentos, 0)                 AS qtd_movimentos,
  l.ultimo_movimento_em
FROM public.estoque e
JOIN public.produtos p
  ON p.id = e.produto_id
LEFT JOIN (
  SELECT
    produto_id,
    loja_id,
    SUM(quantidade_delta) AS soma_delta,
    COUNT(*)              AS qtd_movimentos,
    MAX(created_at)       AS ultimo_movimento_em
  FROM public.movimentos_estoque_log
  GROUP BY produto_id, loja_id
) l
  ON l.produto_id = e.produto_id
 AND l.loja_id    = e.loja_id
WHERE e.quantidade_atual <> COALESCE(l.soma_delta, 0);

COMMENT ON VIEW public.v_estoque_ledger_divergencia IS
  'Onda A — linhas de estoque cujo saldo não é explicado pela soma de movimentos_estoque_log. '
  'Ausência de movimento conta como soma zero. Vazia = ledger fecha. '
  'security_invoker: herda a RLS de estoque/produtos do usuário que consulta. '
  'Restaurada em 291 (2026-08-05): constava aplicada (20260801090000) mas ausente do banco vivo.';

GRANT SELECT ON public.v_estoque_ledger_divergencia TO authenticated;
GRANT SELECT ON public.v_estoque_ledger_divergencia TO service_role;

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO — dentro da transação.
-- ============================================================================

DO $verify$
DECLARE
  v_def text;
  v_orfaos_venda int;
  v_orfaos_produto int;
BEGIN
  v_def := pg_get_functiondef('public.decrementar_estoque_seguro(uuid,numeric,uuid)'::regprocedure);
  IF position('INSERT INTO public.estoque_baixas (venda_id, produto_id, quantidade)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG291_DAT01_INSERT_SEM_QUANTIDADE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='estoque_baixas' AND column_name='quantidade'
      AND numeric_precision=10 AND numeric_scale=3
  ) THEN
    RAISE EXCEPTION 'MIG291_CA01_ESCALA_NAO_APLICADA';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='estoque_baixas' AND column_name='quantidade'
      AND column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'MIG291_DAT01_DEFAULT_REMANESCENTE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='estoque_baixas_venda_id_fkey')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='estoque_baixas_produto_id_fkey') THEN
    RAISE EXCEPTION 'MIG291_FLX01_FK_AUSENTE';
  END IF;

  SELECT count(*) INTO v_orfaos_venda
  FROM public.estoque_baixas eb WHERE NOT EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = eb.venda_id);
  SELECT count(*) INTO v_orfaos_produto
  FROM public.estoque_baixas eb WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = eb.produto_id);
  IF v_orfaos_venda > 0 OR v_orfaos_produto > 0 THEN
    RAISE EXCEPTION 'MIG291_FLX01_ORFAOS_POS_FK';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_kardex_unificado'
  ) THEN
    RAISE EXCEPTION 'MIG291_KARDEX_VIEW_AUSENTE';
  END IF;

  v_def := pg_get_viewdef('public.v_kardex_unificado'::regclass, true);
  IF position('NULLIF(eb.quantidade' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG291_KARDEX_NULLIF_AUSENTE';
  END IF;

  IF NOT has_table_privilege('anon', 'public.v_kardex_unificado', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.v_kardex_unificado', 'SELECT') THEN
    RAISE EXCEPTION 'MIG291_KARDEX_GRANT_PERDIDO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_estoque_ledger_divergencia'
  ) THEN
    RAISE EXCEPTION 'MIG291_LEDGER_VIEW_AUSENTE';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.v_estoque_ledger_divergencia', 'SELECT') THEN
    RAISE EXCEPTION 'MIG291_LEDGER_VIEW_SEM_GRANT_AUTHENTICATED';
  END IF;

  RAISE NOTICE '291 OK — DAT-01 (na view real), CA-01, FLX-01 e drift de v_estoque_ledger_divergencia verificados no efeito';
END
$verify$;

COMMIT;
