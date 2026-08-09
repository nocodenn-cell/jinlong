-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260805213357
-- name: 296_nfe_conferencia
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

-- ============================================================================
-- 296 — FLX-05: conferência antes de creditar estoque e gerar contas a pagar
-- na importação de NF-e.
--
-- Decisão de arquitetura (opção A, mesma linha do FLX-04/295): conferência
-- NATIVA em tabelas próprias de importacoes_nfe, sem rotear por `remessas`.
--
-- Por que não `remessas` (opção B foi considerada e descartada — ver
-- docs/auditoria/FLX-05_nfe_sem_conferencia.md §3-4):
--   - A Onda B (20260801120000_recebimento_conferencia_explicita.sql) está
--     marcada como aplicada em supabase_migrations.schema_migrations, mas
--     seu efeito NÃO está no banco: `remessas` não tem origem_tipo/origem_ref/
--     conferido_por/conferido_em/divergencia_motivo, e
--     `registrar_conferencia_remessa` não existe em pg_proc. Confirmado por
--     consulta direta em produção em 2026-08-05 (mesmo dia desta migration).
--     Rotear NF-e por remessas exigiria primeiro reparar essa migration
--     divergente — escopo maior e risco maior do que este ticket pede.
--   - `remessas` já tem uso real (2 linhas, ambas concluídas, sem divergência)
--     fora deste pacote — mesmo critério que manteve OC longe de remessas
--     no FLX-04.
--   - Nativa é a terceira implementação da mesma máquina de estados
--     (OC, remessa-na-migration, agora NF-e). Custo aceito conscientemente:
--     consistência de padrão com FLX-04 pesa mais do que evitar a terceira
--     cópia, dado que a segunda cópia (remessa) nem está viva.
--
-- Pré-condições verificadas em produção antes de escrever esta migration:
--   - fornecedores: 0 linhas. importacoes_nfe: 0 linhas. contas_pagar: 0
--     linhas. Zero backfill, zero risco de dado — importar_nfe_transacao
--     nunca rodou de verdade (fornecedores=0 é efeito colateral obrigatório
--     de toda chamada seria; sua ausência prova que a RPC nunca completou).
--   - Único consumidor de código: app/gerente/estoque/importar-nfe/actions.ts
--     → InventoryMovementWriter.importNfe → RPC importar_nfe_transacao.
--     Assinatura da RPC (8 args, com p_duplicatas) PRESERVADA — o retorno
--     muda de semântica (deixa de significar "creditado", passa a significar
--     "registrado, aguardando conferência"), mas a forma do jsonb não muda.
--
-- Achado colateral (fora do escopo do FLX-05, corrigido aqui por construção
-- porque esta migration já reescreve a função inteira): o corpo REALMENTE
-- vigente em produção não é o do arquivo 104_contas_pagar_nfe.sql — é o da
-- migration 294 (fornecedores_multi_tenant), que reescreveu
-- importar_nfe_transacao por completo (VINCULAR/CRIAR, De-Para em
-- vinculos_fornecedor_produto, produto rascunho DRAFT, v_novos/v_vinculados).
-- Confirmado via pg_get_functiondef em produção, não pelo arquivo de
-- migration. Essa versão de 294 insere duplicatas em contas_pagar usando
-- nomes de coluna pré-108 (numero_duplicata/data_vencimento/valor) e status
-- minúsculo ('pendente') — 108 renomeou para nfe_numero/vencimento/
-- valor_total e o CHECK de status exige maiúsculo. Teria falhado com "column
-- does not exist" ou violação de CHECK na primeira NF-e importada com
-- duplicata, independente deste ticket. Nunca disparou porque a função nunca
-- rodou de verdade. Corrigido por construção: duplicatas agora vão para
-- importacoes_nfe_duplicatas (nomes de coluna próprios) e só viram
-- contas_pagar em confirmar_importacao_nfe, já com os nomes/maiúsculas
-- corretos.
--
-- Defeito fechado: importar_nfe_transacao creditava estoque com
-- `q_com * fator` (declarado no XML) e gerava contas_pagar com o valor de
-- face da duplicata, na mesma chamada, sem qualquer conferência física —
-- mesma classe de SSOT-01/FLX-04 (dado que move dinheiro/estoque deve vir de
-- estado gravado no servidor após verificação, nunca de documento declarado
-- ou parâmetro do cliente).
--
-- Não mexe em: `remessas`/`remessa_itens`, `ordens_compra`/`ordens_compra_itens`
-- (fora de escopo), cadastro/publicação/venda de produto (ADR-006 preservado).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. importacoes_nfe ganha status — gate de "já confirmada" (mesmo papel que
--    ordens_compra.status EM_TRANSITO/RECEBIDA cumpre para OC).
-- ============================================================================

