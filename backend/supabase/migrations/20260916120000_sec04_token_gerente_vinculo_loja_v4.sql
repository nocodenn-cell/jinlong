-- SEC-04 (P0) — token de gerente sem vínculo de loja na venda canônica v4.
--
-- ACHADO
-- ------
-- `finalizar_venda_transacional_canonica_v4_unscoped` (SECURITY DEFINER) valida
-- `tokens_desconto_gerente` por token + usado + expiração — nos dois pontos de
-- consumo (`p_desconto_gerente_token` e `p_limite_credito_gerente_token`) — mas
-- nunca compara o token com a loja da operação. Um token emitido numa sessão da
-- Loja B é aceito numa venda da Loja A.
--
-- `tokens_desconto_gerente.loja_id` NÃO serve sozinho como vínculo: é gravado a
-- partir do corpo da requisição da Edge `validar-gerente` (controlado pelo
-- cliente) e o PDV web nem o envia (fica NULL). A fonte server-side confiável
-- é `criado_por` — o `auth.uid()` do JWT que pediu o token, preenchido pela Edge
-- — resolvido para `usuarios.loja_id`. Mesmo padrão já usado por
-- `retomar_caixa_atomico` (20260904140000).
--
-- CORREÇÃO (mínima)
-- -----------------
-- 1. `internal.token_gerente_fora_da_loja(token, loja)` — true quando o token
--    EXISTE e não pertence à loja:
--      - emissor (`criado_por`) ausente, ou fora da loja e sem perfil global
--        (Padrão A, 20260829120000: DONO/ADMIN globais, demais restritos); ou
--      - `loja_id` gravado e diferente da loja.
--    Token inexistente devolve false de propósito: a v4_unscoped continua dona
--    das regras de existência/uso/expiração, inclusive do replay idempotente de
--    venda já concluída (token já `usado = true` num retry legítimo).
-- 2. O wrapper `finalizar_venda_transacional_canonica_v4` chama a checagem
--    depois de provar que `p_loja_id` é a loja do usuário da sessão E do caixa
--    ABERTO (guarda 20260809120837). Ou seja, a loja comparada é a loja real
--    da operação, não um parâmetro livre do caller. A `_unscoped` só é
--    executável pelo owner (sem grant a PUBLIC/anon/authenticated/service_role),
--    então o wrapper é o único caminho até ela.
--
-- Corpo do wrapper idêntico ao de 20260814013845_unify_online_offline_price_invariant.sql
-- (md5 do prosrc conferido contra produção antes desta migration) + o bloco
-- SEC-04. Assinatura inalterada: GRANTs existentes permanecem.
--
-- NÃO muda: autorização legítima do gerente, mensagens/códigos de erro
-- (reusa FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_INVALIDO e
-- FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_INVALIDO, já mapeados no app).

BEGIN;

CREATE OR REPLACE FUNCTION internal.token_gerente_fora_da_loja(
  p_token text,
  p_loja_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.tokens_desconto_gerente t
      LEFT JOIN public.usuarios u ON u.id = t.criado_por
     WHERE t.token = p_token
       AND (
         u.id IS NULL
         OR (u.perfil NOT IN ('DONO', 'ADMIN') AND u.loja_id IS DISTINCT FROM p_loja_id)
         OR (t.loja_id IS NOT NULL
             AND lower(btrim(t.loja_id)) IS DISTINCT FROM p_loja_id::text)
       )
  );
$function$;

COMMENT ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) IS
  'SEC-04: true quando o token de gerente existe e NÃO pertence à loja (emissor criado_por fora da loja e sem perfil DONO/ADMIN, ou loja_id gravado divergente). Token inexistente = false (existência/uso/expiração ficam com a v4_unscoped).';

