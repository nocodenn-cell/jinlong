-- Segunda loja para testar transferências (opcional em produção).
INSERT INTO public.lojas (id, nome, codigo, ativo)
VALUES (
  'a0000002-0000-4000-8000-000000000002'::uuid,
  'Filial demo',
  'FILIAL_DEMO',
  true
)
ON CONFLICT (id) DO NOTHING;
