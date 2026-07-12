-- ============================================================
-- Migration 108: Contas a Pagar — schema correto + RPC pagamento
--
-- Produção: contas_pagar não existe → CREATE TABLE com nomes
--           corretos conforme o código TypeScript.
-- Dev (migration 104 já aplicada): colunas são renomeadas e
--           colunas ausentes são adicionadas de forma idempotente.
-- Cria contas_pagar_pagamentos e o RPC registrar_pagamento_contas_pagar.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Criar tabela com schema correto (só executa se ainda não existe)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  nfe_importacao_id   uuid           REFERENCES public.importacoes_nfe(id) ON DELETE CASCADE,
  fornecedor_id       uuid           NOT NULL REFERENCES public.fornecedores(id),
  loja_id             uuid           NOT NULL REFERENCES public.lojas(id),
  nfe_numero          text,
  descricao           text,
  vencimento          date           NOT NULL,
  valor_total         numeric(14, 2) NOT NULL CHECK (valor_total > 0),
  valor_pago          numeric(14, 2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0),
  status              text           NOT NULL DEFAULT 'PENDENTE'
                                     CHECK (status IN ('PENDENTE','PARCIAL','PAGO','ATRASADO','CANCELADO')),
  cancelamento_motivo text,
  cancelamento_em     timestamptz,
  observacao          text,
  criado_em           timestamptz    NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reconciliar schema da migration 104 (dev) — renomear colunas
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'importacao_nfe_id'
  ) THEN
    ALTER TABLE public.contas_pagar RENAME COLUMN importacao_nfe_id TO nfe_importacao_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'numero_duplicata'
  ) THEN
    ALTER TABLE public.contas_pagar RENAME COLUMN numero_duplicata TO nfe_numero;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'data_vencimento'
  ) THEN
    ALTER TABLE public.contas_pagar RENAME COLUMN data_vencimento TO vencimento;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'valor'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'valor_total'
  ) THEN
    ALTER TABLE public.contas_pagar RENAME COLUMN valor TO valor_total;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.contas_pagar RENAME COLUMN created_at TO criado_em;
  END IF;
END $$;

-- pago_em não tem equivalente direto no novo schema (substituído por valor_pago + cancelamento_em)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'pago_em'
  ) THEN
    ALTER TABLE public.contas_pagar DROP COLUMN pago_em;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Adicionar colunas ausentes (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'valor_pago'
  ) THEN
    ALTER TABLE public.contas_pagar
      ADD COLUMN valor_pago numeric(14, 2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'descricao'
  ) THEN
    ALTER TABLE public.contas_pagar ADD COLUMN descricao text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'cancelamento_motivo'
  ) THEN
    ALTER TABLE public.contas_pagar ADD COLUMN cancelamento_motivo text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contas_pagar' AND column_name = 'cancelamento_em'
  ) THEN
    ALTER TABLE public.contas_pagar ADD COLUMN cancelamento_em timestamptz;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Corrigir constraint de status (migration 104 usava lowercase)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_constraint text;
