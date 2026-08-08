-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260801120000
-- name: recebimento_conferencia_explicita
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

-- Onda B — conferência de recebimento como etapa real.
--
-- Antes: `confirmar_remessa_entrada` dava entrada em
-- `COALESCE(quantidade_conferida, quantidade_esperada)`. Se ninguém contasse, o
-- sistema creditava o que a nota prometia e gravava status CONCLUIDA — trilha
-- auditável de uma conferência que não houve.
--
-- Agora: conferir e confirmar são transições distintas.
--   EM_CONFERENCIA --registrar_conferencia_remessa--> CONFERIDO | DIVERGENTE
--   CONFERIDO | DIVERGENTE --confirmar_remessa_entrada--> CONCLUIDA
-- Confirmar sem conferência completa levanta RECEBIMENTO_CONFERENCIA_PENDENTE.
--
-- Compatibilidade: `remessas` tem 0 linhas em produção — não há backfill. As
-- colunas novas são nullable ou têm default. A assinatura de
-- `confirmar_remessa_entrada(uuid)` não muda; muda a pré-condição.
--
-- Escopo: NF-e (`importar_nfe_transacao`) e ordem de compra
-- (`receber_ordem_compra`) NÃO passam a usar `remessas` nesta onda. A coluna
-- `origem_tipo` cria o vocabulário para isso sem mexer nos dois fluxos.

-- ---------------------------------------------------------------------------
-- 1. Estados e colunas de auditoria
-- ---------------------------------------------------------------------------

ALTER TABLE public.remessas DROP CONSTRAINT IF EXISTS remessas_status_check

ALTER TABLE public.remessas ADD CONSTRAINT remessas_status_check
  CHECK (status IN ('RASCUNHO', 'EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE', 'CONCLUIDA', 'CANCELADA'))

ALTER TABLE public.remessas
  ADD COLUMN IF NOT EXISTS origem_tipo text NOT NULL DEFAULT 'SEM_DOCUMENTO',
  ADD COLUMN IF NOT EXISTS origem_ref text,
  ADD COLUMN IF NOT EXISTS conferido_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz,
  ADD COLUMN IF NOT EXISTS divergencia_motivo text

ALTER TABLE public.remessas DROP CONSTRAINT IF EXISTS remessas_origem_tipo_check

ALTER TABLE public.remessas ADD CONSTRAINT remessas_origem_tipo_check
  CHECK (origem_tipo IN ('NFE', 'ORDEM_COMPRA', 'SEM_DOCUMENTO'))

COMMENT ON COLUMN public.remessas.origem_tipo IS
  'Origem da expectativa do que deveria chegar. Determina o pre-preenchimento, nunca o comportamento.'

COMMENT ON COLUMN public.remessas.origem_ref IS
  'Chave da NF-e, id da ordem de compra, ou NULL quando nao ha documento.'

