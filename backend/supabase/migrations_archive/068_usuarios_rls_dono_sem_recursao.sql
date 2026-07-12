-- Corrige 42P17 "infinite recursion detected in policy for relation usuarios".
-- A política dono_select_all (001) fazia EXISTS (SELECT ... FROM usuarios) durante
-- o próprio SELECT em usuarios, reavaliando RLS em loop.
-- Helper SECURITY DEFINER: leitura roda como dono da função (bypass RLS na subconsulta).

CREATE OR REPLACE FUNCTION public.auth_usuario_eh_dono()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.perfil = 'DONO'
  );
$$;

COMMENT ON FUNCTION public.auth_usuario_eh_dono() IS
  'RLS: indica se auth.uid() é DONO; usado em policy para evitar recursão em public.usuarios.';

REVOKE ALL ON FUNCTION public.auth_usuario_eh_dono() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_usuario_eh_dono() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_usuario_eh_dono() TO service_role;

DROP POLICY IF EXISTS "dono_select_all" ON public.usuarios;

CREATE POLICY "dono_select_all"
  ON public.usuarios
  FOR SELECT
  USING (public.auth_usuario_eh_dono());
