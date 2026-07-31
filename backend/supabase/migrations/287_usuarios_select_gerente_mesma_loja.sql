-- Migration 287: permite GERENTE ler usuarios da propria loja (SELECT).
-- Data: 2026-07-30
--
-- PROBLEMA
-- --------
-- public.usuarios tem apenas duas policies de SELECT:
--   * usuario_select_own   -- auth.uid() = id (só a própria linha)
--   * dono_select_all      -- auth_usuario_eh_dono() (só DONO vê todo mundo)
-- Não existe policy para GERENTE ler outras linhas de usuarios — nem mesmo
-- da própria loja. Efeito observado: o Dashboard (/admin/dashboard), que
-- resolve o nome do operador de cada venda via
-- `supabase.from('usuarios').select('id,nome').in('id', operatorIds)`
-- usando o cliente com sessão do usuário (RLS aplicado, não service_role),
-- retorna 0 linhas quando quem está logado é GERENTE — a coluna "Operador"
-- fica sempre "—", mesmo com os `operador_id` corretos gravados em `vendas`
-- e as linhas correspondentes existindo em `usuarios`. Confirmado com
-- sessão real (e2e-gerente): `vendas.operador_id` populado, `usuarios.nome`
-- existente, mas RLS bloqueia a leitura para o papel GERENTE.
--
-- CAUSA RAIZ
-- ----------
-- A tabela usuarios foi hardened para "dono vê tudo, resto só a si mesmo",
-- sem contemplar o caso do gerente precisar ver nomes de operadores da
-- mesma loja para telas de auditoria/dashboard.
--
-- FIX
-- ---
-- Nova policy de SELECT reaproveitando `auth_usuario_gerencial_loja(uuid)`
-- — a mesma função já usada em outras 6 policies do projeto (migration 278)
-- para "GERENTE/DONO/ADMIN da própria loja, ADMIN de qualquer loja". Não
-- amplia acesso além do necessário: um GERENTE só enxerga usuarios cuja
-- `loja_id` bate com a sua própria (a função já reflete essa regra).
--
-- ESCOPO
-- ------
-- Apenas DDL de policy (CREATE POLICY). Nenhuma função, tabela ou grant
-- alterado. Nenhum código de aplicação alterado nesta migration.
--
-- REVERSÃO
-- --------
--   DROP POLICY IF EXISTS gerente_select_mesma_loja ON public.usuarios;

BEGIN;

CREATE POLICY gerente_select_mesma_loja ON public.usuarios
  FOR SELECT
  TO authenticated
  USING (public.auth_usuario_gerencial_loja(loja_id));

COMMENT ON POLICY gerente_select_mesma_loja ON public.usuarios IS
  'Migration 287: permite GERENTE/DONO/ADMIN ler usuarios da mesma loja '
  '(resolve nome do operador em telas de auditoria/dashboard). '
  'ADMIN enxerga qualquer loja via auth_usuario_gerencial_loja.';

NOTIFY pgrst, 'reload schema';

COMMIT;