BEGIN
  -- Encontrar e remover constraint legada com valores lowercase
  SELECT c.conname INTO v_constraint
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
     AND t.relname = 'contas_pagar'
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) LIKE '%pendente%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.contas_pagar DROP CONSTRAINT %I', v_constraint);
    -- Migrar dados existentes para uppercase
    UPDATE public.contas_pagar SET status = UPPER(status) WHERE status ~ '[a-z]';
    ALTER TABLE public.contas_pagar
      ADD CONSTRAINT contas_pagar_status_check
      CHECK (status IN ('PENDENTE','PARCIAL','PAGO','ATRASADO','CANCELADO'));
    ALTER TABLE public.contas_pagar ALTER COLUMN status SET DEFAULT 'PENDENTE';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Índices
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contas_pagar_loja
  ON public.contas_pagar (loja_id);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_fornecedor
  ON public.contas_pagar (fornecedor_id);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento
  ON public.contas_pagar (loja_id, vencimento);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_status
  ON public.contas_pagar (loja_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Tabela contas_pagar_pagamentos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contas_pagar_pagamentos (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id         uuid           NOT NULL REFERENCES public.contas_pagar(id) ON DELETE CASCADE,
  valor            numeric(14, 2) NOT NULL CHECK (valor > 0),
  forma_pagamento  text           NOT NULL
                                  CHECK (forma_pagamento IN ('DINHEIRO','PIX','CARTAO','BOLETO','TRANSF')),
  data_pagamento   timestamptz    NOT NULL DEFAULT now(),
  observacao       text,
  usuario_id       uuid           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpp_conta
  ON public.contas_pagar_pagamentos (conta_id);

CREATE INDEX IF NOT EXISTS idx_cpp_usuario
  ON public.contas_pagar_pagamentos (usuario_id) WHERE usuario_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_pagar_pagamentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contas_pagar' AND policyname = 'contas_pagar_gerente'
  ) THEN
    CREATE POLICY contas_pagar_gerente ON public.contas_pagar
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.usuarios u
          WHERE u.id = auth.uid()
            AND u.perfil IN ('GERENTE','DONO','ADMIN')
            AND (u.perfil IN ('DONO','ADMIN') OR u.loja_id = contas_pagar.loja_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.usuarios u
          WHERE u.id = auth.uid()
            AND u.perfil IN ('GERENTE','DONO','ADMIN')
            AND (u.perfil IN ('DONO','ADMIN') OR u.loja_id = contas_pagar.loja_id)
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contas_pagar_pagamentos' AND policyname = 'cpp_gerente'
  ) THEN
    CREATE POLICY cpp_gerente ON public.contas_pagar_pagamentos
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.contas_pagar cp
          JOIN public.usuarios u ON u.id = auth.uid()
          WHERE cp.id = contas_pagar_pagamentos.conta_id
            AND u.perfil IN ('GERENTE','DONO','ADMIN')
            AND (u.perfil IN ('DONO','ADMIN') OR u.loja_id = cp.loja_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.contas_pagar cp
          JOIN public.usuarios u ON u.id = auth.uid()
          WHERE cp.id = contas_pagar_pagamentos.conta_id
            AND u.perfil IN ('GERENTE','DONO','ADMIN')
            AND (u.perfil IN ('DONO','ADMIN') OR u.loja_id = cp.loja_id)
        )
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC: registrar_pagamento_contas_pagar
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_pagamento_contas_pagar(
  p_conta_id   uuid,
  p_valor      numeric,
  p_forma      text,
  p_data       timestamptz DEFAULT now(),
  p_observacao text        DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_perfil      text;
  v_loja_usuario uuid;
  v_conta       record;
  v_novo_pago   numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PAGAMENTO_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'PAGAMENTO_PERFIL';
  END IF;

  SELECT id, loja_id, valor_total, valor_pago, status
    INTO v_conta
    FROM public.contas_pagar
   WHERE id = p_conta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAGAMENTO_CONTA_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_conta.loja_id THEN
    RAISE EXCEPTION 'PAGAMENTO_LOJA';
  END IF;

  IF v_conta.status IN ('PAGO','CANCELADO') THEN
    RAISE EXCEPTION 'PAGAMENTO_CONTA_ENCERRADA';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'PAGAMENTO_VALOR_INVALIDO';
  END IF;

  IF p_forma IS NULL OR p_forma NOT IN ('DINHEIRO','PIX','CARTAO','BOLETO','TRANSF') THEN
    RAISE EXCEPTION 'PAGAMENTO_FORMA_INVALIDA';
  END IF;

  INSERT INTO public.contas_pagar_pagamentos (
    conta_id, valor, forma_pagamento, data_pagamento, observacao, usuario_id
  ) VALUES (
    p_conta_id, p_valor, p_forma, COALESCE(p_data, now()), p_observacao, v_uid
  );

  v_novo_pago := v_conta.valor_pago + p_valor;

  UPDATE public.contas_pagar
     SET valor_pago = v_novo_pago,
         status = CASE
                    WHEN v_novo_pago >= valor_total THEN 'PAGO'
                    ELSE 'PARCIAL'
                  END
   WHERE id = p_conta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Atualizar importar_nfe_transacao com os nomes de coluna corretos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.importar_nfe_transacao(
  p_chave_acesso     text,
  p_numero_nf        text,
  p_fornecedor_cnpj  text,
  p_fornecedor_nome  text,
  p_loja_id          uuid,
  p_itens            jsonb,
  p_atualizar_custo  boolean DEFAULT true,
  p_duplicatas       jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_cnpj text;
  v_forn_id uuid;
  v_imp_id uuid;
  el jsonb;
  dup jsonb;
  v_gtin text;
  v_ref text;
  v_nome text;
  v_q_com numeric;
  v_fator numeric;
  v_v_un numeric;
  v_u_com text;
  v_ncm text;
  v_item_atualiza_custo boolean;
  v_q_entrada numeric;
  v_custo_unit numeric;
  v_produto_id uuid;
  v_atual numeric;
  v_obs text;
  v_n int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  v_cnpj := regexp_replace(COALESCE(p_fornecedor_cnpj, ''), '\D', '', 'g');
  IF length(v_cnpj) <> 14 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CNPJ_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_ITENS_VAZIO';
  END IF;

  IF length(trim(COALESCE(p_chave_acesso, ''))) <> 44 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CHAVE_INVALIDA';
  END IF;

  INSERT INTO public.fornecedores (cnpj, nome)
  VALUES (v_cnpj, COALESCE(NULLIF(trim(p_fornecedor_nome), ''), 'Fornecedor'))
  ON CONFLICT (cnpj) DO UPDATE SET
    nome = EXCLUDED.nome,
    updated_at = now()
  RETURNING id INTO v_forn_id;

  INSERT INTO public.importacoes_nfe (chave_acesso, numero_nf, fornecedor_id, loja_id, usuario_id)
  VALUES (trim(p_chave_acesso), NULLIF(trim(p_numero_nf), ''), v_forn_id, p_loja_id, v_uid)
  ON CONFLICT (chave_acesso) DO NOTHING
  RETURNING id INTO v_imp_id;

  IF v_imp_id IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_DUPLICADA';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_nome := COALESCE(NULLIF(trim(el->>'nome_produto'), ''), 'Produto sem nome');
    v_gtin := NULLIF(trim(COALESCE(el->>'gtin', '')), '');
    v_ref  := COALESCE(NULLIF(trim(el->>'ref_fornecedor'), ''), '');
    IF v_ref = '' THEN
      RAISE EXCEPTION 'IMPORT_NFE_REF_OBRIGATORIA';
    END IF;

    v_q_com := COALESCE((el->>'q_com')::numeric, 0);
    v_fator := COALESCE((el->>'fator')::numeric, 1);
    v_v_un  := COALESCE((el->>'v_un_com')::numeric, 0);
    v_u_com := NULLIF(trim(COALESCE(el->>'u_com', '')), '');
    v_ncm   := NULLIF(trim(COALESCE(el->>'ncm', '')), '');
    v_item_atualiza_custo := COALESCE((el->>'atualizar_custo')::boolean, p_atualizar_custo);

    IF v_fator IS NULL OR v_fator <= 0 THEN RAISE EXCEPTION 'IMPORT_NFE_FATOR_INVALIDO'; END IF;
    IF v_q_com IS NULL OR v_q_com < 0 THEN RAISE EXCEPTION 'IMPORT_NFE_QTD_INVALIDA'; END IF;

    v_q_entrada := v_q_com * v_fator;
    IF v_q_entrada <= 0 THEN RAISE EXCEPTION 'IMPORT_NFE_QTD_ENTRADA_ZERO'; END IF;

    v_custo_unit := v_v_un / v_fator;
    IF v_custo_unit IS NULL OR v_custo_unit < 0 THEN RAISE EXCEPTION 'IMPORT_NFE_CUSTO_INVALIDO'; END IF;

    v_produto_id := NULL;
    IF v_gtin IS NOT NULL AND length(v_gtin) >= 8 THEN
      SELECT p.id INTO v_produto_id FROM public.produtos p WHERE p.codigo_barras = v_gtin AND p.loja_id = p_loja_id LIMIT 1;
    END IF;
    IF v_produto_id IS NULL THEN
      SELECT p.id INTO v_produto_id
        FROM public.produtos p
       WHERE p.fornecedor_id = v_forn_id AND p.referencia_fornecedor = v_ref AND p.loja_id = p_loja_id
       LIMIT 1;
    END IF;

    IF v_produto_id IS NULL THEN
      INSERT INTO public.produtos (
        nome, codigo_barras, fornecedor_id, referencia_fornecedor,
        origem, tem_nf, ativo, loja_id
      )
      VALUES (
        v_nome,
        CASE WHEN v_gtin IS NOT NULL AND length(v_gtin) >= 8 THEN v_gtin ELSE NULL END,
        v_forn_id, v_ref,
        'brasil_nf', true, true,
        p_loja_id
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_produto_id;

      IF v_produto_id IS NULL THEN
        IF v_gtin IS NOT NULL AND length(v_gtin) >= 8 THEN
          SELECT p.id INTO v_produto_id FROM public.produtos p WHERE p.codigo_barras = v_gtin AND p.loja_id = p_loja_id LIMIT 1;
        END IF;
        IF v_produto_id IS NULL THEN
          SELECT p.id INTO v_produto_id FROM public.produtos p WHERE p.fornecedor_id = v_forn_id AND p.referencia_fornecedor = v_ref AND p.loja_id = p_loja_id LIMIT 1;
        END IF;
      END IF;

      IF v_produto_id IS NOT NULL THEN
        INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
        VALUES (v_produto_id, p_loja_id, 0, 0, 0)
        ON CONFLICT (loja_id, produto_id) DO NOTHING;
      END IF;
    ELSE
      IF v_item_atualiza_custo AND v_custo_unit > 0 THEN
        UPDATE public.produtos SET preco_custo = v_custo_unit WHERE id = v_produto_id;
      END IF;
    END IF;

    IF v_produto_id IS NULL THEN CONTINUE; END IF;

    SELECT e.quantidade_atual INTO v_atual
      FROM public.estoque e
     WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id;

    IF v_atual IS NULL THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_produto_id, p_loja_id, v_q_entrada, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version = public.estoque.version + 1,
            updated_at = now();
    ELSE
      UPDATE public.estoque e
        SET quantidade_atual = e.quantidade_atual + v_q_entrada,
            version = e.version + 1,
            updated_at = now()
       WHERE e.loja_id = p_loja_id AND e.produto_id = v_produto_id;
    END IF;

    v_obs := format(
      'NF-e importada | chave=%s | ref=%s | q_xml=%s | fator=%s | NCM=%s',
      trim(p_chave_acesso), v_ref, v_q_com::text, v_fator::text, COALESCE(v_ncm, '-')
    );

    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
    ) VALUES (
      p_loja_id, v_produto_id, 'ENTRADA_NFE', v_q_entrada, NULL, v_uid, v_obs
    );

    v_n := v_n + 1;
  END LOOP;

  -- Inserir duplicatas (contas a pagar) — coluna nfe_importacao_id e vencimento corretos
  IF p_duplicatas IS NOT NULL
     AND jsonb_typeof(p_duplicatas) = 'array'
     AND jsonb_array_length(p_duplicatas) > 0
  THEN
    FOR dup IN SELECT value FROM jsonb_array_elements(p_duplicatas) AS t(value)
    LOOP
      BEGIN
        INSERT INTO public.contas_pagar (
          nfe_importacao_id, fornecedor_id, loja_id,
          nfe_numero, vencimento, valor_total, status
        ) VALUES (
          v_imp_id,
          v_forn_id,
          p_loja_id,
          NULLIF(trim(COALESCE(dup->>'numero', '')), ''),
          (dup->>'data_vencimento')::date,
          (dup->>'valor')::numeric,
          'PENDENTE'
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'importacao_id', v_imp_id,
    'itens_processados', v_n
  );
END;
$$;

REVOKE ALL ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean, jsonb) TO service_role;
