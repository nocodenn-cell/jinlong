-- ============================================================================
-- receber_ordem_compra: recebimento passa a gerar a obrigacao financeira
-- ============================================================================
-- Achado do QA operacional: `receber_ordem_compra` creditava estoque e encerrava
-- a ordem como RECEBIDA sem criar nenhum titulo em `contas_pagar`. Mercadoria
-- entrava, a divida com o fornecedor nao existia em lugar nenhum do sistema --
-- e o financeiro nunca fechava para compras sem NF-e (caso comum do importador,
-- que recebe antes da nota).
--
-- Por que o modelo atual nao suportava: `ordens_compra` nao tinha nenhum campo
-- de prazo, e `contas_pagar.vencimento` e NOT NULL. Nao existia data de onde
-- derivar o titulo. Derivar uma (hoje, +30 dias) seria INVENTAR regra
-- financeira que o Jinlong nao tem -- descartado.
--
-- Regra implementada (a minima que o modelo comporta, sem arquitetura nova):
--   * `ordens_compra.data_vencimento` passa a existir: e o prazo acordado com o
--     fornecedor, informado na propria ordem.
--   * No recebimento, gera-se UM titulo quando -- e somente quando -- a ordem
--     tem fornecedor cadastrado E data de vencimento. Ordem com fornecedor
--     apenas em texto livre (`fornecedor_nome`) nao gera titulo, porque
--     `contas_pagar.fornecedor_id` e NOT NULL; e ordem sem prazo nao gera
--     porque nao ha vencimento a afirmar.
--   * Valor = soma de `quantidade_conferida * preco_unitario`. A mesma
--     grandeza que credita estoque credita o financeiro: o que se deve e o que
--     de fato chegou e foi conferido, nunca o que foi pedido.
--
-- Idempotencia em duas camadas, ambas no banco:
--   1. A guarda de status ja existente (`OC_STATUS_INVALIDO`) impede reexecutar
--      o recebimento de uma ordem ja RECEBIDA.
--   2. `contas_pagar.ordem_compra_id` + indice unico parcial garantem no maximo
--      UM titulo por ordem, mesmo diante de corrida ou de reprocesso futuro.
--
-- Auditoria: o proprio titulo e o registro, ligado a ordem por
-- `ordem_compra_id` (mesmo padrao de `nfe_importacao_id`). Nenhuma tabela de
-- auditoria nova -- o kardex continua sendo a trilha do estoque.
--
-- Invariantes preservadas: conferencia obrigatoria antes do credito
-- (OC_CONFERENCIA_PENDENTE), quantidade sempre vinda de `quantidade_conferida`
-- e nunca de parametro do cliente, e escopo de loja por perfil. O corpo abaixo
-- e copia verbatim de 20260805193920_295_ordem_compra_conferencia.sql, com o
-- SELECT do cabecalho ampliado e o bloco financeiro acrescentado ao final.
-- ============================================================================

ALTER TABLE public.ordens_compra
  ADD COLUMN IF NOT EXISTS data_vencimento date;

COMMENT ON COLUMN public.ordens_compra.data_vencimento IS
  'Prazo acordado com o fornecedor. Sem ele o recebimento nao gera conta a pagar.';

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS ordem_compra_id uuid;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contas_pagar_ordem_compra_id_fkey'
  ) THEN
    ALTER TABLE public.contas_pagar
      ADD CONSTRAINT contas_pagar_ordem_compra_id_fkey
      FOREIGN KEY (ordem_compra_id) REFERENCES public.ordens_compra(id);
  END IF;
END
$fk$;

COMMENT ON COLUMN public.contas_pagar.ordem_compra_id IS
  'Ordem de compra que originou o titulo (recebimento sem NF-e).';

-- No maximo um titulo por ordem de compra.
CREATE UNIQUE INDEX IF NOT EXISTS contas_pagar_ordem_compra_unico
  ON public.contas_pagar (ordem_compra_id)
  WHERE ordem_compra_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.receber_ordem_compra(p_oc_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_oc           record;
  v_it           record;
  v_pendentes    int;
  v_total        numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  SELECT id, loja_id, status, fornecedor_id, data_vencimento INTO v_oc
    FROM public.ordens_compra
   WHERE id = p_oc_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_oc.status <> 'EM_TRANSITO' THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  SELECT count(*) INTO v_pendentes
    FROM public.ordens_compra_itens
   WHERE ordem_id = p_oc_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'OC_CONFERENCIA_PENDENTE';
  END IF;

  FOR v_it IN
    SELECT id, produto_id, quantidade_conferida
      FROM public.ordens_compra_itens
     WHERE ordem_id = p_oc_id
  LOOP
    IF v_it.produto_id IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_oc.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_oc.loja_id,
        v_it.produto_id,
        'ENTRADA_OC',
        v_it.quantidade_conferida,
        v_uid,
        format('Recebimento OC %s (conferido)', p_oc_id::text)
      );
    END IF;

    UPDATE public.ordens_compra_itens
       SET quantidade_recebida = COALESCE(quantidade_conferida, 0)
     WHERE id = v_it.id;
  END LOOP;

  -- ── Obrigacao financeira ──────────────────────────────────────────────────
  -- Mesma grandeza que creditou estoque: quantidade CONFERIDA x preco da ordem.
  IF v_oc.fornecedor_id IS NOT NULL AND v_oc.data_vencimento IS NOT NULL THEN
    SELECT public.round_abnt(
             COALESCE(sum(COALESCE(quantidade_conferida, 0) * preco_unitario), 0), 2)
      INTO v_total
      FROM public.ordens_compra_itens
     WHERE ordem_id = p_oc_id;

    IF v_total > 0 THEN
      INSERT INTO public.contas_pagar (
        ordem_compra_id, fornecedor_id, loja_id,
        descricao, vencimento, valor_total, status
      ) VALUES (
        p_oc_id, v_oc.fornecedor_id, v_oc.loja_id,
        format('Ordem de compra %s', upper(left(p_oc_id::text, 8))),
        v_oc.data_vencimento, v_total, 'PENDENTE'
      )
      ON CONFLICT (ordem_compra_id) WHERE ordem_compra_id IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  UPDATE public.ordens_compra
     SET status = 'RECEBIDA'
   WHERE id = p_oc_id;
END;
$function$;

COMMENT ON FUNCTION public.receber_ordem_compra(uuid) IS
  'Credita estoque so com base em quantidade_conferida e gera UM titulo em contas_pagar quando a ordem tem fornecedor cadastrado e data_vencimento. Valor = soma de quantidade_conferida * preco_unitario. Indice unico parcial garante no maximo um titulo por ordem.';

DO $verify$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ordens_compra'
       AND column_name = 'data_vencimento'
  ) THEN
    RAISE EXCEPTION 'MIG_OC_AP_COLUNA_VENCIMENTO_AUSENTE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'contas_pagar_ordem_compra_unico'
  ) THEN
    RAISE EXCEPTION 'MIG_OC_AP_INDICE_UNICO_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.receber_ordem_compra(uuid)'::regprocedure);

  IF position('ordem_compra_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG_OC_AP_FUNCAO_SEM_TITULO';
  END IF;

  -- A guarda de conferencia nao pode ter sido perdida na reescrita.
  IF position('OC_CONFERENCIA_PENDENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG_OC_AP_GUARDA_CONFERENCIA_PERDIDA';
  END IF;
END;
$verify$;
