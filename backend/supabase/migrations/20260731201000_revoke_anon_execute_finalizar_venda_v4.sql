-- Migration 277: C-1 — remove EXECUTE de `anon` em finalizar_venda_transacional_canonica_v4
-- Data: 2026-07-29
--
-- PROBLEMA
-- --------
-- Auditoria de prontidão para produção (2026-07-29) confirmou, via
-- has_function_privilege() no projeto `jinlong`, que a RPC canônica de
-- finalização de venda estava executável pelo papel `anon`:
--
--   acl = {=X/postgres, postgres=X/postgres, anon=X/postgres,
--          authenticated=X/postgres, service_role=X/postgres}
--
-- Ou seja, DUAS concessões independentes: `=X` (PUBLIC herdado na criação da
-- função) e `anon=X` (grant explícito). Ambas precisam de REVOKE.
--
-- ORIGEM (regressão rastreável, não drift de dashboard)
-- -----------------------------------------------------
--   * A migration 268 (268_reconcile_finalizar_venda_v4_single_overload.sql:336)
--     fez corretamente `REVOKE ALL ... FROM PUBLIC` — porém sobre a assinatura
--     de 19 argumentos, a única existente à época.
--   * A migration 272 (BL-1) acrescentou `p_motivo_desconto` e
--     `p_motivo_descricao`. No Postgres, CREATE OR REPLACE com novos parâmetros
--     produz uma FUNÇÃO NOVA (identidade = nome + tipos dos argumentos), que
--     nasce com EXECUTE para PUBLIC. O REVOKE da 268 não a alcança. Além disso,
--     a 272 (linhas 448-452) concedeu explicitamente `TO authenticated, anon`.
--   * A migration 274 (BL-2) repetiu o mesmo grant (linhas 613-617), sob o
--     comentário "Assinatura inalterada: GRANTs já existentes (migration 272)
--     permanecem válidos".
--
-- POR QUE É CRÍTICO
-- -----------------
-- A função é SECURITY DEFINER (ignora RLS) e resolve o ator com
-- `v_uid uuid := COALESCE(auth.uid(), p_operador_id)` — sem sessão, aceita o
-- operador informado pelo próprio chamador. Verificado no corpo publicado em
-- produção: a função NÃO consulta public.usuarios e NÃO verifica `perfil`; as
-- 27 RAISE EXCEPTION são validações de negócio (caixa aberto, preço, estoque),
-- não de identidade. Como NEXT_PUBLIC_SUPABASE_ANON_KEY é pública por
-- construção (vai no bundle do browser), um POST /rest/v1/rpc/ não autenticado
-- gravava venda, baixava estoque, movimentava caixa e enfileirava documento
-- fiscal.
--
-- SEGURANÇA DA MUDANÇA (por que não quebra o caixa)
-- -------------------------------------------------
-- Chamador único em produção: pdv-importados/app/caixa/server/caixaVendas.impl.ts:282,
-- via createClient() de lib/supabase/server.ts — cliente SSR com cookie de
-- sessão, portanto papel `authenticated` — e somente após
-- `auth.getUser()` com `if (!user) return`. O `p_operador_id` enviado é
-- `user.id`, derivado da sessão no servidor. O PDV local (offline) usa outra
-- RPC, `registrar_venda_com_itens`, via edge function sync-outbox — contrato
-- garantido por scripts/rpc-gate-guard.mjs.
--
-- ESCOPO
-- ------
-- Apenas DDL de permissão. O CORPO DA RPC NÃO É ALTERADO. Endurecer o
-- COALESCE(auth.uid(), p_operador_id) para exigir sessão é mudança de
-- comportamento e está fora do escopo desta migration (requer homologação e
-- aprovação separadas).
--
-- NÃO COBERTO AQUI (registrado como risco residual):
--   * finalizar_venda_transacional_canonica_v2/v3 seguem com EXECUTE para anon
--     (legadas, bloqueadas por LEGACY_DISABLED_USE_V4 no corpo — ver 276).
--   * `GRANT USAGE ON TYPE public.motivo_desconto_enum_tipo TO ... anon`
--     (272:445) permanece; USAGE em tipo não confere EXECUTE em função.
--   * Demais SECURITY DEFINER executáveis por anon são tratados em item próprio.
--
-- REVERSÃO
-- --------
--   GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
--     uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
--     jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
--     public.motivo_desconto_enum_tipo, text
--   ) TO anon;

BEGIN;

-- 1. Remove o EXECUTE herdado por PUBLIC na criação da função (entrada `=X`).
REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text
) FROM PUBLIC;

-- 2. Remove o grant explícito a `anon` introduzido pelas migrations 272 e 274.
REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text
) FROM anon;

-- 3. Reafirma os papéis legítimos (idempotente).
--    authenticated → caixa web online (caixaVendas.impl.ts, sessão obrigatória).
--    service_role  → operações administrativas de servidor e seeds de E2E.
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text
) TO service_role;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text
) IS
  'Finalização transacional canônica v4. BL-2 (migration 274): resolve e revalida '
  'promoção vencedora (calcular_promocao_aplicavel) para itens VAREJO/ATACADO, aplica '
  'teto agregado de desconto total (pdv_config.max_desconto_total_percentual) e grava '
  'snapshot de auditoria em itens_venda.promocao_*. '
  'SEGURANÇA (migration 277): EXECUTE restrito a authenticated e service_role; '
  'PUBLIC e anon revogados. Chamador único autorizado: '
  'pdv-importados/app/caixa/server/caixaVendas.impl.ts (sessão obrigatória).';

NOTIFY pgrst, 'reload schema';

COMMIT;
