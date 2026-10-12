ALTER FUNCTION public.fiscal_reprocessar_documento(uuid) OWNER TO postgres;
ALTER FUNCTION public.fiscal_cancelar_documento(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) OWNER TO postgres;
ALTER FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_cancelar_documento(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO authenticated, service_role;
