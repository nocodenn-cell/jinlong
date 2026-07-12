-- PDV Importados — MVP: adicionar zh-HK no idioma preferido
-- Executar via: npx supabase db push

-- 1) Expandir CHECK do campo idioma_preferido
ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_idioma_preferido_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_idioma_preferido_check
  CHECK (idioma_preferido IN ('pt', 'zh', 'zh-HK'));

-- 2) Permitir UPDATE do idioma para GERENTE/DONO (inclui zh-HK)
DROP POLICY IF EXISTS usuarios_update_idioma_gerente_dono ON public.usuarios;

create policy "usuarios_update_idioma_gerente_dono"
  on public.usuarios
  for update
  using (
    auth.uid() = id
    and perfil in ('GERENTE', 'DONO')
  )
  with check (
    auth.uid() = id
    and perfil in ('GERENTE', 'DONO')
    and idioma_preferido in ('pt', 'zh', 'zh-HK')
  );

