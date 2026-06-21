-- Migration 243 — Pricing Version Governance (transactional boundary)
--
-- Problema resolvido:
--   Toda venda deve registrar qual versão de pricing estava ativa no momento
--   da finalização. Sem isso, mudanças de regra tornam o histórico opaco:
--   não há como saber "quais regras geraram esse preço".
--
-- Design:
--   ZERO impacto em cálculo de preço. calcular_preco_produto não muda.
--   A versão é resolvida uma vez por finalização de venda (TypeScript),
--   registrada em vendas e itens_venda como campo auditável (nullable).
--   NULL = venda anterior ao sistema de versionamento (modo legado, válido).
--
-- Fallback safety rule:
--   - Se a tabela pricing_config_versions tiver zero linhas → modo legado (NULL OK).
--   - Se tiver linhas mas nenhuma ativa → obter_pricing_version_ativa() retorna NULL;
--     TypeScript decide se aborta (atualmente: aceita como legado).
--   - Se tiver uma versão ativa → versão é registrada obrigatoriamente.
--   - Nenhum fallback silencioso: erro na resolução de versão aborta a venda.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela de versões de configuração de pricing
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_config_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text        NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES auth.users,
  is_active    boolean     NOT NULL DEFAULT false,
  activated_at timestamptz,
  activated_by uuid        REFERENCES auth.users
);

COMMENT ON TABLE public.pricing_config_versions IS
  'Versões de configuração de pricing. Uma única versão pode estar ativa por vez (índice único parcial). '
  'Ausência de registros = modo não-versionado: vendas registram pricing_version_id = NULL (legado válido).';

-- Índice único parcial: apenas uma versão ativa por vez
CREATE UNIQUE INDEX IF NOT EXISTS pricing_config_versions_single_active
  ON public.pricing_config_versions (is_active)
  WHERE is_active = true;

ALTER TABLE public.pricing_config_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_config_versions_leitura" ON public.pricing_config_versions;
CREATE POLICY "pricing_config_versions_leitura"
  ON public.pricing_config_versions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "pricing_config_versions_escrita" ON public.pricing_config_versions;
CREATE POLICY "pricing_config_versions_escrita"
  ON public.pricing_config_versions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Colunas de audit em itens_venda e vendas (aditivo, nullable)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.itens_venda
  ADD COLUMN IF NOT EXISTS pricing_version_id uuid;

COMMENT ON COLUMN public.itens_venda.pricing_version_id IS
  'Versão de pricing ativa no momento da venda (pricing_config_versions.id). '
  'NULL = venda legada (registrada antes do sistema de versionamento) — valor válido.';

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS pricing_version_id uuid;

COMMENT ON COLUMN public.vendas.pricing_version_id IS
  'Versão de pricing ativa no momento da finalização. '
  'Deve coincidir com o pricing_version_id de todos os itens da venda (invariant verificado em TypeScript).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: resolver versão ativa (NULL = modo legado)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obter_pricing_version_ativa()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.pricing_config_versions
  WHERE is_active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.obter_pricing_version_ativa() IS
  'Retorna o UUID da versão de pricing ativa, ou NULL se o sistema de versionamento '
  'não foi ativado (tabela vazia ou nenhuma versão ativa). '
  'SECURITY DEFINER: consistent read sem expor a tabela ao authenticated diretamente.';

REVOKE ALL ON FUNCTION public.obter_pricing_version_ativa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_pricing_version_ativa() TO authenticated;
GRANT EXECUTE ON FUNCTION public.obter_pricing_version_ativa() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: registrar versão na venda pós-finalização (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_pricing_version_venda(
  p_venda_id    uuid,
  p_version_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_venda_id IS NULL OR p_version_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.vendas
     SET pricing_version_id = p_version_id
   WHERE id = p_venda_id
     AND pricing_version_id IS NULL;

  UPDATE public.itens_venda
     SET pricing_version_id = p_version_id
   WHERE venda_id = p_venda_id
     AND pricing_version_id IS NULL;
END;
$$;

COMMENT ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) IS
  'Registra a versão de pricing em vendas e itens_venda após finalização bem-sucedida. '
  'Idempotente: só escreve se pricing_version_id ainda for NULL. '
  'Chamada fire-and-forget após finalizar_venda_transacional_canonica_v4 retornar sucesso.';

REVOKE ALL ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pricing_version_venda(uuid, uuid) TO service_role;
