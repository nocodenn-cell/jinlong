-- Fonte única de limite de sangria para UI e backend.
-- Mantém fallback seguro (200) caso não exista configuração.

CREATE OR REPLACE FUNCTION public.obter_limite_sangria_sem_gerente()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite numeric(10,2);
BEGIN
  SELECT pc.limite_sangria_sem_gerente
  INTO v_limite
  FROM public.pdv_config pc
  WHERE pc.id = 1
  LIMIT 1;

  RETURN COALESCE(v_limite, 200);
END;
$$;

REVOKE ALL ON FUNCTION public.obter_limite_sangria_sem_gerente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_limite_sangria_sem_gerente() TO authenticated;
GRANT EXECUTE ON FUNCTION public.obter_limite_sangria_sem_gerente() TO service_role;

COMMENT ON FUNCTION public.obter_limite_sangria_sem_gerente() IS
  'Retorna limite configurado de sangria sem gerente (fallback 200).';
