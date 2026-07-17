-- 280_revoke_anon_public_execute_security_definer_sweep.sql
--
-- FRENTE 5 (Database Integrity Hardening) — princípio do menor privilégio em
-- funções. Re-aplica a varredura das migrations 218 + 221 para fechar o gap
-- deixado por funções SECURITY DEFINER criadas DEPOIS delas.
--
-- CAUSA RAIZ (evidência: pg_proc de produção, jinlong kbabmewnahysfvlybiak, 2026-07-17)
-- ===================================================================================
-- 218 revoga EXECUTE de `anon` de toda função SECURITY DEFINER; 221 revoga de
-- PUBLIC (garantindo antes grant a authenticated+service_role). Mas ambas são
-- varreduras PONTUAIS (DO-loops executados no ponto 218/221 da sequência). Toda
-- função SECURITY DEFINER criada depois — finalizar_venda_transacional_canonica_v4
-- (243/24702/268), família vendas_em_espera (24703/270/271), fn_*_funcionario,
-- fechar_caixa_pdv_atomico (227), etc. — reganhou o EXECUTE default a anon/PUBLIC
-- e nunca foi varrida de novo.
--
-- IMPACTO MEDIDO: 33 overloads SECURITY DEFINER estavam executáveis por `anon`
-- (não autenticado) e/ou PUBLIC em produção, incluindo escrita crítica: a RPC
-- canônica de venda v4, fechamento de caixa, park/resume de venda, CRUD de
-- funcionário. Como a v4 faz `v_uid := COALESCE(auth.uid(), p_operador_id)`, um
-- chamador anon que passe `p_operador_id` explícito contornaria a checagem de
-- identidade. TODAS as 33 já têm grant explícito a authenticated + service_role,
-- então revogar anon/PUBLIC não remove acesso de nenhum papel legítimo.
--
-- GRANTS NECESSÁRIOS (mantidos): authenticated (app logado) + service_role
-- (backend/sync-outbox). GRANTS EXCESSIVOS (removidos): anon + PUBLIC.
-- Ver docs/DATABASE_INTEGRITY_FIXES.md (inventário completo) e DECISIONS DEC-07.
--
-- SALVAGUARDA (idêntica à 221): o loop de PUBLIC só concede authenticated a
-- funções que JÁ tinham PUBLIC (i.e., pensadas para acesso amplo). Funções
-- service_role-only por design (registrar_venda_com_itens, decrementar_estoque_*,
-- que tiveram authenticated revogado de propósito em 071/123) não têm PUBLIC nem
-- anon e ficam intactas.
--
-- ESCOPO: apenas SECURITY DEFINER (o alvo do advisor
-- `anon_security_definer_function_executable`). Funções SECURITY INVOKER com anon
-- (relatorios_*, round_abnt, funções de trigger) rodam sob a RLS do papel chamador
-- — anon não vê dados — e ficam fora deste sweep (baixo risco; ver DECISIONS DEC-07).
--
-- IDEMPOTÊNCIA: os DO-loops operam sobre o catálogo vivo; re-executar apenas
-- encontra menos alvos. Seguro reaplicar.
--
-- ROLLBACK: reconceder anon/PUBLIC (não recomendado — reabriria o gap).

-- ── Loop 1 (padrão 221): SECURITY DEFINER com EXECUTE em PUBLIC ──────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- ── Loop 2 (padrão 218): SECURITY DEFINER com EXECUTE em anon (explícito) ────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- ─── VALIDAÇÃO PÓS-APLICAÇÃO (deve retornar 0) ──────────────────────────────
-- SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.prosecdef
--   AND (has_function_privilege('anon', p.oid,'EXECUTE')
--        OR has_function_privilege('public', p.oid,'EXECUTE'));
