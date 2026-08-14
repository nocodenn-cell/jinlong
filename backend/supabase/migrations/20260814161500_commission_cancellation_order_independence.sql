-- DB-05D: cancelamento nao pode depender da ordem acidental entre a apuracao
-- da comissao original e o proprio cancelamento.
--
-- Achado DB05-F3 (P0), falsificado empiricamente antes desta migration:
--
--   Ordem A: venda -> comissao (criada automaticamente) -> cancelamento
--     resultado: comissoes_vendedores=1 (R$4,50), comissoes_ajustes=1 (R$4,50),
--     liquido=0, com trilha de auditoria completa.
--
--   Ordem B: venda -> [apuracao original ainda nao rodou] -> cancelamento
--            -> processamento atrasado (retry manual)
--     resultado ANTES desta migration: comissoes_vendedores=0,
--     comissoes_ajustes=0 -- nao "liquido zero com trilha", e sim NADA. O fato
--     de que a venda gerou (e depois perdeu) uma comissao desaparece por
--     inteiro, permanentemente: nao ha pendencia, fila ou reconciliacao que
--     repare essa janela.
--
-- A janela e real: `internal.calcular_comissao_venda` engole qualquer erro em
-- `EXCEPTION WHEN OTHERS` (comissao e efeito colateral, nunca pode derrubar a
-- venda) e `processar_comissao_venda` retorna cedo se loja/operador nao forem
-- resolviveis. Qualquer uma dessas situacoes, seguida de cancelamento, cai
-- exatamente nesta race.
--
-- ---------------------------------------------------------------------------
-- POR QUE NAO HA CONFLITO COM O GATE 15 (FIN-298-03)
--
-- GATE 15 prova, e continua provando sem alteracao, que uma venda inserida
-- DIRETO como CANCELADA (nunca foi CONCLUIDA -- ex.: sincronizacao offline de
-- uma venda que ja nasceu cancelada) NAO gera comissao. Isso continua correto:
-- nunca houve venda concluida, nunca houve comissao a congelar.
--
-- A distincao entre os dois casos ja existe no proprio catalogo, sem precisar
-- de nenhum dado novo: `trg_vendas_cancelamento_ajusta_comissao` e
-- `AFTER UPDATE OF status ... FOR EACH ROW`. Gatilhos de UPDATE nunca disparam
-- em INSERT. E como `vendas_status_check` so permite ('CONCLUIDA','CANCELADA')
-- com a coluna NOT NULL, a condicao do gatilho
-- `OLD.status IS DISTINCT FROM 'CANCELADA'` so pode ser verdadeira quando
-- `OLD.status = 'CONCLUIDA'`. Ou seja: toda vez que esse gatilho dispara, ele
-- PROVA, pela propria natureza do disparo, que a venda estava CONCLUIDA um
-- instante antes -- independentemente de a apuracao original ja ter rodado ou
-- nao. Uma venda que nasce CANCELADA nunca aciona esse gatilho.
--
-- ---------------------------------------------------------------------------
-- DESENHO -- UMA correcao pequena, nenhuma formula nova
--
-- O corpo que ja existia dentro de `processar_comissao_venda` (resolver os
-- itens, gravar `comissoes_itens`, derivar o cabecalho da soma do snapshot --
-- tudo isso e DB-05C, intocado) migra para
-- `internal.apurar_comissao_original(venda)`, sem mudar uma linha de logica:
-- so deixa de reler `vendas.status`, porque essa checagem agora e
-- responsabilidade de quem chama.
--
-- `public.processar_comissao_venda(venda)` (a RPC publica, chamada pelos dois
-- gatilhos de apuracao original) mantem o MESMO contrato de sempre: so age se
-- `status = 'CONCLUIDA'`. GATE 15 nao muda.
--
-- `public.trg_comissao_cancelamento()` ganha UMA linha: antes de compensar,
-- garante que o fato original existe --
-- `PERFORM internal.apurar_comissao_original(NEW.id)`. Como esse gatilho so
-- dispara vindo de CONCLUIDA (provado acima), essa chamada e sempre legitima.
-- Se o fato ja existe (Ordem A), e um no-op idempotente -- `comissoes_itens`
-- ja usa `ON CONFLICT DO NOTHING` desde DB-05C e o cabecalho e sempre
-- rederivado da MESMA soma. Se o fato ainda nao existe (Ordem B), ele nasce
-- ali, e a chamada seguinte a `processar_ajuste_comissao_venda` o compensa na
-- mesma transacao do cancelamento. As duas ordens convergem para o mesmo
-- estado: comissao positiva + ajuste igual, liquido zero, com a MESMA trilha.
--
-- Um "processador atrasado" que rode depois (retry manual de
-- `processar_comissao_venda`) vira, corretamente, um no-op: o gatilho de
-- cancelamento ja fechou o fato, e o guard de status='CONCLUIDA' da RPC
-- publica bloqueia qualquer nova tentativa sobre uma venda ja cancelada --
-- exatamente como bloqueava antes desta migration.
--
-- ROLLBACK:
--   DROP FUNCTION internal.apurar_comissao_original(uuid);
--   e restaurar `public.processar_comissao_venda` e
--   `public.trg_comissao_cancelamento` de 20260814151030 / 20260814114654.

BEGIN;

-- ===========================================================================
-- 1) O fato original, extraivel independentemente do status atual da venda
-- ===========================================================================