ALTER TABLE public.importacoes_nfe
  ADD COLUMN status text NOT NULL DEFAULT 'EM_CONFERENCIA';

ALTER TABLE public.importacoes_nfe
  ADD CONSTRAINT importacoes_nfe_status_check
    CHECK (status IN ('EM_CONFERENCIA', 'CONCLUIDA'));

COMMENT ON COLUMN public.importacoes_nfe.status IS
  'FLX-05 (2026-08-05). EM_CONFERENCIA=itens ainda sem contagem completa; CONCLUIDA=confirmada, estoque e contas_pagar já gerados. Terminal — não há caminho de volta.';

-- ============================================================================
-- 2. importacoes_nfe_itens — snapshot por linha do XML (hoje só existia como
--    payload transiente + agregado em movimentos_estoque_log). Sem isso não
--    há o que conferir item a item.
-- ============================================================================

CREATE TABLE public.importacoes_nfe_itens (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_nfe_id     uuid NOT NULL REFERENCES public.importacoes_nfe(id) ON DELETE CASCADE,
  produto_id            uuid NOT NULL REFERENCES public.produtos(id),
  quantidade_nfe        numeric(10,3) NOT NULL CHECK (quantidade_nfe > 0),
  custo_unitario        numeric(10,2) NOT NULL CHECK (custo_unitario >= 0),
  atualizar_custo       boolean NOT NULL DEFAULT true,
  quantidade_conferida  numeric(10,3),
  divergencia_obs       text,
  status_conferencia    text NOT NULL DEFAULT 'EM_CONFERENCIA',
  conferido_por         uuid REFERENCES public.usuarios(id),
  conferido_em          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes_nfe_itens
  ADD CONSTRAINT importacoes_nfe_itens_status_conferencia_check
    CHECK (status_conferencia IN ('EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE'));

CREATE INDEX idx_importacoes_nfe_itens_importacao
  ON public.importacoes_nfe_itens (importacao_nfe_id);

COMMENT ON TABLE public.importacoes_nfe_itens IS
  'FLX-05 (2026-08-05). Uma linha por item do XML. quantidade_nfe é o declarado (q_com*fator); quantidade_conferida só existe após registrar_conferencia_nfe.';
COMMENT ON COLUMN public.importacoes_nfe_itens.quantidade_nfe IS
  'Declarado pela nota. Nunca creditado diretamente — confirmar_importacao_nfe usa quantidade_conferida.';

ALTER TABLE public.importacoes_nfe_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY importacoes_nfe_itens_gerente_all
  ON public.importacoes_nfe_itens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.importacoes_nfe imp
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE imp.id = importacoes_nfe_itens.importacao_nfe_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = imp.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.importacoes_nfe imp
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE imp.id = importacoes_nfe_itens.importacao_nfe_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = imp.loja_id)
    )
  );

-- ============================================================================
-- 3. importacoes_nfe_duplicatas — as duplicatas do XML ficam pendentes aqui;
--    só viram contas_pagar em confirmar_importacao_nfe. Antes, INSERT direto
--    em contas_pagar acontecia na mesma chamada que lia o XML.
-- ============================================================================

CREATE TABLE public.importacoes_nfe_duplicatas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_nfe_id  uuid NOT NULL REFERENCES public.importacoes_nfe(id) ON DELETE CASCADE,
  numero_duplicata   text,
  data_vencimento    date NOT NULL,
  valor              numeric(14,2) NOT NULL CHECK (valor > 0),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_importacoes_nfe_duplicatas_importacao
  ON public.importacoes_nfe_duplicatas (importacao_nfe_id);

COMMENT ON TABLE public.importacoes_nfe_duplicatas IS
  'FLX-05 (2026-08-05). Duplicatas lidas do XML, pendentes até confirmar_importacao_nfe materializar em contas_pagar.';

ALTER TABLE public.importacoes_nfe_duplicatas ENABLE ROW LEVEL SECURITY;

