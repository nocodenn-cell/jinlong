-- Campos opcionais em produtos: marca, imagem (URL) e tags (array de texto).

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS marca_id uuid REFERENCES public.marcas (id) ON DELETE SET NULL;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS imagem_url text;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.produtos.marca_id IS 'Marca comercial (opcional).';
COMMENT ON COLUMN public.produtos.imagem_url IS 'URL pública ou caminho da imagem principal (opcional).';
COMMENT ON COLUMN public.produtos.tags IS 'Etiquetas livres para busca/filtro (lowercase recomendado na aplicação).';
