-- DB-05E: ledger imutavel e auditoria completa.
--
-- Achados confirmados empiricamente antes desta migration (script de
-- validacao reversivel, BEGIN/ROLLBACK):
--
--   1a. `DELETE FROM comissoes_vendedores` com ajustes existentes (sem
--       `comissoes_itens` -- simula uma comissao anterior a DB-05C, sem
--       snapshot por item) apaga o ledger inteiro via
--       `comissoes_ajustes_comissao_id_fkey ON DELETE CASCADE`. Confirmado:
--       1 ajuste -> 0 ajustes depois do DELETE.
--   1b. O mesmo FK em `comissoes_ajustes.venda_id` tambem e CASCADE. Hoje ele
--       fica encoberto por outras restricoes NAO relacionadas a comissao
--       (`movimentos_estoque_log`, `devolucoes`, `itens_venda` sao RESTRICT),
--       entao `DELETE FROM vendas` para uma venda tipica ja e bloqueado antes
--       de chegar no CASCADE de comissao. Isso NAO torna o CASCADE correto --
--       so significa que o mecanismo comprovado em 1a ainda nao tinha sido
--       exercitado por esse caminho especifico.
--   2.  `UPDATE public.comissoes_ajustes SET valor = ...` numa linha
--       existente foi ACEITO sem nenhum erro: nao ha protecao estrutural
--       contra reescrever o ledger, so os GRANTs (que ja bloqueavam
--       `authenticated`/`anon`, mas nao um bug em codigo futuro rodando como
--       owner/postgres/service_role).
--   3.  Uma operacao pos-venda com `tipo = 'TROCA'` gera um ajuste com
--       `tipo = 'DEVOLUCAO'` -- `trg_comissao_pos_venda` (DB-05B) ignora
--       `venda_pos_venda_operacoes.tipo` e passa a constante 'DEVOLUCAO'
--       para todo mundo.
--
-- ---------------------------------------------------------------------------
-- O QUE NAO PRECISOU DE CORRECAO (falsificado ou ja coberto)
--
--   * "falta vinculo com compensacao/pagamento": ja existe desde DB-05A --
--     `comissoes_pagamentos_ajustes(pagamento_id, ajuste_id, valor_consumido)`
--     amarra cada ajuste ao(s) pagamento(s) que o consumiram, com FK RESTRICT
--     dos dois lados. O gap real era so a FALTA DE VISIBILIDADE (nenhuma view
--     juntava isso de forma legivel) -- ver secao 3 abaixo.
--   * "falta decomposicao por item": ja reconstruivel via
--     `comissoes_ajustes.origem_id -> venda_pos_venda_itens.operacao_id`, que
--     por sua vez cruza com `comissoes_itens.item_venda_id` (o snapshot
--     historico de DB-05C). Nenhuma tabela nova precisa duplicar isso.
--   * "falta ator responsavel": o ator de CANCELAMENTO ja esta em
--     `vendas_canceladas_auditoria.operador_id` (por venda_id) e o de
--     DEVOLUCAO/TROCA em `venda_pos_venda_operacoes.operador_id` (por
--     origem_id). Adicionar uma coluna `ator_id` em `comissoes_ajustes`
--     duplicaria um fato que ja tem dono -- exatamente o que a tarefa pede
--     para NAO fazer. A secao 3 expõe o ator via JOIN, sem nova coluna.
--
-- ---------------------------------------------------------------------------
-- DESENHO
--
-- 1) FKs de CASCADE -> RESTRICT em comissoes_ajustes (comissao_id, venda_id)
--    e em comissoes_vendedores (venda_id, contrato pre-DB-05 de 103_comissoes
--    e 214_restaura_comissoes_loja_via_caixa -- mesma invariante "fato
--    original nunca e apagado" que DB-05C ja aplica a comissoes_itens).
--
-- 2) Gatilho BEFORE UPDATE OR DELETE / BEFORE TRUNCATE em comissoes_ajustes
--    que rejeita QUALQUER mutacao, sem excecao. Grants ja bloqueavam
--    `authenticated`/`anon`; o gatilho fecha a lacuna para qualquer role,
--    inclusive erro de codigo futuro rodando como owner.
--
-- 3) Duas views de reconstrucao, security_invoker, reusando o que ja existe
--    (nenhuma formula nova, nenhum dado duplicado):
--      `comissoes_ajustes_auditoria` -- por ajuste: tipo real, origem
--        canonica, ATOR resolvido por JOIN (sem coluna nova), quanto ja foi
--        consumido por pagamentos e quanto ainda resta.
--      `comissoes_reconstrucao_auditoria` -- por comissao: valor original,
--        valor ajustado, valor compensado, valor pago, saldo final -- monta
--        em cima de `comissoes_vendedores_liquidas` (DB-05A), sem reescrever
--        a matematica que ja existe la.
--
-- 4) `trg_comissao_pos_venda` passa a usar `NEW.tipo` (o tipo real da
--    operacao pos-venda) em vez da constante 'DEVOLUCAO'. `tipo` ganha
--    'TROCA' no CHECK de comissoes_ajustes e na validacao de
--    processar_ajuste_comissao_venda.
--
-- 5) ACL de SECURITY DEFINER: `trg_comissao_cancelamento` (DB-05D) e
--    `trg_comissao_apos_itens` (pre-DB-05, FIN-298-03) nunca tiveram REVOKE
--    -- funcoes RETURNS trigger sem nenhum caller legitimo direto, com ACL
--    padrao (PUBLIC tem EXECUTE). `fn_registrar_comissao` (pre-DB-05) tinha
--    GRANT EXPLICITO para authenticated e service_role, tambem sem caller
--    legitimo (e chamada apenas pelo mecanismo de trigger, que nao verifica
--    EXECUTE). Os tres so tem REVOKE aqui; nenhum corpo de funcao muda.
--
-- ---------------------------------------------------------------------------
-- REGRAS PRESERVADAS
--
-- Nenhum DELETE em qualquer caminho de correcao. Nenhuma tabela nova
-- duplicando um fato que ja existe em outro lugar. Nenhuma formula nova --
-- as views de reconstrucao so juntam fatos ja gravados por A/B/C/D.
--
-- ROLLBACK:
--   DROP VIEW public.comissoes_reconstrucao_auditoria;
--   DROP VIEW public.comissoes_ajustes_auditoria;
--   DROP TRIGGER trg_comissoes_ajustes_bloqueia_truncate ON public.comissoes_ajustes;
--   DROP TRIGGER trg_comissoes_ajustes_bloqueia_mutacao ON public.comissoes_ajustes;
--   DROP FUNCTION public.trg_comissoes_ajustes_bloquear_mutacao();
--   restaurar trg_comissao_pos_venda de 20260814142814 (constante 'DEVOLUCAO');
--   restaurar processar_ajuste_comissao_venda / CHECK de tipo de 20260814114654;
--   restaurar os FKs CASCADE de 103_comissoes.sql / 214 / 20260814114654;
--   restaurar ACL padrao de fn_registrar_comissao / trg_comissao_apos_itens /
--   trg_comissao_cancelamento (GRANT EXECUTE de volta).