-- ---------------------------------------------------------------------------
-- 2. registrar_conferencia_remessa — a etapa que faltava
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_conferencia_remessa(
  p_remessa_id uuid,
  p_itens jsonb,
  p_divergencia_motivo text DEFAULT NULL
)
RETURNS TABLE (o_status text, o_itens_conferidos integer, o_itens_divergentes integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_it jsonb;
  v_produto_id uuid;
  v_qtd numeric;
  v_conferidos integer := 0;
  v_divergentes integer := 0;
  v_pendentes integer;
  v_novo_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RECEBIMENTO_AUTH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'RECEBIMENTO_PERFIL';
  END IF;

  SELECT rm.status INTO v_status
  FROM public.remessas rm
  WHERE rm.id = p_remessa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECEBIMENTO_NAO_ENCONTRADO';
  END IF;

  -- Só recebimento aberto aceita contagem. CONFERIDO/DIVERGENTE aceitam
  -- recontagem: quem contou errado tem direito de contar de novo.
  IF v_status NOT IN ('RASCUNHO', 'EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE') THEN
    RAISE EXCEPTION 'RECEBIMENTO_STATUS_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'RECEBIMENTO_ITENS_VAZIOS';
  END IF;

  FOR v_it IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto_id := NULLIF(BTRIM(COALESCE(v_it->>'produto_id', '')), '')::uuid;
    v_qtd := (v_it->>'quantidade_conferida')::numeric;

    IF v_produto_id IS NULL THEN
      RAISE EXCEPTION 'RECEBIMENTO_ITENS_VAZIOS';
    END IF;
    -- Zero é resposta legítima ("contei, não veio"); negativo não é.
    IF v_qtd IS NULL OR v_qtd < 0 THEN
      RAISE EXCEPTION 'RECEBIMENTO_QTD_CONFERIDA_INVALIDA';
    END IF;

    UPDATE public.remessa_itens i
    SET quantidade_conferida = v_qtd
    WHERE i.remessa_id = p_remessa_id
      AND i.produto_id = v_produto_id;

    IF FOUND THEN
      v_conferidos := v_conferidos + 1;
    END IF;
  END LOOP;

  SELECT
    COUNT(*) FILTER (WHERE i.quantidade_conferida IS NULL),
    COUNT(*) FILTER (WHERE i.quantidade_conferida IS DISTINCT FROM i.quantidade_esperada
                       AND i.quantidade_conferida IS NOT NULL)
  INTO v_pendentes, v_divergentes
  FROM public.remessa_itens i
  WHERE i.remessa_id = p_remessa_id;

  -- O status é DERIVADO dos itens, nunca escolhido por quem chama.
  IF v_pendentes > 0 THEN
    v_novo_status := 'EM_CONFERENCIA';
  ELSIF v_divergentes > 0 THEN
    v_novo_status := 'DIVERGENTE';
  ELSE
    v_novo_status := 'CONFERIDO';
  END IF;

  UPDATE public.remessas
  SET status = v_novo_status,
      conferido_por = v_uid,
      conferido_em = now(),
      divergencia_motivo = COALESCE(NULLIF(BTRIM(COALESCE(p_divergencia_motivo, '')), ''), divergencia_motivo)
  WHERE id = p_remessa_id;

  RETURN QUERY SELECT v_novo_status, v_conferidos, v_divergentes;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_conferencia_remessa(uuid, jsonb, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_conferencia_remessa(uuid, jsonb, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_conferencia_remessa(uuid, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.registrar_conferencia_remessa IS
  'Onda B — registra a contagem fisica. Status derivado dos itens: EM_CONFERENCIA (falta contar), '
  'DIVERGENTE (contado <> esperado) ou CONFERIDO. Aceita recontagem.';

-- ---------------------------------------------------------------------------
-- 3. confirmar_remessa_entrada — agora exige conferência
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirmar_remessa_entrada(p_remessa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_it record;
  v_qtd numeric;
  v_status text;
  v_pendentes integer;
  v_tipo text := 'ENTRADA_REMessa_LOJA';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'REMESSA_AUTH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'REMESSA_PERFIL';
  END IF;

  SELECT rm.status INTO v_status
  FROM public.remessas rm
  WHERE rm.id = p_remessa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECEBIMENTO_NAO_ENCONTRADO';
  END IF;

  -- Só entra estoque quem passou pela conferência. Confirmar direto de
  -- EM_CONFERENCIA era o buraco que esta onda fecha.
  IF v_status NOT IN ('CONFERIDO', 'DIVERGENTE') THEN
    RAISE EXCEPTION 'REMESSA_STATUS_INVALIDO';
  END IF;

  SELECT COUNT(*) INTO v_pendentes
  FROM public.remessa_itens i
  WHERE i.remessa_id = p_remessa_id
    AND i.quantidade_conferida IS NULL;

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'RECEBIMENTO_CONFERENCIA_PENDENTE';
  END IF;

  FOR v_it IN
    -- Sem COALESCE: entra no estoque a quantidade CONTADA, nunca a esperada.
    SELECT i.produto_id, i.quantidade_conferida AS qtd
    FROM public.remessa_itens i
    WHERE i.remessa_id = p_remessa_id
  LOOP
    v_qtd := v_it.qtd;
    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.estoque (loja_id, produto_id, quantidade_atual, estoque_minimo)
    SELECT rm.loja_id, v_it.produto_id, v_qtd, 0
    FROM public.remessas rm
    WHERE rm.id = p_remessa_id
    ON CONFLICT (loja_id, produto_id) DO UPDATE
      SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
          version = public.estoque.version + 1,
          updated_at = now();

    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id
    )
    SELECT
      rm.loja_id,
      v_it.produto_id,
      v_tipo,
      v_qtd,
      p_remessa_id,
      v_uid
    FROM public.remessas rm
    WHERE rm.id = p_remessa_id;
  END LOOP;

  UPDATE public.remessas
  SET status = 'CONCLUIDA', finalized_at = now()
  WHERE id = p_remessa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_remessa_entrada(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.confirmar_remessa_entrada(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.confirmar_remessa_entrada(uuid) TO service_role;

COMMENT ON FUNCTION public.confirmar_remessa_entrada IS
  'Onda B — unico ponto que move saldo no recebimento. Exige status CONFERIDO ou DIVERGENTE e '
  'todos os itens contados. Da entrada na quantidade CONTADA (sem COALESCE com a esperada).';
