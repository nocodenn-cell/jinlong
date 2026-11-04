-- Rollback de 20261104180000_go_live01_titulo_caixa_fora_do_escopo.sql.
-- Restaura os wrappers de liquidação, pagamento e atualização de produto como estavam (guarda fp_assert_* antes da regra interna) e remove o helper.
BEGIN;
CREATE OR REPLACE FUNCTION public.registrar_liquidacao_receber(p_titulo_id uuid, p_valor numeric, p_forma_pagamento text, p_observacao text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_caixa_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT 'UI_FINANCEIRO'::text)
 RETURNS TABLE(liquidacao_id uuid, titulo_id uuid, valor numeric, valor_aberto numeric, status text, caixa_id uuid, idempotent_replay boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$SELECT public.fp_assert_loja(public.fp_loja_de('conta_receber', p_titulo_id), false, 'registrar_liquidacao_receber.p_titulo_id') AND public.fp_assert_loja(public.fp_loja_de('caixa', p_caixa_id), false, 'registrar_liquidacao_receber.p_caixa_id');
SELECT * FROM internal.registrar_liquidacao_receber(p_titulo_id => p_titulo_id, p_valor => p_valor, p_forma_pagamento => p_forma_pagamento, p_observacao => p_observacao, p_idempotency_key => p_idempotency_key, p_caixa_id => p_caixa_id, p_origem => p_origem);$function$
;
CREATE OR REPLACE FUNCTION public.registrar_pagamento_contas_pagar(p_conta_id uuid, p_valor numeric, p_forma text, p_data timestamp with time zone DEFAULT now(), p_observacao text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_caixa_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT 'UI_FINANCEIRO'::text, p_autorizacao_token text DEFAULT NULL::text)
 RETURNS TABLE(pagamento_id uuid, conta_id uuid, valor numeric, valor_pago numeric, status text, caixa_id uuid, movimentacao_caixa_id uuid, idempotent_replay boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$SELECT public.fp_assert_loja(public.fp_loja_de('conta_pagar', p_conta_id), false, 'registrar_pagamento_contas_pagar.p_conta_id') AND public.fp_assert_loja(public.fp_loja_de('caixa', p_caixa_id), false, 'registrar_pagamento_contas_pagar.p_caixa_id');
SELECT * FROM internal.registrar_pagamento_contas_pagar(p_conta_id => p_conta_id, p_valor => p_valor, p_forma => p_forma, p_data => p_data, p_observacao => p_observacao, p_idempotency_key => p_idempotency_key, p_caixa_id => p_caixa_id, p_origem => p_origem, p_autorizacao_token => p_autorizacao_token);$function$
;
CREATE OR REPLACE FUNCTION public.atualizar_produto_com_faixa_atacado(p_produto_id uuid, p_payload jsonb, p_ator_id uuid DEFAULT NULL::uuid, p_faixa jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$SELECT public.fp_assert_produto(p_produto_id, 'atualizar_produto_com_faixa_atacado.p_produto_id');
SELECT internal.atualizar_produto_com_faixa_atacado(p_produto_id => p_produto_id, p_payload => p_payload, p_ator_id => p_ator_id, p_faixa => p_faixa);$function$
;
DROP FUNCTION IF EXISTS internal.fp_recurso_no_escopo(text, uuid);
COMMIT;
