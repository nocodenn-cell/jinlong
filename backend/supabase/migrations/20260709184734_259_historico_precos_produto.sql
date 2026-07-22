-- Migration 259: Histórico de preços do produto
--
-- PROBLEMA: alterações de preco_varejo/preco_atacado/preco_custo em `produtos`
-- sobrescrevem o valor anterior sem deixar rastro — não há como saber quando
-- ou quem mudou um preço.
--
-- SOLUÇÃO: tabela append-only `historico_precos_produto` + trigger AFTER UPDATE
-- em `produtos` que grava uma linha sempre que qualquer um dos três preços muda.
-- Zero impacto em cálculo de preço (calcular_preco_produto não muda).

CREATE TABLE IF NOT EXISTS public.historico_precos_produto (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id             uuid        NOT NULL REFERENCES public.produtos (id) ON DELETE CASCADE,
  preco_varejo_anterior  numeric,
  preco_varejo_novo      numeric,
  preco_atacado_anterior numeric,
  preco_atacado_novo     numeric,
  preco_custo_anterior   numeric,
  preco_custo_novo       numeric,
  alterado_por           uuid        REFERENCES auth.users,
  alterado_em            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.historico_precos_produto IS
  'Registro append-only de mudanças em preco_varejo/preco_atacado/preco_custo de `produtos`. '
  'Alimentada exclusivamente pela trigger trg_historico_precos_produto — não escrever diretamente.';

CREATE INDEX IF NOT EXISTS idx_historico_precos_produto_produto
  ON public.historico_precos_produto (produto_id, alterado_em DESC);

ALTER TABLE public.historico_precos_produto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_precos_produto_leitura" ON public.historico_precos_produto;
CREATE POLICY "historico_precos_produto_leitura"
  ON public.historico_precos_produto FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

-- Sem policy de escrita direta: só a trigger (SECURITY DEFINER) grava linhas.

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: grava snapshot quando preco_varejo/preco_atacado/preco_custo muda
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_historico_preco_produto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.preco_varejo  IS DISTINCT FROM OLD.preco_varejo
     OR NEW.preco_atacado IS DISTINCT FROM OLD.preco_atacado
     OR NEW.preco_custo   IS DISTINCT FROM OLD.preco_custo THEN
    INSERT INTO public.historico_precos_produto (
      produto_id,
      preco_varejo_anterior, preco_varejo_novo,
      preco_atacado_anterior, preco_atacado_novo,
      preco_custo_anterior, preco_custo_novo,
      alterado_por
    ) VALUES (
      NEW.id,
      OLD.preco_varejo, NEW.preco_varejo,
      OLD.preco_atacado, NEW.preco_atacado,
      OLD.preco_custo, NEW.preco_custo,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_historico_precos_produto ON public.produtos;
CREATE TRIGGER trg_historico_precos_produto
  AFTER UPDATE ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_historico_preco_produto();
