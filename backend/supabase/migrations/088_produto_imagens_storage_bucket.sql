-- Bucket Storage `produto-imagens` e policies (coluna `imagem_url` já criada em 084).

COMMENT ON COLUMN public.produtos.imagem_url IS
  'URL pública (Supabase Storage, bucket produto-imagens) da foto do produto; opcional.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'produto-imagens',
  'produto-imagens',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "produto_imagens_insert_gerencial" ON storage.objects;
CREATE POLICY "produto_imagens_insert_gerencial"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'produto-imagens'
    AND split_part(name, '/', 2) <> ''
    AND EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id::text = split_part(name, '/', 1)
    )
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "produto_imagens_update_gerencial" ON storage.objects;
CREATE POLICY "produto_imagens_update_gerencial"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'produto-imagens'
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    bucket_id = 'produto-imagens'
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "produto_imagens_delete_gerencial" ON storage.objects;
CREATE POLICY "produto_imagens_delete_gerencial"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'produto-imagens'
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );
