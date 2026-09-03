-- PR-1A do plano de fechamento de gaps (auditoria Jīn Lóng, achado P0 #1):
-- GERENTE/ADMIN podia se auto-promover a DONO via PATCH direto em
-- public.usuarios, mesmo sem nenhuma RPC envolvida.
--
-- CAUSA RAIZ
-- ----------
-- A única policy de UPDATE em `usuarios` (`usuarios_update_idioma_gerente_dono`,
-- criada em 044, reescrita em 224/251 só para o wrap de performance do
-- `auth.uid()`) restringe LINHA (o próprio usuário) e o CONJUNTO de valores
-- aceitos em `perfil`/`idioma_preferido` — mas não impede que `perfil` MUDE
-- dentro desse conjunto:
--
--   USING ( (SELECT auth.uid()) = id AND perfil = ANY('GERENTE','DONO','ADMIN') )
--   WITH CHECK ( (SELECT auth.uid()) = id AND perfil = ANY('GERENTE','DONO','ADMIN')
--                AND idioma_preferido = ANY('pt','zh') )
--
-- Um GERENTE (satisfaz USING) enviando `{"perfil":"DONO"}` satisfaz também o
-- WITH CHECK (DONO está no mesmo array) — a policy nunca comparou
-- `NEW.perfil` com `OLD.perfil`. Não há GRANT de coluna restringindo o
-- UPDATE: `usuarios` herdou UPDATE em TODAS as colunas via
-- `20260621005300_255_grant_baseline_tabelas_authenticated.sql`
-- (`GRANT ... ON ALL TABLES IN SCHEMA public TO authenticated`), nunca
-- revogado depois.
--
-- CONSUMIDORES LEGÍTIMOS CONFIRMADOS (grep completo de
-- `.from('usuarios')...update(` em pdv-importados, antes desta migration)
-- ----------------------------------------------------------------------
--   1. pdv-importados/app/gerente/idioma/actions.ts:18-21 — `createClient()`
--      (role `authenticated`), só `.update({ idioma_preferido })`.
--   2. pdv-importados/app/caixa/idioma/actions.ts:19-22 — idem, `authenticated`,
--      só `idioma_preferido`.
--   3. pdv-importados/app/admin/funcionarios/actions.ts:230-236 (perfil/nome)
--      e :325-329 (ativo) — usam `createAdminClient()` (`service_role`, ver
--      `pdv-importados/lib/supabase/admin.ts`, marcado `server-only`).
--      `service_role` não é afetado por REVOKE/GRANT de `authenticated` —
--      esses dois fluxos administrativos continuam funcionando inalterados.
--
-- Nenhum outro caminho de código faz UPDATE em `usuarios` como `authenticated`.
--
-- CORREÇÃO (menor possível — grant de coluna, sem tocar a RLS policy)
-- ---------------------------------------------------------------------
-- Revogar UPDATE de todas as colunas de `authenticated` e reconceder só na
-- coluna `idioma_preferido`. Isso barra a escrita de `perfil` (e de
-- qualquer outra coluna) na camada de GRANT do Postgres, antes mesmo da RLS
-- ser avaliada — a policy existente continua intacta e correta para o único
-- caso que ela precisa cobrir (trocar o próprio idioma).
--
-- ROLLBACK
-- --------
--   REVOKE UPDATE (idioma_preferido) ON public.usuarios FROM authenticated;
--   GRANT UPDATE ON public.usuarios TO authenticated;
--   NOTIFY pgrst, 'reload schema';
-- (restaura exatamente o grant amplo herdado da 255 — nenhuma linha ou
-- policy é tocada em nenhuma direção.)

BEGIN;

REVOKE UPDATE ON public.usuarios FROM authenticated;
GRANT UPDATE (idioma_preferido) ON public.usuarios TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — falha a transação se o grant não ficou exatamente como
-- esperado (nem mais restrito a ponto de quebrar idioma, nem mais aberto a
-- ponto de deixar perfil/loja_id/ativo/nome editáveis).
-- ═══════════════════════════════════════════════════════════════════════════

DO $verify$
BEGIN
  IF has_column_privilege('authenticated', 'public.usuarios', 'perfil', 'UPDATE') THEN
    RAISE EXCEPTION 'USUARIOS_PERFIL_AINDA_EDITAVEL: authenticated ainda pode UPDATE perfil';
  END IF;

  IF has_column_privilege('authenticated', 'public.usuarios', 'loja_id', 'UPDATE') THEN
    RAISE EXCEPTION 'USUARIOS_LOJA_ID_AINDA_EDITAVEL: authenticated ainda pode UPDATE loja_id';
  END IF;

  IF has_column_privilege('authenticated', 'public.usuarios', 'ativo', 'UPDATE') THEN
    RAISE EXCEPTION 'USUARIOS_ATIVO_AINDA_EDITAVEL: authenticated ainda pode UPDATE ativo';
  END IF;

  IF has_column_privilege('authenticated', 'public.usuarios', 'nome', 'UPDATE') THEN
    RAISE EXCEPTION 'USUARIOS_NOME_AINDA_EDITAVEL: authenticated ainda pode UPDATE nome';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.usuarios', 'idioma_preferido', 'UPDATE') THEN
    RAISE EXCEPTION 'USUARIOS_IDIOMA_PREFERIDO_SEM_GRANT: fluxo legítimo de troca de idioma quebraria';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.usuarios', 'UPDATE') THEN
    RAISE EXCEPTION 'USUARIOS_SERVICE_ROLE_PERDEU_UPDATE: fluxo de funcionarios/actions.ts quebraria';
  END IF;

  RAISE NOTICE 'GRANT de coluna em usuarios OK — authenticated só pode UPDATE idioma_preferido; perfil/loja_id/ativo/nome protegidos; service_role intocado.';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