CREATE OR REPLACE FUNCTION internal.apurar_comissao_original(p_venda_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_operador_id uuid;
  v_caixa_id uuid;
  v_loja_id uuid;
  v_comissao_id uuid;
  v_taxa_global numeric(10,4) := 0;
BEGIN
  SELECT v.operador_id, v.caixa_id INTO v_operador_id, v_caixa_id
  FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND OR v_operador_id IS NULL THEN RETURN NULL; END IF;

  -- vendas NAO tem loja_id: resolve pela loja do caixa da venda
  SELECT c.loja_id INTO v_loja_id FROM public.caixas c WHERE c.id = v_caixa_id;
  IF v_loja_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM internal.resolver_comissao_itens_venda(p_venda_id) r
    WHERE COALESCE(r.o_quantidade, 0) > 0
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.comissoes_vendedores (
    venda_id, operador_id, loja_id, valor_comissao, base_calculo, status
  ) VALUES (
    p_venda_id, v_operador_id, v_loja_id, 0, 0, 'pendente'
  )
  ON CONFLICT (venda_id, operador_id) DO UPDATE SET venda_id = EXCLUDED.venda_id
  RETURNING id INTO v_comissao_id;

  -- Congelamento por item -- mesma garantia de DB-05C: item ja congelado
  -- permanece como esta, item novo entra com os fatos do momento em que
  -- existiu.
  INSERT INTO public.comissoes_itens (
    comissao_id, venda_id, item_venda_id, produto_id, quantidade, preco_unitario,
    base_elegivel, origem_regra, regra_id, tipo_calculo, percentual_aplicado,
    valor_unitario_fixo, valor_comissao
  )
  SELECT
    v_comissao_id, p_venda_id, r.o_item_venda_id, r.o_produto_id,
    r.o_quantidade, r.o_preco_unitario,
    ROUND(r.o_quantidade * r.o_preco_unitario, 2),
    r.o_origem_regra, r.o_regra_id, r.o_tipo_calculo, r.o_percentual,
    r.o_valor_unitario_fixo,
    internal.comissao_valor_item(r.o_quantidade, r.o_preco_unitario,
      r.o_tipo_calculo, r.o_percentual, r.o_valor_unitario_fixo)
  FROM internal.resolver_comissao_itens_venda(p_venda_id) r
  WHERE COALESCE(r.o_quantidade, 0) > 0
  ON CONFLICT (comissao_id, item_venda_id) DO NOTHING;

  SELECT COALESCE(cg.valor::numeric, 0) INTO v_taxa_global
  FROM public.configuracoes_gerais cg
  WHERE cg.chave = 'comissao_padrao_percentual' LIMIT 1;

  -- Cabecalho como consequencia do snapshot -- idempotente por construcao:
  -- rederivar da MESMA soma nunca reescreve o fato historico.
  UPDATE public.comissoes_vendedores cv
  SET valor_comissao = COALESCE((
        SELECT GREATEST(0, SUM(ci.valor_comissao))
        FROM public.comissoes_itens ci WHERE ci.comissao_id = v_comissao_id), 0),
      base_calculo = COALESCE((
        SELECT SUM(ci.base_elegivel)
        FROM public.comissoes_itens ci WHERE ci.comissao_id = v_comissao_id), 0),
      percentual_aplicado = COALESCE((
        SELECT ci.percentual_aplicado FROM public.comissoes_itens ci
        WHERE ci.comissao_id = v_comissao_id
        ORDER BY ci.item_venda_id DESC LIMIT 1), v_taxa_global),
      regra_id = (
        SELECT ci.regra_id FROM public.comissoes_itens ci
        WHERE ci.comissao_id = v_comissao_id
        ORDER BY ci.item_venda_id DESC LIMIT 1)
  WHERE cv.id = v_comissao_id;

  RETURN v_comissao_id;
END;
$fn$;

COMMENT ON FUNCTION internal.apurar_comissao_original(uuid) IS
  'Extrai e congela o fato original de comissao a partir dos itens da venda, independente do status ATUAL da venda. A elegibilidade (a venda esteve CONCLUIDA em algum momento) e responsabilidade do chamador.';

REVOKE ALL ON FUNCTION internal.apurar_comissao_original(uuid) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 2) A RPC publica delega, com o MESMO guard de sempre
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.processar_comissao_venda(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text;
BEGIN
  SELECT v.status INTO v_status FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND OR v_status IS DISTINCT FROM 'CONCLUIDA' THEN RETURN; END IF;
  PERFORM internal.apurar_comissao_original(p_venda_id);
END;
$fn$;

COMMENT ON FUNCTION public.processar_comissao_venda(uuid) IS
  'Apura a comissao original de uma venda CONCLUIDA. Delega o congelamento por item para internal.apurar_comissao_original.';

-- ===========================================================================
-- 3) O cancelamento fecha o fato antes de compensar
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.trg_comissao_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status = 'CANCELADA' AND OLD.status IS DISTINCT FROM 'CANCELADA' THEN
    -- Este gatilho e AFTER UPDATE OF status: so dispara vindo de CONCLUIDA
    -- (unico outro valor permitido por vendas_status_check). Garante o fato
    -- original antes de compensar, sem depender de quando a apuracao
    -- original de fato rodou -- fecha a Ordem B (DB05-F3) sem reabrir o
    -- Gate 15 (venda que nasce CANCELADA nunca aciona este gatilho).
    PERFORM internal.apurar_comissao_original(NEW.id);
    PERFORM public.processar_ajuste_comissao_venda(NEW.id, 'CANCELAMENTO', NEW.id);
  END IF;
  RETURN NEW;
END;
$fn$;

COMMIT;
