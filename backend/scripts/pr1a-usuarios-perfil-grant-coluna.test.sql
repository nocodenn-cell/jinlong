-- PR-1A — regressão de 20260903090000_restringe_update_usuarios_grant_coluna_idioma.sql
-- (achado P0 #1 da auditoria Jīn Lóng: GERENTE/ADMIN podia virar DONO via
-- PATCH direto em public.usuarios).
--
-- Prova, com dados sintéticos (2 lojas, 1 GERENTE, 1 ADMIN), exatamente os
-- 3 cenários exigidos:
--   1. GERENTE tenta UPDATE perfil='DONO' em si mesmo -> NEGADO (grant).
--   2. ADMIN tenta UPDATE perfil='DONO' em si mesmo -> NEGADO (grant).
--   3. GERENTE tenta UPDATE idioma_preferido em si mesmo -> PERMITIDO.
-- E confirma que nenhuma das duas tentativas negadas alterou o `perfil`
-- persistido (defesa em profundidade: a policy RLS + a checagem de grant
-- concordam).
--
-- Mesmo padrão de `PERFORM set_config(...); SET LOCAL ROLE authenticated;`
-- usado em fase1-hardening-grants-residuais.test.sql e
-- fase3-tenant-isolation-transferencias-remessas.test.sql. Tudo dentro de
-- uma transação com ROLLBACK final — nada persiste.

\set ON_ERROR_STOP on
BEGIN;

DO $setup$
DECLARE
  v_loja uuid := 'f0000009-0000-4000-8000-00000000000a';
  v_gerente uuid := 'f0000009-0000-4000-8000-00000000000b';
  v_admin uuid := 'f0000009-0000-4000-8000-00000000000c';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_gerente), (v_admin)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES
    (v_loja, 'PR1A Loja', 'PR1A-A', true)
  ON CONFLICT (id) DO UPDATE SET ativo = true;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id, idioma_preferido) VALUES
    (v_gerente, 'PR1A Gerente', 'GERENTE', true, v_loja, 'pt'),
    (v_admin, 'PR1A Admin', 'ADMIN', true, v_loja, 'pt')
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true, loja_id = EXCLUDED.loja_id, idioma_preferido = 'pt';
END
$setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 1 — GERENTE tenta se auto-promover a DONO
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_gerente_vira_dono$
DECLARE
  v_gerente uuid := 'f0000009-0000-4000-8000-00000000000b';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.usuarios SET perfil = 'DONO' WHERE id = v_gerente;
    RAISE EXCEPTION 'PR1A_FALHOU: GERENTE conseguiu virar DONO via UPDATE direto';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Negativo 1 OK: GERENTE->DONO negado por grant de coluna (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_gerente_vira_dono$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Negativo 2 — ADMIN tenta se auto-promover a DONO
-- ═══════════════════════════════════════════════════════════════════════════

DO $neg_admin_vira_dono$
DECLARE
  v_admin uuid := 'f0000009-0000-4000-8000-00000000000c';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.usuarios SET perfil = 'DONO' WHERE id = v_admin;
    RAISE EXCEPTION 'PR1A_FALHOU: ADMIN conseguiu virar DONO via UPDATE direto';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Negativo 2 OK: ADMIN->DONO negado por grant de coluna (%).', SQLERRM;
  END;

  RESET ROLE;
END
$neg_admin_vira_dono$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Positivo — GERENTE continua podendo trocar o próprio idioma
-- ═══════════════════════════════════════════════════════════════════════════

DO $pos_troca_idioma$
DECLARE
  v_gerente uuid := 'f0000009-0000-4000-8000-00000000000b';
  v_idioma_depois text;
  v_linhas int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_gerente::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  UPDATE public.usuarios SET idioma_preferido = 'zh' WHERE id = v_gerente;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  RESET ROLE;

  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'PR1A_FALHOU: troca de idioma_preferido não afetou 1 linha (afetou %) — fluxo legítimo quebrado', v_linhas;
  END IF;

  SELECT idioma_preferido INTO v_idioma_depois FROM public.usuarios WHERE id = v_gerente;
  IF v_idioma_depois <> 'zh' THEN
    RAISE EXCEPTION 'PR1A_FALHOU: idioma_preferido não persistiu (valor atual: %)', v_idioma_depois;
  END IF;

  RAISE NOTICE 'Positivo OK: GERENTE trocou o próprio idioma_preferido para zh sem erro.';
END
$pos_troca_idioma$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Defesa em profundidade — perfil de nenhum dos dois usuários mudou
-- ═══════════════════════════════════════════════════════════════════════════

DO $confirma_perfil_intocado$
DECLARE
  v_perfil_gerente text;
  v_perfil_admin text;
BEGIN
  SELECT perfil INTO v_perfil_gerente FROM public.usuarios WHERE id = 'f0000009-0000-4000-8000-00000000000b';
  SELECT perfil INTO v_perfil_admin FROM public.usuarios WHERE id = 'f0000009-0000-4000-8000-00000000000c';

  IF v_perfil_gerente <> 'GERENTE' THEN
    RAISE EXCEPTION 'PR1A_FALHOU: perfil do GERENTE mudou para % apesar da negação', v_perfil_gerente;
  END IF;
  IF v_perfil_admin <> 'ADMIN' THEN
    RAISE EXCEPTION 'PR1A_FALHOU: perfil do ADMIN mudou para % apesar da negação', v_perfil_admin;
  END IF;

  RAISE NOTICE 'Defesa em profundidade OK: nenhum perfil foi alterado pelas tentativas negadas.';
END
$confirma_perfil_intocado$;

SELECT 'PR-1A USUARIOS PERFIL GRANT COLUNA: OK' AS resultado;
ROLLBACK;