CREATE POLICY importacoes_nfe_duplicatas_gerente_all
  ON public.importacoes_nfe_duplicatas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.importacoes_nfe imp
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE imp.id = importacoes_nfe_duplicatas.importacao_nfe_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = imp.loja_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.importacoes_nfe imp
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE imp.id = importacoes_nfe_duplicatas.importacao_nfe_id
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = imp.loja_id)
    )
  );

-- ============================================================================
-- 4. importar_nfe_transacao — reescrita a partir do corpo REALMENTE vigente em
--    produção (confirmado via pg_get_functiondef em 2026-08-05, não a partir
--    do arquivo 104 — ver achado colateral no cabeçalho desta migration).
--    Assinatura idêntica (8 args). Para de creditar estoque, atualizar custo
--    de produto já existente e gerar contas_pagar; passa a gravar
--    importacoes_nfe_itens (EM_CONFERENCIA) e importacoes_nfe_duplicatas
--    (pendente). Idempotência por chave_acesso preservada. Toda a lógica de
--    catálogo (VINCULAR/CRIAR, De-Para em vinculos_fornecedor_produto, rascunho
--    DRAFT, backfill de NCM/GTIN) preservada sem alteração — é dado de
--    catálogo, sem exposição financeira/estoque, fora do escopo do FLX-05.
-- ============================================================================

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
SET search_path TO 'public'
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
  v_gtin_valido text;
  v_ref text;
  v_nome text;
  v_q_com numeric;
  v_fator numeric;
  v_v_un numeric;
  v_u_com text;
  v_ncm text;
  v_ncm_valido text;
  v_acao text;
  v_destino uuid;
  v_item_atualiza_custo boolean;
  v_q_entrada numeric;
  v_custo_unit numeric;
  v_produto_id uuid;
  v_n int := 0;
  v_novos int := 0;
  v_vinculados int := 0;
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

  INSERT INTO public.fornecedores (cnpj, nome, loja_id)
  VALUES (v_cnpj, COALESCE(NULLIF(trim(p_fornecedor_nome), ''), 'Fornecedor'), p_loja_id)
  ON CONFLICT (loja_id, cnpj) DO UPDATE SET nome = EXCLUDED.nome, updated_at = now()
  RETURNING id INTO v_forn_id;

  INSERT INTO public.importacoes_nfe (chave_acesso, numero_nf, fornecedor_id, loja_id, usuario_id)
  VALUES (trim(p_chave_acesso), NULLIF(trim(p_numero_nf), ''), v_forn_id, p_loja_id, v_uid)
  ON CONFLICT (chave_acesso) DO NOTHING
  RETURNING id INTO v_imp_id;

  IF v_imp_id IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_DUPLICADA';
  END IF;

  -- Processar itens: cadastro/vínculo de produto continua imediato (dado de
  -- catálogo, sem exposição financeira/estoque). O que muda a partir daqui:
  -- nada mais credita estoque nem atualiza custo — só grava
  -- importacoes_nfe_itens para conferência.
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
    v_acao  := upper(NULLIF(trim(COALESCE(el->>'acao', '')), ''));
    v_destino := NULLIF(trim(COALESCE(el->>'produto_id_destino', '')), '')::uuid;

    v_ncm_valido := CASE WHEN v_ncm ~ '^\d{8}$' THEN v_ncm ELSE NULL END;
    v_gtin_valido := CASE WHEN v_gtin IS NOT NULL AND v_gtin ~ '^\d{8,}$' THEN v_gtin ELSE NULL END;

    IF v_fator IS NULL OR v_fator <= 0 THEN RAISE EXCEPTION 'IMPORT_NFE_FATOR_INVALIDO'; END IF;
    IF v_q_com IS NULL OR v_q_com < 0 THEN RAISE EXCEPTION 'IMPORT_NFE_QTD_INVALIDA'; END IF;

    v_q_entrada := v_q_com * v_fator;
    IF v_q_entrada <= 0 THEN RAISE EXCEPTION 'IMPORT_NFE_QTD_ENTRADA_ZERO'; END IF;

    v_custo_unit := v_v_un / v_fator;
    IF v_custo_unit IS NULL OR v_custo_unit < 0 THEN RAISE EXCEPTION 'IMPORT_NFE_CUSTO_INVALIDO'; END IF;

    v_produto_id := NULL;

    IF v_destino IS NOT NULL THEN
      SELECT p.id INTO v_produto_id FROM public.produtos p
       WHERE p.id = v_destino AND p.loja_id = p_loja_id LIMIT 1;
      IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'IMPORT_NFE_DESTINO_INVALIDO';
      END IF;
    END IF;

    IF v_produto_id IS NULL THEN
      SELECT v.produto_id INTO v_produto_id FROM public.vinculos_fornecedor_produto v
       WHERE v.loja_id = p_loja_id AND v.fornecedor_id = v_forn_id AND v.ref_fornecedor = v_ref LIMIT 1;
    END IF;

    IF v_produto_id IS NULL AND v_gtin_valido IS NOT NULL THEN
      SELECT p.id INTO v_produto_id FROM public.produtos p
       WHERE p.codigo_barras = v_gtin_valido AND p.loja_id = p_loja_id LIMIT 1;
    END IF;

    IF v_produto_id IS NULL THEN
      SELECT p.id INTO v_produto_id FROM public.produtos p
       WHERE p.fornecedor_id = v_forn_id AND p.referencia_fornecedor = v_ref AND p.loja_id = p_loja_id LIMIT 1;
    END IF;

    IF v_produto_id IS NULL THEN
      IF v_acao = 'VINCULAR' THEN
        RAISE EXCEPTION 'IMPORT_NFE_ITEM_NAO_RESOLVIDO';
      END IF;

      INSERT INTO public.produtos (
        nome, codigo_barras, fornecedor_id, referencia_fornecedor,
        ncm, preco_custo, preco_varejo, unidade_medida,
        origem, tem_nf, ativo, status_publicacao, loja_id
      )
      VALUES (
        v_nome, v_gtin_valido, v_forn_id, v_ref, v_ncm_valido,
        ROUND(v_custo_unit, 2), ROUND(GREATEST(v_custo_unit * 1.5, 0.01), 2),
        COALESCE(left(v_u_com, 16), 'UN'), 'brasil_nf', true, false, 'DRAFT', p_loja_id
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_produto_id;

      IF v_produto_id IS NULL THEN
        IF v_gtin_valido IS NOT NULL THEN
          SELECT p.id INTO v_produto_id FROM public.produtos p
           WHERE p.codigo_barras = v_gtin_valido AND p.loja_id = p_loja_id LIMIT 1;
        END IF;
        IF v_produto_id IS NULL THEN
          SELECT p.id INTO v_produto_id FROM public.produtos p
           WHERE p.fornecedor_id = v_forn_id AND p.referencia_fornecedor = v_ref AND p.loja_id = p_loja_id LIMIT 1;
        END IF;
      END IF;

      IF v_produto_id IS NOT NULL THEN
        -- Garante linha de estoque visível no catálogo, sempre zerada — o
        -- crédito só acontece em confirmar_importacao_nfe, com a quantidade
        -- CONFERIDA.
        INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
        VALUES (v_produto_id, p_loja_id, 0, 0, 0)
        ON CONFLICT (loja_id, produto_id) DO NOTHING;
        v_novos := v_novos + 1;
      END IF;
    ELSE
      -- FLX-05: custo NÃO é atualizado aqui (antes era). Move para
      -- confirmar_importacao_nfe, junto com o crédito de estoque — nada de
      -- exposição financeira muda antes da conferência. Backfill de
      -- NCM/GTIN continua imediato: é metadado de catálogo, não afeta custo
      -- nem saldo.
      UPDATE public.produtos p
         SET ncm = COALESCE(p.ncm, v_ncm_valido),
             codigo_barras = COALESCE(p.codigo_barras, v_gtin_valido),
             updated_at = now()
       WHERE p.id = v_produto_id
         AND ((p.ncm IS NULL AND v_ncm_valido IS NOT NULL) OR (p.codigo_barras IS NULL AND v_gtin_valido IS NOT NULL));

      v_vinculados := v_vinculados + 1;
    END IF;

    IF v_produto_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.vinculos_fornecedor_produto (
      loja_id, fornecedor_id, ref_fornecedor, produto_id, gtin_origem, criado_por
    )
    VALUES (p_loja_id, v_forn_id, v_ref, v_produto_id, v_gtin_valido, v_uid)
    ON CONFLICT (loja_id, fornecedor_id, ref_fornecedor) DO UPDATE
      SET produto_id = EXCLUDED.produto_id,
          gtin_origem = COALESCE(public.vinculos_fornecedor_produto.gtin_origem, EXCLUDED.gtin_origem),
          updated_at = now();

    INSERT INTO public.importacoes_nfe_itens (
      importacao_nfe_id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo
    ) VALUES (
      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo
    );

    v_n := v_n + 1;
  END LOOP;

  -- Duplicatas: pendentes até a confirmação, não mais contas_pagar direto.
  -- Nota: a versão anterior (294) inseria direto em contas_pagar usando nomes
  -- de coluna pré-108 (numero_duplicata/data_vencimento/valor/'pendente'
  -- minúsculo) — colunas renomeadas por 108 para nfe_numero/vencimento/
  -- valor_total, e o CHECK de status exige maiúsculo. Teria falhado na
  -- primeira duplicata processada. Achado colateral, corrigido aqui por
  -- construção (ver cabeçalho desta migration).
  IF p_duplicatas IS NOT NULL
     AND jsonb_typeof(p_duplicatas) = 'array'
     AND jsonb_array_length(p_duplicatas) > 0
  THEN
    FOR dup IN SELECT value FROM jsonb_array_elements(p_duplicatas) AS t(value)
    LOOP
      BEGIN
        INSERT INTO public.importacoes_nfe_duplicatas (
          importacao_nfe_id, numero_duplicata, data_vencimento, valor
        ) VALUES (
          v_imp_id,
          NULLIF(trim(COALESCE(dup->>'numero', '')), ''),
          (dup->>'data_vencimento')::date,
          (dup->>'valor')::numeric
        );
      EXCEPTION WHEN OTHERS THEN
        NULL; -- ignora duplicatas inválidas (data nula, valor zero, etc.) — igual ao comportamento anterior
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'importacao_id', v_imp_id,
    'itens_processados', v_n,
    'produtos_novos', v_novos,
    'produtos_vinculados', v_vinculados
  );
