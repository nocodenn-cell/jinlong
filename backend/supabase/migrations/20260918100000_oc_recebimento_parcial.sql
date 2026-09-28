-- ============================================================================
-- UX-04 — Ordem de Compra com recebimento parcial (modelo B).
--
-- ANTES: a OC guardava uma única quantidade recebida, gravada de uma vez por
-- `receber_ordem_compra`, que SEMPRE encerrava o pedido (RECEBIDA) — mesmo com
-- menos do que o pedido. NF-e e entrada sem nota não enxergavam a OC.
--
-- AGORA: pedido / recebido acumulado / saldo por item; várias entradas
-- (pelo próprio pedido, por NF-e ou sem nota) abatem o saldo; o pedido só é
-- encerrado quando o saldo zera OU quando o operador o encerra com falta.
--
-- DECISÕES DE MODELO (provadas contra o schema atual)
-- ---------------------------------------------------
-- 1. SEM novo status. Os cinco estados existentes representam o modelo:
--      aberto / parcialmente recebido = CONFIRMADA|EM_TRANSITO + quantidades
--      (saldo = quantidade − quantidade_recebida, derivado);
--      completo                       = RECEBIDA e todos os saldos zerados;
--      encerrada com falta            = RECEBIDA + saldo > 0 + colunas de auditoria
--                                       `encerrada_com_falta_*` (esta migration).
--    RECEBIDA legada com saldo > 0 (pedidos fechados pelo modelo antigo) lê-se
--    como "recebida com falta" sem auditoria de encerramento.
-- 2. Vínculo POR ITEM em `ordens_compra_recebimentos` (razão append-only).
--    Nenhuma estrutura existente resolve: `remessas.origem_ref` é texto sem FK e
--    `movimentos_estoque_log` só tem FK para remessa. A coluna acumulada
--    `ordens_compra_itens.quantidade_recebida` continua sendo o saldo autoritativo
--    (só o helper a altera, sob lock); o razão é a trilha que reconstrói o
--    histórico (Σ razão = recebido; legado é preenchido abaixo).
-- 3. Toda via de entrada passa pelo MESMO helper (`_oc_abater_por_produto` /
--    `_oc_creditar_item`), que trava a OC com FOR UPDATE ANTES de creditar — dois
--    operadores recebendo o mesmo saldo se serializam; o segundo enxerga o saldo
--    já abatido. Nenhuma regra de estoque mora só na UI.
-- 4. Idempotência: mesmo padrão de `remessas` (idempotency_key + payload_hash);
--    NF-e mantém a idempotência natural por status (EM_CONFERENCIA→CONCLUIDA).
-- 5. Custo: INALTERADO. Só `confirmar_importacao_nfe` atualiza preco_custo (como
--    antes). Entrada pelo pedido e entrada sem nota não tocam custo.
-- 6. Conta a pagar: INALTERADO. Só a NF-e gera contas_pagar.
--
-- COMPATIBILIDADE / ROLLBACK
-- --------------------------
-- Aditiva: colunas nullable, tabela nova, funções auxiliares novas. Muda a
-- ASSINATURA de duas RPCs (o app é o único chamador e é atualizado no mesmo PR):
--   receber_ordem_compra(uuid)            -> (uuid, jsonb, text, text)
--   criar_confirmar_remessa_entrada(4 args) -> (5 args, o 5º com DEFAULT NULL:
--                                             chamadas de 4 argumentos seguem válidas)
-- `registrar_conferencia_ordem_compra` permanece (legado, sem chamadores no app).
-- Rollback lógico: reinstalar os corpos de 20260805193920 (receber), 20260828150000
-- (remessa) e 20260830110000 (NF-e); as colunas/tabela novas podem ficar.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Colunas de auditoria do encerramento com falta e vínculo da NF-e
-- ---------------------------------------------------------------------------

ALTER TABLE public.ordens_compra
  ADD COLUMN IF NOT EXISTS encerrada_com_falta_em  timestamptz,
  ADD COLUMN IF NOT EXISTS encerrada_com_falta_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS encerramento_motivo     text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordens_compra_encerramento_falta_check'
  ) THEN
    ALTER TABLE public.ordens_compra
      ADD CONSTRAINT ordens_compra_encerramento_falta_check CHECK (
        (encerrada_com_falta_em IS NULL AND encerrada_com_falta_por IS NULL AND encerramento_motivo IS NULL)
        OR
        (encerrada_com_falta_em IS NOT NULL AND encerrada_com_falta_por IS NOT NULL AND encerramento_motivo IS NOT NULL)
      );
  END IF;
END $$;

-- Defesa em profundidade: o recebido nunca passa do pedido. NOT VALID: pedidos
-- legados que receberam a mais (modelo antigo aceitava excesso) continuam
-- legíveis; a regra vale para todo INSERT/UPDATE novo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordens_compra_itens_recebido_ate_pedido_check'
  ) THEN
    ALTER TABLE public.ordens_compra_itens
      ADD CONSTRAINT ordens_compra_itens_recebido_ate_pedido_check
      CHECK (quantidade_recebida <= quantidade) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.ordens_compra.encerrada_com_falta_em IS
  'UX-04. Quando o operador declarou que o saldo pendente não será mais recebido. NULL = não foi encerrada com falta.';
COMMENT ON COLUMN public.ordens_compra.encerramento_motivo IS
  'UX-04. Motivo informado no encerramento com falta (auditoria).';

ALTER TABLE public.importacoes_nfe
  ADD COLUMN IF NOT EXISTS ordem_compra_id uuid REFERENCES public.ordens_compra(id);

