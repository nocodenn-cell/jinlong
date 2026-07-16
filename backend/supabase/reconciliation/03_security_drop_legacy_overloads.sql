-- P1 S4 — DROP dos 8 overloads legados de finalizar_venda_*. NÃO EXECUTAR sem confirmação.
--
-- Evidência de segurança (2026-07-16): 7 dos 8 já são stubs desabilitados
-- (`RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'` — alguém já neutralizou o
-- comportamento antes, só faltou o DROP). Apenas
-- finalizar_venda_transacional(9 args) ainda tem lógica real, mas é
-- superada pela v4 e ZERO código do app a chama (confirmado por grep —
-- só aparecem em database.types.ts gerado e numa string de teste).
-- guard:rpc confirma: código só usa a v4.
--
-- Pré-condição satisfeita: sem chamadores. Rollback completo abaixo
-- (02_security_rollback_grant_anon.sql cobre GRANTs; este arquivo cobre
-- recriação do corpo caso o DROP precise ser revertido).

DROP FUNCTION IF EXISTS public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb
);
DROP FUNCTION IF EXISTS public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
);
DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v2();
DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v2(
  uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean
);
DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v2(
  uuid, uuid, uuid, jsonb, jsonb, numeric, numeric, numeric, text, numeric, text
);
DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v2(
  uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, text
);
DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v3();
DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
);

-- Efeito colateral positivo: dropar os stubs v2()/v3()/finalizar_venda_transacional(7 args)
-- também resolve 3 dos 4 achados de "search_path mutável" do advisor (eram exatamente
-- estes 3 stubs). Restará só venda_evento_idempotency_key — ver 04_security_search_path_fix.sql.

NOTIFY pgrst, 'reload schema';
