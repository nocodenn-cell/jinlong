-- PDV Importados — Remover suporte a zh-HK (cantonês)
-- Executar via: npx supabase db push

-- 1) Atualizar CHECK do campo idioma_preferido para remover zh-HK
ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_idioma_preferido_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_idioma_preferido_check
  CHECK (idioma_preferido IN ('pt', 'zh'));

-- 2) Atualizar policy de UPDATE para remover zh-HK
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
    and idioma_preferido in ('pt', 'zh')
  );

-- 3) Migrar usuários com zh-HK para zh (mandarim)
UPDATE public.usuarios
SET idioma_preferido = 'zh'
WHERE idioma_preferido = 'zh-HK';