BEGIN;

-- ===========================================================================
-- 1) CASCADE -> RESTRICT: fato original e ledger nunca somem por arrasto
-- ===========================================================================

ALTER TABLE public.comissoes_ajustes
  DROP CONSTRAINT comissoes_ajustes_comissao_id_fkey,
  ADD CONSTRAINT comissoes_ajustes_comissao_id_fkey
    FOREIGN KEY (comissao_id) REFERENCES public.comissoes_vendedores(id) ON DELETE RESTRICT;

ALTER TABLE public.comissoes_ajustes
  DROP CONSTRAINT comissoes_ajustes_venda_id_fkey,
  ADD CONSTRAINT comissoes_ajustes_venda_id_fkey
    FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE RESTRICT;

ALTER TABLE public.comissoes_vendedores
  DROP CONSTRAINT comissoes_vendedores_venda_id_fkey,
  ADD CONSTRAINT comissoes_vendedores_venda_id_fkey
    FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE RESTRICT;

-- ===========================================================================
-- 2) Ledger append-only: nenhuma role muda ou apaga um ajuste ja gravado
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.trg_comissoes_ajustes_bloquear_mutacao()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'COMISSOES_AJUSTES_IMUTAVEL'
    USING DETAIL = format(
      '%s bloqueado em public.comissoes_ajustes: o ledger de ajustes de comissao e append-only.',
      TG_OP),
    HINT = 'Registre um novo ajuste (via processar_ajuste_comissao_venda) em vez de alterar ou remover um existente.';
END;
$fn$;