END;
$$;

COMMENT ON FUNCTION public.importar_nfe_transacao IS
  'FLX-05 (2026-08-05). Leitura + cadastro/vínculo de produto + registro para conferência. NÃO credita estoque nem gera contas_pagar — isso só acontece em confirmar_importacao_nfe, após registrar_conferencia_nfe.';

-- ============================================================================
-- 5. registrar_conferencia_nfe — grava a contagem física por item. Não move
--    estoque nem gera contas_pagar. Espelha registrar_conferencia_ordem_compra.
-- ============================================================================

CREATE FUNCTION public.registrar_conferencia_nfe(p_importacao_id uuid, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  el             jsonb;
  v_item_id      uuid;
  v_qtd_conf     numeric;
  v_qtd_nfe      numeric;
  v_div_obs      text;
  v_status       text;
  v_conferidos   int := 0;
  v_divergentes  int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, status INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_ITENS_VAZIO';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_item_id  := (el->>'item_id')::uuid;
    v_qtd_conf := (el->>'quantidade_conferida')::numeric;
    v_div_obs  := NULLIF(trim(COALESCE(el->>'divergencia_obs', '')), '');

    IF v_qtd_conf IS NULL OR v_qtd_conf < 0 THEN
      RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_QTD_INVALIDA';
    END IF;

    SELECT quantidade_nfe INTO v_qtd_nfe
      FROM public.importacoes_nfe_itens
     WHERE id = v_item_id AND importacao_nfe_id = p_importacao_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'IMPORT_NFE_ITEM_NAO_ENCONTRADO';
    END IF;

    v_status := CASE WHEN v_qtd_conf = v_qtd_nfe THEN 'CONFERIDO' ELSE 'DIVERGENTE' END;
    IF v_status = 'CONFERIDO' THEN v_conferidos := v_conferidos + 1;
    ELSE v_divergentes := v_divergentes + 1; END IF;

    UPDATE public.importacoes_nfe_itens
       SET quantidade_conferida = v_qtd_conf,
           divergencia_obs      = v_div_obs,
           status_conferencia   = v_status,
           conferido_por        = v_uid,
           conferido_em         = now()
     WHERE id = v_item_id AND importacao_nfe_id = p_importacao_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'importacao_id', p_importacao_id,
    'itens_conferidos', v_conferidos, 'itens_divergentes', v_divergentes
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) IS
  'FLX-05 (2026-08-05). Registra contagem física por item de importação de NF-e, com auditoria. Não move estoque nem gera contas_pagar — pré-requisito de confirmar_importacao_nfe.';

