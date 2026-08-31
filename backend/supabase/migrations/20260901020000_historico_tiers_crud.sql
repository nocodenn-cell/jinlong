-- ID 51: Auditoria — histórico de CRUD em faixas de atacado

BEGIN;

-- Tabela de auditoria para tier CRUD
CREATE TABLE IF NOT EXISTS public.historico_tiers_crud (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tier_id uuid,
  acao TEXT NOT NULL CHECK (acao IN ('CRIADO', 'ATUALIZADO', 'DELETADO')),
  quantidade_minima_antes INTEGER,
  quantidade_minima_depois INTEGER,
  preco_unitario_antes NUMERIC(10,2),
  preco_unitario_depois NUMERIC(10,2),
  criado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_tiers_produto ON public.historico_tiers_crud(produto_id);
CREATE INDEX IF NOT EXISTS idx_historico_tiers_tier ON public.historico_tiers_crud(tier_id);
CREATE INDEX IF NOT EXISTS idx_historico_tiers_acao ON public.historico_tiers_crud(acao);

-- RLS: mesmo padrão de historico_precos_produto (migration 259) — leitura
-- restrita a GERENTE/DONO, sem policy de escrita direta (só a trigger
-- SECURITY DEFINER grava linhas).
ALTER TABLE public.historico_tiers_crud ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_tiers_crud_leitura" ON public.historico_tiers_crud;
CREATE POLICY "historico_tiers_crud_leitura"
  ON public.historico_tiers_crud FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );

-- Função para audit
CREATE OR REPLACE FUNCTION public.audit_tiers_crud()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_tiers_crud (
      produto_id, tier_id, acao, quantidade_minima_depois, preco_unitario_depois, criado_por
    ) VALUES (
      NEW.produto_id, NEW.id, 'CRIADO', NEW.quantidade_minima, NEW.preco_unitario, auth.uid()
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.historico_tiers_crud (
      produto_id, tier_id, acao,
      quantidade_minima_antes, quantidade_minima_depois,
      preco_unitario_antes, preco_unitario_depois,
      criado_por
    ) VALUES (
      OLD.produto_id, OLD.id, 'ATUALIZADO',
      OLD.quantidade_minima, NEW.quantidade_minima,
      OLD.preco_unitario, NEW.preco_unitario,
      auth.uid()
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.historico_tiers_crud (
      produto_id, tier_id, acao,
      quantidade_minima_antes, preco_unitario_antes,
      criado_por
    ) VALUES (
      OLD.produto_id, OLD.id, 'DELETADO',
      OLD.quantidade_minima, OLD.preco_unitario,
      auth.uid()
    );
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Trigger (idempotente)
DROP TRIGGER IF EXISTS trg_audit_tiers_crud ON public.precos_atacado;
CREATE TRIGGER trg_audit_tiers_crud
  AFTER INSERT OR UPDATE OR DELETE ON public.precos_atacado
  FOR EACH ROW EXECUTE FUNCTION public.audit_tiers_crud();

COMMENT ON TABLE public.historico_tiers_crud IS
  'ID 51: Auditoria de criação, atualização e remoção de faixas de atacado';

COMMIT;