COMMENT ON FUNCTION public.trg_comissoes_ajustes_bloquear_mutacao() IS
  'Rejeita incondicionalmente UPDATE, DELETE e TRUNCATE em comissoes_ajustes. O ledger e append-only por contrato, nao apenas por convencao de GRANT.';

REVOKE ALL ON FUNCTION public.trg_comissoes_ajustes_bloquear_mutacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_comissoes_ajustes_bloqueia_mutacao ON public.comissoes_ajustes;
CREATE TRIGGER trg_comissoes_ajustes_bloqueia_mutacao
  BEFORE UPDATE OR DELETE ON public.comissoes_ajustes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_comissoes_ajustes_bloquear_mutacao();

DROP TRIGGER IF EXISTS trg_comissoes_ajustes_bloqueia_truncate ON public.comissoes_ajustes;
CREATE TRIGGER trg_comissoes_ajustes_bloqueia_truncate
  BEFORE TRUNCATE ON public.comissoes_ajustes
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_comissoes_ajustes_bloquear_mutacao();

-- ===========================================================================
-- 3) Tipo real da operacao pos-venda: TROCA deixa de virar DEVOLUCAO
-- ===========================================================================

ALTER TABLE public.comissoes_ajustes
  DROP CONSTRAINT comissoes_ajustes_tipo_check,
  ADD CONSTRAINT comissoes_ajustes_tipo_check
    CHECK (tipo IN ('CANCELAMENTO', 'DEVOLUCAO', 'TROCA'));

CREATE OR REPLACE FUNCTION public.processar_ajuste_comissao_venda(
  p_venda_id uuid,
  p_tipo text,
  p_origem_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_com public.comissoes_vendedores%ROWTYPE;
  v_efetivo record;
  v_alvo numeric(14,2);
  v_ja numeric(14,2);
  v_delta numeric(14,2);
  v_key text;
BEGIN
  IF p_tipo NOT IN ('CANCELAMENTO', 'DEVOLUCAO', 'TROCA') THEN
    RAISE EXCEPTION 'COMISSAO_AJUSTE_TIPO_INVALIDO';
  END IF;

  -- Sem comissao apurada nao ha o que compensar.
  SELECT * INTO v_com FROM public.comissoes_vendedores cv
  WHERE cv.venda_id = p_venda_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_key := p_tipo || ':' || COALESCE(p_origem_id, p_venda_id)::text;

  -- Retry do mesmo fato logico: nada a fazer.
  IF EXISTS (SELECT 1 FROM public.comissoes_ajustes a WHERE a.idempotency_key = v_key) THEN
    RETURN;
  END IF;

  SELECT * INTO v_efetivo FROM internal.calcular_comissao_venda(p_venda_id, true);

  v_alvo := GREATEST(0, v_com.valor_comissao - COALESCE(v_efetivo.o_valor, 0));
  SELECT COALESCE(SUM(a.valor), 0) INTO v_ja
  FROM public.comissoes_ajustes a WHERE a.comissao_id = v_com.id;
  v_delta := public.round_abnt(v_alvo - v_ja, 2);

  IF v_delta <= 0 THEN RETURN; END IF;

  INSERT INTO public.comissoes_ajustes (
    comissao_id, venda_id, operador_id, loja_id, tipo, valor, origem_id, idempotency_key
  ) VALUES (
    v_com.id, p_venda_id, v_com.operador_id, v_com.loja_id, p_tipo, v_delta, p_origem_id, v_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$fn$;

COMMENT ON FUNCTION public.processar_ajuste_comissao_venda(uuid, text, uuid) IS
  'Compensacao incremental da comissao apos cancelamento, devolucao ou troca. Idempotente pela chave do fato de origem.';

CREATE OR REPLACE FUNCTION public.trg_comissao_pos_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Deferido ate o commit: `venda_pos_venda_itens` da operacao ja esta
  -- completo. NEW.tipo e o tipo real ('DEVOLUCAO' ou 'TROCA') gravado pela
  -- RPC oficial -- antes desta migration, todo evento virava 'DEVOLUCAO' no
  -- ledger, mesmo quando a operacao original era uma troca.
  PERFORM public.processar_ajuste_comissao_venda(NEW.venda_id, NEW.tipo, NEW.id);
  RETURN NULL;
END;
$fn$;

-- ===========================================================================
-- 4) Reconstrucao: ator, origem e consumo por ajuste (sem coluna nova)
-- ===========================================================================

CREATE VIEW public.comissoes_ajustes_auditoria
WITH (security_invoker = true) AS
SELECT
  a.id AS ajuste_id,
  a.comissao_id,
  a.venda_id,
  a.operador_id AS beneficiario_id,
  a.loja_id,
  a.tipo,
  a.valor,
  a.origem_id,
  CASE a.tipo WHEN 'CANCELAMENTO' THEN 'VENDA' ELSE 'OPERACAO_POS_VENDA' END AS origem_tipo,
  COALESCE(vca.operador_id, vpo.operador_id) AS ator_id,
  COALESCE(vca.created_at, vpo.created_at) AS origem_ocorrida_em,
  vpo.venda_substituta_id,
  a.idempotency_key,
  a.created_at,
  COALESCE(consumo.total_consumido, 0)::numeric(14,2) AS valor_consumido,
  (a.valor - COALESCE(consumo.total_consumido, 0))::numeric(14,2) AS valor_pendente
FROM public.comissoes_ajustes a
LEFT JOIN public.vendas_canceladas_auditoria vca
  ON a.tipo = 'CANCELAMENTO' AND vca.venda_id = a.venda_id
LEFT JOIN public.venda_pos_venda_operacoes vpo
  ON a.tipo IN ('DEVOLUCAO', 'TROCA') AND vpo.id = a.origem_id
LEFT JOIN LATERAL (
  SELECT SUM(pa.valor_consumido) AS total_consumido
  FROM public.comissoes_pagamentos_ajustes pa
  WHERE pa.ajuste_id = a.id
) consumo ON true;

COMMENT ON VIEW public.comissoes_ajustes_auditoria IS
  'Reconstrucao por ajuste: tipo real, origem canonica (venda para CANCELAMENTO, operacao pos-venda para DEVOLUCAO/TROCA), ator resolvido por JOIN a partir de vendas_canceladas_auditoria/venda_pos_venda_operacoes (sem duplicar a coluna) e quanto ja foi consumido por pagamentos.';

-- ===========================================================================
-- 5) Reconstrucao: original, ajustado, compensado, pago, saldo -- por comissao
-- ===========================================================================

