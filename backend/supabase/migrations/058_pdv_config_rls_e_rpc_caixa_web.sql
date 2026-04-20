-- Fecha leitura direta de pdv_config via API (PostgREST): colunas como gerente_senha_sha256
-- não devem ser acessíveis a authenticated. O caixa web lê apenas campos operacionais via RPC.

CREATE OR REPLACE FUNCTION public.pdv_config_para_caixa_web()
RETURNS TABLE (
  quantidade_minima_atacado_padrao numeric,
  blind_closure boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.quantidade_minima_atacado_padrao,
    p.blind_closure
  FROM public.pdv_config p
  WHERE p.id = 1
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.pdv_config_para_caixa_web() IS
  'Campos não sensíveis do PDV para o caixa web (sem gerente_senha_sha256 / gerente_id).';

REVOKE ALL ON FUNCTION public.pdv_config_para_caixa_web() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pdv_config_para_caixa_web() TO authenticated;

ALTER TABLE public.pdv_config ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.pdv_config FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.pdv_config FROM authenticated;
