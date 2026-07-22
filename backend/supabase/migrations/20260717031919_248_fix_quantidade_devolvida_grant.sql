REVOKE ALL ON FUNCTION public.quantidade_devolvida_item_venda(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quantidade_devolvida_item_venda(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quantidade_devolvida_item_venda(uuid) TO service_role;