CREATE VIEW public.comissoes_reconstrucao_auditoria
WITH (security_invoker = true) AS
SELECT
  cvl.id AS comissao_id,
  cvl.venda_id,
  cvl.operador_id,
  cvl.loja_id,
  cvl.status,
  cvl.valor_comissao AS valor_original,
  cvl.total_ajustes AS valor_ajustado,
  COALESCE(consumo.total_consumido, 0)::numeric(14,2) AS valor_compensado,
  cvl.valor_liquido AS valor_liquido_apurado,
  cvl.pagamento_id,
  pg.valor_bruto AS pagamento_valor_bruto,
  pg.valor_compensado AS pagamento_valor_compensado,
  pg.valor_liquido AS valor_pago,
  pg.pago_em,
  pg.pago_por,
  CASE WHEN cvl.status = 'pago' THEN cvl.saldo_a_compensar ELSE cvl.valor_liquido END AS saldo_final
FROM public.comissoes_vendedores_liquidas cvl
LEFT JOIN LATERAL (
  SELECT SUM(pa.valor_consumido) AS total_consumido
  FROM public.comissoes_ajustes a
  JOIN public.comissoes_pagamentos_ajustes pa ON pa.ajuste_id = a.id
  WHERE a.comissao_id = cvl.id
) consumo ON true
LEFT JOIN public.comissoes_pagamentos pg ON pg.id = cvl.pagamento_id;

COMMENT ON VIEW public.comissoes_reconstrucao_auditoria IS
  'Reconstrucao economica completa por comissao: valor original (comissoes_vendedores), valor ajustado e liquido apurado (comissoes_vendedores_liquidas, DB-05A), valor compensado (soma dos consumos em comissoes_pagamentos_ajustes) e valor pago/saldo final (comissoes_pagamentos). Nenhuma formula nova: reusa integralmente o que A/C ja calculam.';

-- ===========================================================================
-- 6) ACL: SECURITY DEFINER sem caller legitimo perde EXECUTE de PUBLIC
-- ===========================================================================

REVOKE ALL ON FUNCTION public.trg_comissao_cancelamento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_comissao_apos_itens() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_registrar_comissao() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
