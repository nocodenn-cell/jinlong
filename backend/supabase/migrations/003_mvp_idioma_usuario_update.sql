-- PDV Importados — MVP: permitir trocar idioma do painel
-- Executar via: npx supabase db push

-- O MVP precisa permitir update em `public.usuarios.idioma_preferido` para GERENTE/DONO.
-- Sem policy de UPDATE, o RLS bloqueia por padrão.

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

