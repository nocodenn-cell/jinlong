-- R1: lifecycle de catálogo (DRAFT / PUBLICADO / INATIVO)
-- Dual-write com produtos.ativo: PUBLICADO ↔ ativo=true; DRAFT/INATIVO ↔ ativo=false

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS status_publicacao text NOT NULL DEFAULT 'PUBLICADO';

ALTER TABLE public.produtos
  DROP CONSTRAINT IF EXISTS produtos_status_publicacao_check;

ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_status_publicacao_check
  CHECK (status_publicacao IN ('DRAFT', 'PUBLICADO', 'INATIVO'));

COMMENT ON COLUMN public.produtos.status_publicacao IS
  'Lifecycle catálogo: DRAFT (rascunho), PUBLICADO (vendável PDV), INATIVO (fora do PDV). Dual-write com ativo.';

UPDATE public.produtos
   SET status_publicacao = CASE
     WHEN ativo THEN 'PUBLICADO'
     ELSE 'INATIVO'
   END
 WHERE status_publicacao IS DISTINCT FROM CASE
     WHEN ativo THEN 'PUBLICADO'
     ELSE 'INATIVO'
   END;