CREATE INDEX IF NOT EXISTS idx_importacoes_nfe_ordem_compra
  ON public.importacoes_nfe (ordem_compra_id) WHERE ordem_compra_id IS NOT NULL;

COMMENT ON COLUMN public.importacoes_nfe.ordem_compra_id IS
  'UX-04. Pedido de compra ao qual o operador relacionou esta NF-e (opcional; nunca presumido). O abatimento do saldo acontece em confirmar_importacao_nfe.';

-- ---------------------------------------------------------------------------
-- 2. Razão de recebimentos por item (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ordens_compra_recebimentos (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id              uuid          NOT NULL REFERENCES public.lojas(id),
  ordem_id             uuid          NOT NULL REFERENCES public.ordens_compra(id) ON DELETE RESTRICT,
  ordem_item_id        uuid          NOT NULL REFERENCES public.ordens_compra_itens(id) ON DELETE RESTRICT,
  origem               text          NOT NULL CHECK (origem IN ('ORDEM_COMPRA', 'REMESSA', 'NFE')),
  entrada_id           uuid          NOT NULL,
  remessa_id           uuid          REFERENCES public.remessas(id),
  importacao_nfe_id    uuid          REFERENCES public.importacoes_nfe(id),
  produto_id           uuid          REFERENCES public.produtos(id),
  quantidade_esperada  numeric(12,3) NOT NULL CHECK (quantidade_esperada >= 0),
  quantidade           numeric(12,3) NOT NULL CHECK (quantidade > 0),
  divergencia_obs      text,
  movimento_estoque_id uuid          REFERENCES public.movimentos_estoque_log(id),
  idempotency_key      text,
  payload_hash         text,
  legado               boolean       NOT NULL DEFAULT false,
  created_by           uuid          REFERENCES public.usuarios(id),
  created_at           timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT oc_recebimentos_origem_fk_check CHECK (
    (origem = 'REMESSA' AND remessa_id IS NOT NULL)
    OR (origem = 'NFE' AND importacao_nfe_id IS NOT NULL)
    OR (origem = 'ORDEM_COMPRA')
  )
);

COMMENT ON TABLE public.ordens_compra_recebimentos IS
  'UX-04. Razão append-only: cada linha é a quantidade CONFERIDA de um item de pedido numa entrada (pelo próprio pedido, NF-e ou sem nota). Permite reconstruir "esta entrada corresponde a este pedido" e o histórico de recebimentos. Escrita somente pelas RPCs.';
COMMENT ON COLUMN public.ordens_compra_recebimentos.entrada_id IS
  'Agrupa as linhas de uma mesma entrada: id da remessa, id da importação NF-e ou um id gerado (entrada pelo pedido).';

CREATE INDEX IF NOT EXISTS idx_oc_recebimentos_ordem ON public.ordens_compra_recebimentos (ordem_id);
CREATE INDEX IF NOT EXISTS idx_oc_recebimentos_item  ON public.ordens_compra_recebimentos (ordem_item_id);
CREATE INDEX IF NOT EXISTS idx_oc_recebimentos_remessa ON public.ordens_compra_recebimentos (remessa_id) WHERE remessa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_recebimentos_nfe ON public.ordens_compra_recebimentos (importacao_nfe_id) WHERE importacao_nfe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_recebimentos_loja ON public.ordens_compra_recebimentos (loja_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_recebimentos_idempotencia
  ON public.ordens_compra_recebimentos (ordem_id, idempotency_key, ordem_item_id)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.ordens_compra_recebimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oc_recebimentos_select_loja ON public.ordens_compra_recebimentos;
CREATE POLICY oc_recebimentos_select_loja ON public.ordens_compra_recebimentos
  FOR SELECT TO authenticated
  USING (loja_id = (SELECT u.loja_id FROM public.usuarios u WHERE u.id = (SELECT auth.uid())));

REVOKE ALL ON public.ordens_compra_recebimentos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ordens_compra_recebimentos TO authenticated;
GRANT ALL ON public.ordens_compra_recebimentos TO service_role;

CREATE OR REPLACE FUNCTION public.trg_oc_recebimentos_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'OC_RECEBIMENTO_IMUTAVEL: o razão de recebimentos é append-only (correção = nova entrada, nunca UPDATE/DELETE)';
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_recebimentos_imutavel ON public.ordens_compra_recebimentos;
CREATE TRIGGER trg_oc_recebimentos_imutavel
  BEFORE UPDATE OR DELETE ON public.ordens_compra_recebimentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_oc_recebimentos_imutavel();

REVOKE ALL ON FUNCTION public.trg_oc_recebimentos_imutavel() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guardas de integridade: o saldo e o encerramento só mudam pelas RPCs
-- ---------------------------------------------------------------------------
-- As RPCs SECURITY DEFINER marcam a transação com `jinlong.oc_writer = on`.
-- Sem a marca, UPDATE direto (a policy oc_auth permite FOR ALL a authenticated
-- da própria loja) em quantidade_recebida ou para RECEBIDA é recusado. Cancelar
-- um pedido que já recebeu algo também é recusado (o caminho é "encerrar com falta").

CREATE OR REPLACE FUNCTION public.trg_oc_guarda_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NEW.status = 'RECEBIDA'
     AND OLD.status IS DISTINCT FROM 'RECEBIDA'
     AND COALESCE(current_setting('jinlong.oc_writer', true), '') <> 'on' THEN
    RAISE EXCEPTION 'OC_RECEBIDA_SOMENTE_VIA_RPC: um pedido só é encerrado por entrada de mercadoria ou por "encerrar com falta"';
  END IF;

  IF NEW.status = 'CANCELADA'
     AND OLD.status IS DISTINCT FROM 'CANCELADA'
     AND EXISTS (
       SELECT 1 FROM public.ordens_compra_itens i
       WHERE i.ordem_id = OLD.id AND i.quantidade_recebida > 0
     ) THEN
    RAISE EXCEPTION 'OC_CANCELAR_COM_RECEBIMENTO: o pedido já recebeu mercadoria; use "encerrar com falta"';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_guarda_status ON public.ordens_compra;
CREATE TRIGGER trg_oc_guarda_status
  BEFORE UPDATE OF status ON public.ordens_compra
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_oc_guarda_status();

CREATE OR REPLACE FUNCTION public.trg_oci_guarda_recebido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('jinlong.oc_writer', true), '') <> 'on' THEN
    RAISE EXCEPTION 'OC_RECEBIDO_SOMENTE_VIA_RPC: a quantidade recebida só muda por entrada de mercadoria';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oci_guarda_recebido ON public.ordens_compra_itens;
CREATE TRIGGER trg_oci_guarda_recebido
  BEFORE UPDATE OF quantidade_recebida ON public.ordens_compra_itens
  FOR EACH ROW WHEN (OLD.quantidade_recebida IS DISTINCT FROM NEW.quantidade_recebida)
  EXECUTE FUNCTION public.trg_oci_guarda_recebido();

REVOKE ALL ON FUNCTION public.trg_oc_guarda_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_oci_guarda_recebido() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Helpers internos (não expostos a authenticated)
-- ---------------------------------------------------------------------------

-- Abate `p_qtd` de UM item do pedido. Pré-condição: o chamador já travou a OC.
CREATE OR REPLACE FUNCTION public._oc_creditar_item(
  p_ordem_id     uuid,
  p_loja         uuid,
  p_uid          uuid,
  p_item_id      uuid,
  p_qtd          numeric,
  p_origem       text,
  p_entrada_id   uuid,
  p_remessa_id   uuid,
  p_importacao   uuid,
  p_mov_id       uuid,
  p_esperada     numeric,
  p_obs          text,
  p_idem         text,
  p_hash         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_it   record;
  v_novo numeric;
BEGIN
  SELECT i.id, i.produto_id, i.quantidade, i.quantidade_recebida
    INTO v_it
    FROM public.ordens_compra_itens i
   WHERE i.id = p_item_id AND i.ordem_id = p_ordem_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_ITEM_NAO_ENCONTRADO';
  END IF;

  IF p_qtd IS NULL OR p_qtd <= 0 THEN
    RAISE EXCEPTION 'OC_QTD_INVALIDA';
  END IF;

  IF p_qtd > (v_it.quantidade - v_it.quantidade_recebida) THEN
    RAISE EXCEPTION 'OC_QTD_ACIMA_SALDO:%:%', p_item_id, (v_it.quantidade - v_it.quantidade_recebida);
  END IF;

  INSERT INTO public.ordens_compra_recebimentos (
    loja_id, ordem_id, ordem_item_id, origem, entrada_id, remessa_id, importacao_nfe_id,
    produto_id, quantidade_esperada, quantidade, divergencia_obs, movimento_estoque_id,
    idempotency_key, payload_hash, created_by
  ) VALUES (
    p_loja, p_ordem_id, p_item_id, p_origem, p_entrada_id, p_remessa_id, p_importacao,
    v_it.produto_id, COALESCE(p_esperada, v_it.quantidade - v_it.quantidade_recebida), p_qtd,
    NULLIF(btrim(COALESCE(p_obs, '')), ''), p_mov_id,
    p_idem, p_hash, p_uid
  );

  v_novo := v_it.quantidade_recebida + p_qtd;

  PERFORM set_config('jinlong.oc_writer', 'on', true);
  UPDATE public.ordens_compra_itens
     SET quantidade_recebida = v_novo,
         quantidade_conferida = v_novo,
         status_conferencia = CASE WHEN v_novo >= v_it.quantidade THEN 'CONFERIDO' ELSE 'EM_CONFERENCIA' END,
         divergencia_obs = COALESCE(NULLIF(btrim(COALESCE(p_obs, '')), ''), divergencia_obs),
         conferido_por = p_uid,
         conferido_em = now()
   WHERE id = p_item_id;
END;
$$;

-- Abate `p_qtd` do saldo das linhas do pedido cujo produto é `p_produto_id`
-- (na ordem de criação, até o saldo de cada linha). Devolve o quanto foi atribuído.
--   p_estrito = true  : produto ausente no pedido é erro (entrada sem nota informou o pedido errado);
--   p_estrito = false : produto ausente no pedido é ignorado (NF-e pode trazer itens fora do pedido).
-- Excesso sobre o saldo NUNCA é atribuído em silêncio: levanta OC_QTD_ACIMA_SALDO
-- (é exatamente o "receber de novo" que duplicaria o estoque).
CREATE OR REPLACE FUNCTION public._oc_abater_por_produto(
  p_ordem_id   uuid,
  p_loja       uuid,
  p_uid        uuid,
  p_origem     text,
  p_entrada_id uuid,
  p_remessa_id uuid,
  p_importacao uuid,
  p_produto_id uuid,
  p_qtd        numeric,
  p_esperada   numeric,
  p_mov_id     uuid,
  p_obs        text,
  p_estrito    boolean
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_linha     record;
  v_restante  numeric := p_qtd;
  v_uso       numeric;
  v_atribuido numeric := 0;
  v_tem_linha boolean := false;
  v_saldo_tot numeric := 0;
BEGIN
  FOR v_linha IN
    SELECT i.id, (i.quantidade - i.quantidade_recebida) AS saldo
      FROM public.ordens_compra_itens i
     WHERE i.ordem_id = p_ordem_id AND i.produto_id = p_produto_id
     ORDER BY i.created_at, i.id
       FOR UPDATE
  LOOP
    v_tem_linha := true;
    v_saldo_tot := v_saldo_tot + GREATEST(v_linha.saldo, 0);
    IF v_restante <= 0 OR v_linha.saldo <= 0 THEN
      CONTINUE;
    END IF;
    v_uso := LEAST(v_restante, v_linha.saldo);
    PERFORM public._oc_creditar_item(
      p_ordem_id, p_loja, p_uid, v_linha.id, v_uso, p_origem, p_entrada_id,
      p_remessa_id, p_importacao, p_mov_id, p_esperada, p_obs, NULL, NULL
    );
    v_restante := v_restante - v_uso;
    v_atribuido := v_atribuido + v_uso;
  END LOOP;

  IF NOT v_tem_linha THEN
    IF p_estrito THEN
      RAISE EXCEPTION 'OC_PRODUTO_FORA_DO_PEDIDO:%', p_produto_id;
    END IF;
    RETURN 0;
  END IF;

  IF v_restante > 0 THEN
    RAISE EXCEPTION 'OC_QTD_ACIMA_SALDO:%:%', p_produto_id, v_saldo_tot;
  END IF;

  RETURN v_atribuido;
END;
$$;

-- Estado do pedido após uma entrada: fecha quando todos os saldos zeraram;
-- CONFIRMADA que já recebeu algo passa a EM_TRANSITO (a mercadoria chegou).
CREATE OR REPLACE FUNCTION public._oc_atualizar_estado(p_ordem_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  PERFORM set_config('jinlong.oc_writer', 'on', true);

  IF NOT EXISTS (
    SELECT 1 FROM public.ordens_compra_itens i
     WHERE i.ordem_id = p_ordem_id AND i.quantidade_recebida < i.quantidade
  ) THEN
    UPDATE public.ordens_compra SET status = 'RECEBIDA'
     WHERE id = p_ordem_id AND status IN ('CONFIRMADA', 'EM_TRANSITO');
  ELSE
    UPDATE public.ordens_compra SET status = 'EM_TRANSITO'
     WHERE id = p_ordem_id AND status = 'CONFIRMADA';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._oc_resumo_json(p_ordem_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT jsonb_build_object(
    'oc_id', oc.id,
    'status', oc.status,
    'pedido_total', COALESCE(SUM(i.quantidade), 0),
    'recebido_total', COALESCE(SUM(i.quantidade_recebida), 0),
    'pendente_total', COALESCE(SUM(GREATEST(i.quantidade - i.quantidade_recebida, 0)), 0),
    'itens_pendentes', COUNT(*) FILTER (WHERE i.quantidade_recebida < i.quantidade),
    'encerrada', oc.status = 'RECEBIDA',
    'encerrada_com_falta', oc.encerrada_com_falta_em IS NOT NULL
  )
  FROM public.ordens_compra oc
  LEFT JOIN public.ordens_compra_itens i ON i.ordem_id = oc.id
  WHERE oc.id = p_ordem_id
  GROUP BY oc.id, oc.status, oc.encerrada_com_falta_em;
$$;

REVOKE ALL ON FUNCTION public._oc_creditar_item(uuid, uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._oc_abater_por_produto(uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, numeric, numeric, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._oc_atualizar_estado(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._oc_resumo_json(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. receber_ordem_compra — entrada pelo próprio pedido (parcial, idempotente)
-- ---------------------------------------------------------------------------
-- p_itens: [{item_id, quantidade_conferida, divergencia_obs?}] — quantidade
-- conferida NESTA entrada (não o acumulado). Conferência e crédito na mesma
-- transação (mesmo desenho de criar_confirmar_remessa_entrada).

DROP FUNCTION IF EXISTS public.receber_ordem_compra(uuid);

CREATE FUNCTION public.receber_ordem_compra(
  p_oc_id           uuid,
  p_itens           jsonb,
  p_idempotency_key text,
  p_observacao      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_oc           record;
  v_key          text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_obs          text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_itens_canon  jsonb;
  v_hash         text;
  v_prev         record;
  v_entrada      uuid := gen_random_uuid();
  el             jsonb;
  v_item_id      uuid;
  v_qtd          numeric;
  v_div          text;
  v_it           record;
  v_mov          uuid;
  v_soma         numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'OC_AUTH'; END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid AND u.ativo;
  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  IF v_key IS NULL THEN RAISE EXCEPTION 'OC_IDEMPOTENCY_KEY'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'OC_ITENS_INVALIDOS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) e
     GROUP BY e->>'item_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'OC_ITEM_DUPLICADO';
  END IF;

  -- Trava o pedido ANTES de qualquer efeito: serializa operadores concorrentes.
  SELECT oc.id, oc.loja_id, oc.status INTO v_oc
    FROM public.ordens_compra oc WHERE oc.id = p_oc_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'item_id', COALESCE(e->>'item_id', ''),
             'quantidade', COALESCE(e->>'quantidade_conferida', '')
           ) ORDER BY e->>'item_id', e->>'quantidade_conferida')
    INTO v_itens_canon
    FROM jsonb_array_elements(p_itens) e;
  v_hash := md5(jsonb_build_object('itens', v_itens_canon, 'observacao', COALESCE(v_obs, ''))::text);

  -- Replay (duplo clique / retry): mesma chave => mesmo resultado, sem creditar de novo.
  -- Vem ANTES da checagem de status: o replay de uma entrada que fechou o pedido é válido.
  SELECT r.payload_hash, r.entrada_id INTO v_prev
    FROM public.ordens_compra_recebimentos r
   WHERE r.ordem_id = p_oc_id AND r.idempotency_key = v_key
   LIMIT 1;
  IF FOUND THEN
    IF v_prev.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'OC_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN public._oc_resumo_json(p_oc_id)
           || jsonb_build_object('replay', true, 'entrada_id', v_prev.entrada_id);
  END IF;

  IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    BEGIN
      v_item_id := NULLIF(btrim(COALESCE(el->>'item_id', '')), '')::uuid;
      v_qtd := NULLIF(btrim(COALESCE(el->>'quantidade_conferida', '')), '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'OC_ITEM_INVALIDO';
    END;

    IF v_item_id IS NULL OR v_qtd IS NULL OR v_qtd < 0
       OR v_qtd = 'NaN'::numeric OR v_qtd = 'Infinity'::numeric
       OR v_qtd <> round(v_qtd, 3) THEN
      RAISE EXCEPTION 'OC_QTD_INVALIDA';
    END IF;
    IF v_qtd = 0 THEN CONTINUE; END IF;

    v_div := NULLIF(btrim(COALESCE(el->>'divergencia_obs', '')), '');

    SELECT i.id, i.produto_id, i.quantidade, i.quantidade_recebida INTO v_it
      FROM public.ordens_compra_itens i
     WHERE i.id = v_item_id AND i.ordem_id = p_oc_id
       FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OC_ITEM_NAO_ENCONTRADO'; END IF;

    IF v_qtd > (v_it.quantidade - v_it.quantidade_recebida) THEN
      RAISE EXCEPTION 'OC_QTD_ACIMA_SALDO:%:%', v_item_id, (v_it.quantidade - v_it.quantidade_recebida);
    END IF;

    v_mov := NULL;
    IF v_it.produto_id IS NOT NULL THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_oc.loja_id, v_qtd, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_oc.loja_id, v_it.produto_id, 'ENTRADA_OC', v_qtd, v_uid,
        format('Recebimento OC %s (conferido)', p_oc_id::text)
      ) RETURNING id INTO v_mov;
    END IF;

    PERFORM public._oc_creditar_item(
      p_oc_id, v_oc.loja_id, v_uid, v_item_id, v_qtd, 'ORDEM_COMPRA', v_entrada,
      NULL, NULL, v_mov, NULL, COALESCE(v_div, v_obs), v_key, v_hash
    );
    v_soma := v_soma + v_qtd;
  END LOOP;

  IF v_soma = 0 THEN RAISE EXCEPTION 'OC_ENTRADA_VAZIA'; END IF;

  PERFORM public._oc_atualizar_estado(p_oc_id);

  RETURN public._oc_resumo_json(p_oc_id)
         || jsonb_build_object('replay', false, 'entrada_id', v_entrada, 'quantidade_creditada', v_soma);
END;
$$;

COMMENT ON FUNCTION public.receber_ordem_compra(uuid, jsonb, text, text) IS
  'UX-04. Entrada pelo próprio pedido: quantidade conferida NESTA entrada, nunca acima do saldo, idempotente por chave, com lock do pedido. Não encerra o pedido enquanto houver saldo.';

REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid, jsonb, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. encerrar_ordem_compra_com_falta — encerramento explícito e auditável
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.encerrar_ordem_compra_com_falta(
  p_oc_id  uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_oc           record;
  v_motivo       text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'OC_AUTH'; END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid AND u.ativo;
  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  IF v_motivo IS NULL OR length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'OC_MOTIVO_OBRIGATORIO';
  END IF;

  SELECT oc.id, oc.loja_id, oc.status INTO v_oc
    FROM public.ordens_compra oc WHERE oc.id = p_oc_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ordens_compra_itens i
     WHERE i.ordem_id = p_oc_id AND i.quantidade_recebida > 0
  ) THEN
    RAISE EXCEPTION 'OC_SEM_RECEBIMENTO';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ordens_compra_itens i
     WHERE i.ordem_id = p_oc_id AND i.quantidade_recebida < i.quantidade
  ) THEN
    RAISE EXCEPTION 'OC_JA_COMPLETA';
  END IF;

  UPDATE public.ordens_compra_itens
     SET status_conferencia = 'DIVERGENTE',
         divergencia_obs = COALESCE(divergencia_obs, 'Encerrado com falta: ' || v_motivo)
   WHERE ordem_id = p_oc_id AND quantidade_recebida < quantidade;

  PERFORM set_config('jinlong.oc_writer', 'on', true);
  UPDATE public.ordens_compra
     SET status = 'RECEBIDA',
         encerrada_com_falta_em = now(),
         encerrada_com_falta_por = v_uid,
         encerramento_motivo = v_motivo
   WHERE id = p_oc_id;

  RETURN public._oc_resumo_json(p_oc_id);
END;
$$;

COMMENT ON FUNCTION public.encerrar_ordem_compra_com_falta(uuid, text) IS
  'UX-04. "Este pedido não será mais recebido integralmente": encerra somente o saldo restante (o recebido permanece), com motivo, autor e data. Exige que algo já tenha sido recebido (senão o caminho é Cancelar).';

REVOKE ALL ON FUNCTION public.encerrar_ordem_compra_com_falta(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encerrar_ordem_compra_com_falta(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. criar_confirmar_remessa_entrada — entrada sem nota, com pedido opcional
-- ---------------------------------------------------------------------------
-- Corpo de 20260828150000 + vínculo opcional. Chamadas de 4 argumentos seguem
-- válidas (o 5º tem DEFAULT NULL) e o payload_hash de quem NÃO vincula pedido
-- é idêntico ao anterior (replays antigos não divergem).

DROP FUNCTION IF EXISTS public.criar_confirmar_remessa_entrada(text, text, jsonb, text);

CREATE FUNCTION public.criar_confirmar_remessa_entrada(
  p_origem          text,
  p_observacao      text,
  p_itens           jsonb,
  p_idempotency_key text,
  p_ordem_compra_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_loja uuid;
  v_remessa uuid;
  v_existente uuid;
  v_existente_hash text;
  v_item jsonb;
  v_produto uuid;
  v_esperada numeric;
  v_conferida numeric;
  v_observacao_norm text;
  v_itens_canon jsonb;
  v_payload_hash text;
  v_oc record;
  v_mov uuid;
  v_obs_mov text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'REMESSA_AUTH'; END IF;

  SELECT u.loja_id INTO v_loja
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND OR v_loja IS NULL THEN RAISE EXCEPTION 'REMESSA_PERFIL'; END IF;

  p_origem := NULLIF(btrim(COALESCE(p_origem, '')), '');
  p_idempotency_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  IF p_origem IS NULL THEN RAISE EXCEPTION 'REMESSA_ORIGEM'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'REMESSA_IDEMPOTENCY_KEY'; END IF;

  v_observacao_norm := NULLIF(btrim(COALESCE(p_observacao, '')), '');

  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'produto_id', COALESCE(elem->>'produto_id', ''),
        'quantidade_esperada', COALESCE(elem->>'quantidade_esperada', ''),
        'quantidade_conferida', COALESCE(elem->>'quantidade_conferida', '')
      ) ORDER BY elem->>'produto_id'
    )
    INTO v_itens_canon
    FROM jsonb_array_elements(p_itens) elem;
  END IF;

  -- Sem pedido: fórmula idêntica à anterior. Com pedido: o id entra no hash.
  v_payload_hash := md5(
    (jsonb_build_object(
      'origem', COALESCE(p_origem, ''),
      'observacao', COALESCE(v_observacao_norm, ''),
      'itens', COALESCE(v_itens_canon, '[]'::jsonb)
    ) || CASE WHEN p_ordem_compra_id IS NULL
              THEN '{}'::jsonb
              ELSE jsonb_build_object('ordem_compra_id', p_ordem_compra_id) END)::text
  );

  SELECT r.id, r.payload_hash INTO v_existente, v_existente_hash
  FROM public.remessas r
  WHERE r.loja_id = v_loja AND r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existente_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN v_existente;
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'REMESSA_ITENS_VAZIOS';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    BEGIN
      v_produto := NULLIF(btrim(COALESCE(v_item->>'produto_id', '')), '')::uuid;
      v_esperada := NULLIF(v_item->>'quantidade_esperada', '')::numeric;
      v_conferida := NULLIF(v_item->>'quantidade_conferida', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'REMESSA_ITEM_INVALIDO';
    END;

    IF v_produto IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = v_produto AND p.loja_id = v_loja
        AND p.status_publicacao IS DISTINCT FROM 'INATIVO'
    ) THEN
      RAISE EXCEPTION 'REMESSA_ITEM_INVALIDO';
    END IF;
    IF v_esperada IS NULL OR v_conferida IS NULL
       OR v_esperada <= 0 OR v_conferida <= 0
       OR v_esperada = 'NaN'::numeric OR v_conferida = 'NaN'::numeric
       OR v_esperada = 'Infinity'::numeric OR v_conferida = 'Infinity'::numeric
    THEN
      RAISE EXCEPTION 'REMESSA_QTD_POSITIVA';
    END IF;
  END LOOP;

  -- Pedido informado: valida e TRAVA antes de qualquer efeito de estoque.
  IF p_ordem_compra_id IS NOT NULL THEN
    SELECT oc.id, oc.loja_id, oc.status INTO v_oc
      FROM public.ordens_compra oc WHERE oc.id = p_ordem_compra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;
    IF v_oc.loja_id IS DISTINCT FROM v_loja THEN RAISE EXCEPTION 'OC_LOJA'; END IF;
    IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN RAISE EXCEPTION 'OC_STATUS_INVALIDO'; END IF;
  END IF;

  INSERT INTO public.remessas(
    loja_id, origem_descricao, status, observacao, created_by, idempotency_key, payload_hash,
    origem_tipo, origem_ref
  ) VALUES (
    v_loja, p_origem, 'EM_CONFERENCIA', v_observacao_norm,
    v_uid, p_idempotency_key, v_payload_hash,
    CASE WHEN p_ordem_compra_id IS NULL THEN 'SEM_DOCUMENTO' ELSE 'ORDEM_COMPRA' END,
    p_ordem_compra_id::text
  ) RETURNING id INTO v_remessa;

  v_obs_mov := v_observacao_norm;
  IF p_ordem_compra_id IS NOT NULL THEN
    v_obs_mov := concat_ws(' · ', v_observacao_norm, format('OC %s', p_ordem_compra_id::text));
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto := (v_item->>'produto_id')::uuid;
    v_esperada := (v_item->>'quantidade_esperada')::numeric;
    v_conferida := (v_item->>'quantidade_conferida')::numeric;

    INSERT INTO public.remessa_itens(
      remessa_id, produto_id, quantidade_esperada, quantidade_conferida
    ) VALUES (
      v_remessa, v_produto, v_esperada, v_conferida
    );

    INSERT INTO public.estoque(loja_id, produto_id, quantidade_atual, estoque_minimo)
    VALUES (v_loja, v_produto, v_conferida, 0)
    ON CONFLICT (loja_id, produto_id) DO UPDATE
      SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
          version = public.estoque.version + 1,
          updated_at = now();

    INSERT INTO public.movimentos_estoque_log(
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
    ) VALUES (
      v_loja, v_produto, 'ENTRADA_REMessa_LOJA', v_conferida, v_remessa, v_uid,
      v_obs_mov
    ) RETURNING id INTO v_mov;

    IF p_ordem_compra_id IS NOT NULL THEN
      PERFORM public._oc_abater_por_produto(
        p_ordem_compra_id, v_loja, v_uid, 'REMESSA', v_remessa, v_remessa, NULL,
        v_produto, v_conferida, v_esperada, v_mov, v_observacao_norm, true
      );
    END IF;
  END LOOP;

  IF p_ordem_compra_id IS NOT NULL THEN
    PERFORM public._oc_atualizar_estado(p_ordem_compra_id);
  END IF;

  UPDATE public.remessas
  SET status = 'CONCLUIDA', finalized_at = now(),
      conferido_por = v_uid, conferido_em = now()
  WHERE id = v_remessa;

  RETURN v_remessa;
EXCEPTION WHEN unique_violation THEN
  SELECT r.id, r.payload_hash INTO v_existente, v_existente_hash
  FROM public.remessas r
  WHERE r.loja_id = v_loja AND r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existente_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN v_existente;
  END IF;
  RAISE;
END;
$function$;

COMMENT ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid) IS
  'Entrada sem nota fiscal (conferência+confirmação atômicas). UX-04: p_ordem_compra_id opcional abate o saldo do pedido por item, sob lock, nunca acima do saldo; sem pedido o comportamento é o de 20260828150000.';

REVOKE ALL ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Vínculo da NF-e ao pedido (escolha do operador, na conferência)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vincular_importacao_nfe_ordem_compra(
  p_importacao_id uuid,
  p_oc_id         uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  v_oc           record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'IMPORT_NFE_AUTH'; END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid AND u.ativo;
  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT i.id, i.loja_id, i.status INTO v_imp
    FROM public.importacoes_nfe i WHERE i.id = p_importacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA'; END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;
  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  IF p_oc_id IS NOT NULL THEN
    SELECT oc.id, oc.loja_id, oc.status INTO v_oc
      FROM public.ordens_compra oc WHERE oc.id = p_oc_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;
    IF v_oc.loja_id IS DISTINCT FROM v_imp.loja_id THEN RAISE EXCEPTION 'OC_LOJA'; END IF;
    IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN RAISE EXCEPTION 'OC_STATUS_INVALIDO'; END IF;
  END IF;

  UPDATE public.importacoes_nfe SET ordem_compra_id = p_oc_id WHERE id = p_importacao_id;
END;
$$;

COMMENT ON FUNCTION public.vincular_importacao_nfe_ordem_compra(uuid, uuid) IS
  'UX-04. Relaciona (ou, com NULL, desfaz o vínculo de) uma NF-e em conferência a um pedido. Nunca presumido: é o operador quem escolhe. O abatimento do saldo só acontece em confirmar_importacao_nfe.';

REVOKE ALL ON FUNCTION public.vincular_importacao_nfe_ordem_compra(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_importacao_nfe_ordem_compra(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. confirmar_importacao_nfe — corpo de 20260830110000 + abatimento do pedido
-- ---------------------------------------------------------------------------
-- Estoque, custo (atualizar_custo) e contas_pagar: EXATAMENTE como antes.
-- Acrescenta: com pedido vinculado, o pedido é travado antes de creditar e cada
-- item conferido abate o saldo do produto correspondente (NF-e pode trazer itens
-- fora do pedido: esses não são atribuídos). Excesso sobre o saldo aborta a
-- confirmação (nada é creditado) — o operador desvincula o pedido ou corrige.

CREATE OR REPLACE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  v_it           record;
  v_dup          record;
  v_pendentes    int;
  v_oc           record;
  v_mov          uuid;
  v_obs          text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, fornecedor_id, numero_nf, status, ordem_compra_id INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  SELECT count(*) INTO v_pendentes
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_PENDENTE';
  END IF;

  -- Pedido vinculado: trava antes de creditar (mesma ordem de lock das outras vias).
  IF v_imp.ordem_compra_id IS NOT NULL THEN
    SELECT oc.id, oc.loja_id, oc.status INTO v_oc
      FROM public.ordens_compra oc WHERE oc.id = v_imp.ordem_compra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;
    IF v_oc.loja_id IS DISTINCT FROM v_imp.loja_id THEN RAISE EXCEPTION 'OC_LOJA'; END IF;
    IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN RAISE EXCEPTION 'OC_STATUS_INVALIDO'; END IF;
  END IF;

  FOR v_it IN
    SELECT produto_id, quantidade_nfe, quantidade_conferida, custo_unitario, atualizar_custo, status_conferencia
      FROM public.importacoes_nfe_itens
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    IF v_it.quantidade_conferida IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_imp.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      v_obs := format('Importação NF-e %s (conferido%s)', p_importacao_id::text,
               CASE WHEN v_it.status_conferencia = 'DIVERGENTE' THEN ', divergente da nota' ELSE '' END);
      IF v_imp.ordem_compra_id IS NOT NULL THEN
        v_obs := v_obs || format(' · OC %s', v_imp.ordem_compra_id::text);
      END IF;

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_imp.loja_id, v_it.produto_id, 'ENTRADA_NFE', v_it.quantidade_conferida, v_uid, v_obs
      ) RETURNING id INTO v_mov;

      IF v_imp.ordem_compra_id IS NOT NULL THEN
        PERFORM public._oc_abater_por_produto(
          v_imp.ordem_compra_id, v_imp.loja_id, v_uid, 'NFE', p_importacao_id, NULL, p_importacao_id,
          v_it.produto_id, v_it.quantidade_conferida, v_it.quantidade_nfe, v_mov, NULL, false
        );
      END IF;
    END IF;

    IF v_it.atualizar_custo AND v_it.custo_unitario > 0 THEN
      UPDATE public.produtos p
         SET preco_custo = v_it.custo_unitario,
             updated_at  = now()
       WHERE p.id = v_it.produto_id
         AND (
           p.permitir_abaixo_custo
           OR (
             (p.preco_varejo < v_it.custo_unitario) IS NOT TRUE
             AND (p.preco_atacado IS NULL OR p.preco_atacado >= v_it.custo_unitario)
           )
         );
    END IF;
  END LOOP;

  IF v_imp.ordem_compra_id IS NOT NULL THEN
    PERFORM public._oc_atualizar_estado(v_imp.ordem_compra_id);
  END IF;

  FOR v_dup IN
    SELECT numero_duplicata, data_vencimento, valor
      FROM public.importacoes_nfe_duplicatas
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    INSERT INTO public.contas_pagar (
      nfe_importacao_id, fornecedor_id, loja_id, nfe_numero, vencimento, valor_total, status
    ) VALUES (
      p_importacao_id, v_imp.fornecedor_id, v_imp.loja_id, v_dup.numero_duplicata,
      v_dup.data_vencimento, v_dup.valor, 'PENDENTE'
    );
  END LOOP;

  UPDATE public.importacoes_nfe
     SET status = 'CONCLUIDA'
   WHERE id = p_importacao_id;
END;
$$;

COMMENT ON FUNCTION public.confirmar_importacao_nfe(uuid) IS
  'FLX-05 + UX-04. Credita estoque/contas_pagar pela quantidade conferida. FOR UPDATE anti-corrida. UPDATE de preco_custo é pulado quando dispararia trg_fn_produtos_margem. Com pedido vinculado (importacoes_nfe.ordem_compra_id) abate o saldo do pedido por item, sob lock, nunca acima do saldo.';

REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Backfill do razão para pedidos anteriores ao modelo B
-- ---------------------------------------------------------------------------
-- Cada item com quantidade_recebida > 0 e sem linha no razão ganha UMA linha
-- legada (origem ORDEM_COMPRA), para que Σ razão = recebido. Sem efeito em estoque.

INSERT INTO public.ordens_compra_recebimentos (
  loja_id, ordem_id, ordem_item_id, origem, entrada_id, produto_id,
  quantidade_esperada, quantidade, legado, created_at
)
SELECT oc.loja_id, i.ordem_id, i.id, 'ORDEM_COMPRA', gen_random_uuid(), i.produto_id,
       i.quantidade, i.quantidade_recebida, true, COALESCE(oc.updated_at, now())
  FROM public.ordens_compra_itens i
  JOIN public.ordens_compra oc ON oc.id = i.ordem_id
 WHERE i.quantidade_recebida > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.ordens_compra_recebimentos r WHERE r.ordem_item_id = i.id
   );

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO estrutural — falha a transação se algo essencial faltar
-- ---------------------------------------------------------------------------

DO $verify$
BEGIN
  IF to_regprocedure('public.receber_ordem_compra(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'UX04_RECEBER_OC_ASSINATURA_ANTIGA_REMANESCENTE';
  END IF;
  IF to_regprocedure('public.criar_confirmar_remessa_entrada(text,text,jsonb,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'UX04_REMESSA_ASSINATURA_ANTIGA_REMANESCENTE';
  END IF;
  IF to_regprocedure('public.receber_ordem_compra(uuid,jsonb,text,text)') IS NULL
     OR to_regprocedure('public.encerrar_ordem_compra_com_falta(uuid,text)') IS NULL
     OR to_regprocedure('public.criar_confirmar_remessa_entrada(text,text,jsonb,text,uuid)') IS NULL
     OR to_regprocedure('public.vincular_importacao_nfe_ordem_compra(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'UX04_RPC_AUSENTE';
  END IF;
  IF position('FOR UPDATE' IN pg_get_functiondef('public.receber_ordem_compra(uuid,jsonb,text,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'UX04_LOCK_AUSENTE: receber_ordem_compra';
  END IF;
  IF has_function_privilege('anon', 'public.receber_ordem_compra(uuid,jsonb,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'UX04_GRANT_ANON_INDEVIDO';
  END IF;
  IF has_function_privilege('authenticated', 'public._oc_creditar_item(uuid,uuid,uuid,uuid,numeric,text,uuid,uuid,uuid,uuid,numeric,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'UX04_HELPER_EXPOSTO: _oc_creditar_item executável por authenticated';
  END IF;
  IF has_table_privilege('authenticated', 'public.ordens_compra_recebimentos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ordens_compra_recebimentos', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ordens_compra_recebimentos', 'DELETE') THEN
    RAISE EXCEPTION 'UX04_RAZAO_ESCRITA_DIRETA: authenticated não pode escrever no razão';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