REVOKE ALL ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) TO service_role;

-- ============================================================================
-- 6. confirmar_importacao_nfe — único ponto que credita estoque, atualiza
--    custo e gera contas_pagar. Exige TODOS os itens conferidos (tudo-ou-nada,
--    mesmo modelo do FLX-04). Credita quantidade_conferida, nunca
--    quantidade_nfe.
-- ============================================================================

CREATE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, fornecedor_id, numero_nf, status INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  -- FLX-05: nenhum crédito de estoque sem conferência. Se qualquer item ainda
  -- está EM_CONFERENCIA, a operação inteira é recusada — tudo-ou-nada.
  SELECT count(*) INTO v_pendentes
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_PENDENTE';
  END IF;

  FOR v_it IN
    SELECT produto_id, quantidade_conferida, custo_unitario, atualizar_custo, status_conferencia
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

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_imp.loja_id,
        v_it.produto_id,
        'ENTRADA_NFE',
        v_it.quantidade_conferida,
        v_uid,
        format('Importação NF-e %s (conferido%s)', p_importacao_id::text,
               CASE WHEN v_it.status_conferencia = 'DIVERGENTE' THEN ', divergente da nota' ELSE '' END)
      );
    END IF;

    IF v_it.atualizar_custo AND v_it.custo_unitario > 0 THEN
      UPDATE public.produtos
         SET preco_custo = v_it.custo_unitario,
             updated_at  = now()
       WHERE id = v_it.produto_id;
    END IF;
  END LOOP;

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
  'FLX-05 (2026-08-05). Credita estoque e gera contas_pagar só com base em quantidade_conferida (gravada por registrar_conferencia_nfe) — nunca do XML. Exige todos os itens conferidos.';

REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_nfe_transacao(text, text, text, text, uuid, jsonb, boolean, jsonb) TO service_role;

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO — dentro da transação.
-- ============================================================================

DO $verify$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='importacoes_nfe_itens'
  ) THEN
    RAISE EXCEPTION 'MIG296_TABELA_ITENS_AUSENTE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='importacoes_nfe_duplicatas'
  ) THEN
    RAISE EXCEPTION 'MIG296_TABELA_DUPLICATAS_AUSENTE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='importacoes_nfe' AND column_name='status'
  ) THEN
    RAISE EXCEPTION 'MIG296_COLUNA_STATUS_AUSENTE';
  END IF;

  IF to_regprocedure('public.registrar_conferencia_nfe(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'MIG296_RPC_CONFERENCIA_AUSENTE';
  END IF;

  IF to_regprocedure('public.confirmar_importacao_nfe(uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIG296_RPC_CONFIRMAR_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.importar_nfe_transacao(text,text,text,text,uuid,jsonb,boolean,jsonb)'::regprocedure);
  IF position('INSERT INTO public.contas_pagar' IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG296_IMPORTAR_AINDA_GERA_CONTAS_PAGAR';
  END IF;
  IF position('quantidade_atual = public.estoque.quantidade_atual +' IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG296_IMPORTAR_AINDA_CREDITA_ESTOQUE';
  END IF;
  IF position('importacoes_nfe_itens' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG296_IMPORTAR_NAO_GRAVA_ITENS';
  END IF;

  v_def := pg_get_functiondef('public.confirmar_importacao_nfe(uuid)'::regprocedure);
  IF position('IMPORT_NFE_CONFERENCIA_PENDENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG296_GATE_CONFERENCIA_AUSENTE';
  END IF;
  IF position('quantidade_conferida' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG296_NAO_USA_QUANTIDADE_CONFERIDA';
  END IF;

  IF has_function_privilege('anon', 'public.registrar_conferencia_nfe(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.confirmar_importacao_nfe(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG296_GRANT_ANON_INDEVIDO';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.registrar_conferencia_nfe(uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.confirmar_importacao_nfe(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG296_GRANT_AUTHENTICATED_AUSENTE';
  END IF;

  RAISE NOTICE '296 OK — FLX-05 verificado no efeito (tabelas, RPCs, gate, grants)';
END
$verify$;

COMMIT;
