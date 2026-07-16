-- ============================================================
-- Migration 271 — CAPTURE de reconciliação (P0.1)
-- Versiona objeto aplicado em produção fora do repo (ledger:
-- 259_historico_precos_produto). Captura fiel de 2026-07-16. Idempotente,
-- behavior-preserving. Em produção já existe → no-op.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.historico_precos_produto (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL,
  preco_varejo_anterior numeric,
  preco_varejo_novo numeric,
  preco_atacado_anterior numeric,
  preco_atacado_novo numeric,
  preco_custo_anterior numeric,
  preco_custo_novo numeric,
  alterado_por uuid,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_precos_produto_pkey PRIMARY KEY (id),
  CONSTRAINT historico_precos_produto_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos (id) ON DELETE CASCADE,
  CONSTRAINT historico_precos_produto_alterado_por_fkey FOREIGN KEY (alterado_por) REFERENCES auth.users (id)
);
CREATE INDEX IF NOT EXISTS idx_historico_precos_produto_produto ON public.historico_precos_produto USING btree (produto_id, alterado_em DESC);
ALTER TABLE public.historico_precos_produto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS historico_precos_produto_leitura ON public.historico_precos_produto;
CREATE POLICY historico_precos_produto_leitura ON public.historico_precos_produto FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = ANY (ARRAY['GERENTE','DONO'])));

CREATE OR REPLACE FUNCTION public.registrar_historico_preco_produto()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
$function$;

DROP TRIGGER IF EXISTS trg_historico_precos_produto ON public.produtos;
CREATE TRIGGER trg_historico_precos_produto AFTER UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION registrar_historico_preco_produto();
