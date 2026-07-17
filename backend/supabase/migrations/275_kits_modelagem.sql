-- 275 — Fase 5, Entrega 8a: modelagem de dados de Kits de produto.
--
-- Escopo desta migration: SÓ modelagem. Nenhuma RPC de venda (v4) é tocada.
-- `finalizar_venda_transacional_canonica_v4` está congelada ("FREEZE: CORE
-- TRANSACIONAL — não adicionar branches de execução") e seu loop de itens
-- baixa estoque 1:1 pelo produto_id de cada linha de p_itens. Um kit precisa
-- aparecer como 1 linha no recibo/preço mas baixar estoque de N componentes
-- — essas duas coisas divergem, e resolver isso dentro da v4 congelada exige
-- validação contra um banco real que este ambiente não tem. Decisão desta
-- sessão: modelar os dados agora (aditivo, zero risco) e projetar o serviço
-- de expansão (InventoryExpansionService, no TypeScript) já pronto para ser
-- plugado numa entrega futura, com ambiente adequado para testar a
-- integração com a v4 sem risco de corromper estoque/kardex em produção.
--
-- Snapshot de composição (decisão explícita desta sessão): kit_composicoes
-- é VERSIONADA — uma nova composição nunca sobrescreve a anterior, só marca
-- a antiga como inativa e cria uma nova linha. `venda_kit_expansao` (criada
-- abaixo, sem escritor ainda) vai gravar, por item de venda, exatamente qual
-- kit_composicao_id (versão imutável) foi usado — para que devoluções e
-- relatórios futuros reflitam o que foi vendido na data, mesmo que a
-- composição do kit mude depois.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_produto text NOT NULL DEFAULT 'SIMPLES'
    CHECK (tipo_produto IN ('SIMPLES', 'KIT'));

COMMENT ON COLUMN public.produtos.tipo_produto IS
  'SIMPLES: produto normal, tem linha própria em estoque. KIT: composição de outros produtos — ver kit_composicoes. Kits não têm baixa de estoque própria (Entrega 8b/8c, ainda não integrada à v4).';

CREATE TABLE IF NOT EXISTS public.kit_composicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_produto_id uuid NOT NULL REFERENCES public.produtos (id),
  versao integer NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES public.usuarios (id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_kit_composicoes_kit_versao UNIQUE (kit_produto_id, versao)
);

-- Só uma composição ativa por kit por vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kit_composicoes_kit_ativa
  ON public.kit_composicoes (kit_produto_id)
  WHERE ativa;

COMMENT ON TABLE public.kit_composicoes IS
  'Versão imutável da composição de um kit. Nunca é editada in-place — uma mudança de composição cria uma nova versão e desativa a anterior, preservando histórico para devoluções/auditoria.';

CREATE TABLE IF NOT EXISTS public.kit_composicao_itens (
  kit_composicao_id uuid NOT NULL REFERENCES public.kit_composicoes (id) ON DELETE CASCADE,
  componente_produto_id uuid NOT NULL REFERENCES public.produtos (id),
  quantidade numeric(10, 3) NOT NULL CHECK (quantidade > 0),
  PRIMARY KEY (kit_composicao_id, componente_produto_id)
);

COMMENT ON TABLE public.kit_composicao_itens IS
  'Componentes de uma versão de composição de kit e a quantidade de cada um por unidade do kit.';

-- Snapshot histórico e imutável: qual composição (versão) foi expandida para
-- qual item de venda real, e em quais movimentos de componente. Sem
-- escritor nesta migration — será populada quando a integração com a v4
-- (Entrega 8c) existir. Criada agora para o desenho já estar pronto.
CREATE TABLE IF NOT EXISTS public.venda_kit_expansao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_venda_id uuid NOT NULL REFERENCES public.itens_venda (id),
  kit_produto_id uuid NOT NULL REFERENCES public.produtos (id),
  kit_composicao_id uuid NOT NULL REFERENCES public.kit_composicoes (id),
  componente_produto_id uuid NOT NULL REFERENCES public.produtos (id),
  quantidade_componente numeric(10, 3) NOT NULL CHECK (quantidade_componente > 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venda_kit_expansao_item_venda
  ON public.venda_kit_expansao (item_venda_id);

COMMENT ON TABLE public.venda_kit_expansao IS
  'Snapshot imutável: para cada item_venda de um kit vendido, quais componentes (e em qual quantidade, sob qual versão de composição) foram efetivamente baixados do estoque. Fonte de verdade histórica para devolução/auditoria de kits — nunca lida a partir de kit_composicoes diretamente para vendas já concluídas.';

ALTER TABLE public.kit_composicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_composicao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_kit_expansao ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.kit_composicoes FROM anon;
REVOKE ALL ON TABLE public.kit_composicao_itens FROM anon;
REVOKE ALL ON TABLE public.venda_kit_expansao FROM anon;

GRANT SELECT ON TABLE public.kit_composicoes TO authenticated;
GRANT SELECT ON TABLE public.kit_composicao_itens TO authenticated;
GRANT SELECT ON TABLE public.venda_kit_expansao TO authenticated;
GRANT ALL ON TABLE public.kit_composicoes TO service_role;
GRANT ALL ON TABLE public.kit_composicao_itens TO service_role;
GRANT ALL ON TABLE public.venda_kit_expansao TO service_role;

-- Leitura: qualquer autenticado (catálogo é compartilhado, igual a `produtos`).
CREATE POLICY kit_composicoes_select ON public.kit_composicoes
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');

CREATE POLICY kit_composicao_itens_select ON public.kit_composicao_itens
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');

CREATE POLICY venda_kit_expansao_select ON public.venda_kit_expansao
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');

-- Escrita só via RPC SECURITY DEFINER abaixo (sem policy de INSERT/UPDATE
-- direta) — mesmo padrão de proteção usado em vendas_em_espera/orcamentos.

CREATE OR REPLACE FUNCTION public.criar_kit_composicao(
  p_kit_produto_id uuid,
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kit_tipo text;
  v_item jsonb;
  v_componente_id uuid;
  v_quantidade numeric(10, 3);
  v_componente_tipo text;
  v_proxima_versao integer;
  v_composicao_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  SELECT tipo_produto INTO v_kit_tipo FROM public.produtos WHERE id = p_kit_produto_id;
  IF v_kit_tipo IS NULL THEN
    RAISE EXCEPTION 'kit_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_kit_tipo <> 'KIT' THEN
    RAISE EXCEPTION 'produto_nao_e_kit' USING ERRCODE = '22023';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) < 1 THEN
    RAISE EXCEPTION 'kit_sem_componentes' USING ERRCODE = '22023';
  END IF;

  -- Validação por componente: existe, não é o próprio kit, não é outro kit
  -- (v1 não suporta kit aninhado — mantém a expansão de estoque em 1 nível).
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_componente_id := (v_item->>'produtoId')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric(10, 3);

    IF v_componente_id IS NULL OR v_quantidade IS NULL OR v_quantidade <= 0 THEN
      RAISE EXCEPTION 'componente_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_componente_id = p_kit_produto_id THEN
      RAISE EXCEPTION 'kit_nao_pode_referenciar_a_si_mesmo' USING ERRCODE = '22023';
    END IF;

    SELECT tipo_produto INTO v_componente_tipo FROM public.produtos WHERE id = v_componente_id;
    IF v_componente_tipo IS NULL THEN
      RAISE EXCEPTION 'componente_nao_encontrado' USING ERRCODE = 'P0002';
    END IF;
    IF v_componente_tipo = 'KIT' THEN
      RAISE EXCEPTION 'kit_aninhado_nao_suportado' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT COALESCE(MAX(versao), 0) + 1 INTO v_proxima_versao
  FROM public.kit_composicoes WHERE kit_produto_id = p_kit_produto_id;

  UPDATE public.kit_composicoes SET ativa = false
  WHERE kit_produto_id = p_kit_produto_id AND ativa;

  INSERT INTO public.kit_composicoes (kit_produto_id, versao, ativa, criado_por)
  VALUES (p_kit_produto_id, v_proxima_versao, true, v_uid)
  RETURNING id INTO v_composicao_id;

  INSERT INTO public.kit_composicao_itens (kit_composicao_id, componente_produto_id, quantidade)
  SELECT
    v_composicao_id,
    (value->>'produtoId')::uuid,
    (value->>'quantidade')::numeric(10, 3)
  FROM jsonb_array_elements(p_itens);

  RETURN jsonb_build_object('id', v_composicao_id, 'versao', v_proxima_versao);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_kit_composicao(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_kit_composicao(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.obter_kit_composicao_atual(p_kit_produto_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN kc.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'composicaoId', kc.id,
      'versao', kc.versao,
      'componentes', COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object('produtoId', i.componente_produto_id, 'quantidade', i.quantidade))
          FROM public.kit_composicao_itens i
          WHERE i.kit_composicao_id = kc.id
        ),
        '[]'::jsonb
      )
    )
  END
  FROM public.kit_composicoes kc
  WHERE kc.kit_produto_id = p_kit_produto_id AND kc.ativa
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.obter_kit_composicao_atual(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_kit_composicao_atual(uuid) TO authenticated;