REVOKE ALL ON FUNCTION internal.token_gerente_fora_da_loja(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(
  p_venda_id uuid, p_caixa_id uuid, p_operador_id uuid, p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL, p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL, p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]', p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false, p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL, p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL, p_cliente_id uuid DEFAULT NULL,
  p_motivo_desconto public.motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO',
  p_motivo_descricao text DEFAULT NULL,
  p_limite_credito_gerente_token text DEFAULT NULL
)
RETURNS TABLE(venda_id uuid, status text, mensagem text, dados_fiscais jsonb,
  itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid, contas_receber_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_uid uuid := COALESCE(v_auth_uid, p_operador_id);
  v_usuario_loja_id uuid;
  v_caixa_loja_id uuid;
  v_caixa_operador_id uuid;
  v_caixa_status text;
  v_totais record;
  v_pag jsonb;
  v_pag_total numeric := 0;
  v_pag_valor numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_AUTH'; END IF;
  IF v_auth_uid IS NOT NULL AND p_operador_id IS DISTINCT FROM v_auth_uid THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_INVALIDO';
  END IF;

  SELECT u.loja_id INTO v_usuario_loja_id FROM public.usuarios u
  WHERE u.id = v_uid AND COALESCE(u.ativo, true) = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_USUARIO_INVALIDO'; END IF;
  IF v_usuario_loja_id IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LOJA_INVALIDA';
  END IF;

  SELECT c.loja_id, c.operador_id, c.status
  INTO v_caixa_loja_id, v_caixa_operador_id, v_caixa_status
  FROM public.caixas c WHERE c.id = p_caixa_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_NAO_ENCONTRADO'; END IF;
  IF v_caixa_loja_id IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_LOJA_INVALIDA';
  END IF;
  IF v_caixa_operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_OPERADOR_INVALIDO';
  END IF;
  IF v_caixa_status IS DISTINCT FROM 'ABERTO' THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_FECHADO';
  END IF;

  -- SEC-04: a partir daqui p_loja_id é a loja real (usuário + caixa ABERTO).
  -- Token de gerente de outra loja é recusado antes de qualquer escrita.
  IF p_desconto_gerente_token IS NOT NULL
     AND internal.token_gerente_fora_da_loja(p_desconto_gerente_token, p_loja_id) THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_INVALIDO';
  END IF;
  IF p_limite_credito_gerente_token IS NOT NULL
     AND internal.token_gerente_fora_da_loja(p_limite_credito_gerente_token, p_loja_id) THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_INVALIDO';
  END IF;

  SELECT * INTO v_totais FROM internal.calcular_totais_venda(
    p_itens,
    CASE WHEN p_desconto_gerente_token IS NULL THEN NULL ELSE p_desconto_gerente_percentual END
  );

  -- P0-5: mesma invariante de preco do escritor offline.
  PERFORM internal.validar_precos_venda(p_itens, p_loja_id);

  IF p_total_bruto IS NULL OR p_total_desconto IS NULL OR p_total_liquido IS NULL
     OR p_total_bruto <> public.round_abnt(p_total_bruto, 2)
     OR p_total_desconto <> public.round_abnt(p_total_desconto, 2)
     OR p_total_liquido <> public.round_abnt(p_total_liquido, 2)
     OR p_total_bruto <> v_totais.total_bruto
     OR p_total_desconto <> v_totais.total_desconto
     OR p_total_liquido <> v_totais.total_liquido THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES';
  END IF;

  IF p_pagamentos IS NOT NULL THEN
    IF jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INVALIDOS';
    END IF;
    FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
    LOOP
      v_pag_valor := (v_pag->>'valor')::numeric;
      IF v_pag_valor IS NULL OR v_pag_valor <= 0
         OR v_pag_valor <> public.round_abnt(v_pag_valor, 2) THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_VALOR_PAGAMENTO_INVALIDO';
      END IF;
      v_pag_total := v_pag_total + v_pag_valor;
    END LOOP;
    v_pag_total := public.round_abnt(v_pag_total, 2);
    IF v_pag_total > v_totais.total_liquido THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_EXCEDEM_TOTAL';
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM public.finalizar_venda_transacional_canonica_v4_unscoped(
    p_venda_id, p_caixa_id, p_operador_id, p_loja_id, p_forma_pagamento,
    p_total_bruto, p_total_desconto, p_total_liquido, p_pagamentos, p_itens,
    p_desconto_gerente_token, p_desconto_gerente_percentual,
    p_strict_manager_discount_auth, p_fiscal_auto_enqueue, p_ip_address,
    p_user_agent, p_device_id, p_terminal_id, p_cliente_id,
    p_motivo_desconto, p_motivo_descricao, p_limite_credito_gerente_token
  );
END;
$function$;

DO $verify$
DECLARE
  v_wrapper regprocedure := 'public.finalizar_venda_transacional_canonica_v4(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid,public.motivo_desconto_enum_tipo,text,text)'::regprocedure;
  v_unscoped regprocedure := 'public.finalizar_venda_transacional_canonica_v4_unscoped(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid,public.motivo_desconto_enum_tipo,text,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_wrapper);
BEGIN
  IF position('internal.token_gerente_fora_da_loja(p_desconto_gerente_token' IN v_def) = 0
     OR position('internal.token_gerente_fora_da_loja(p_limite_credito_gerente_token' IN v_def) = 0 THEN
    RAISE EXCEPTION 'SEC04_GUARDA_TOKEN_LOJA_AUSENTE';
  END IF;
  IF position('FINALIZAR_VENDA_CANONICA_CAIXA_LOJA_INVALIDA' IN v_def) = 0 THEN
    RAISE EXCEPTION 'SEC04_GUARDA_ESCOPO_289_AUSENTE';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_wrapper) THEN
    RAISE EXCEPTION 'SEC04_WRAPPER_NAO_SECURITY_DEFINER';
  END IF;
  IF has_function_privilege('authenticated', v_unscoped, 'EXECUTE')
     OR has_function_privilege('anon', v_unscoped, 'EXECUTE')
     OR has_function_privilege('service_role', v_unscoped, 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC04_UNSCOPED_EXPOSTA';
  END IF;
  IF has_function_privilege('anon', v_wrapper, 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC04_WRAPPER_EXPOSTO_ANON';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
