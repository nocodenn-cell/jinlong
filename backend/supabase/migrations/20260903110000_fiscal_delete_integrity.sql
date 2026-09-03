-- Sprint C2.9 (P0-7, achado Codex) — `venda_id ON DELETE RESTRICT`
-- (20260902160000) foi correto mas insuficiente: protege a VENDA de ser
-- apagada enquanto tiver documento fiscal associado, mas não protege o
-- DOCUMENTO FISCAL em si de ser apagado diretamente.
--
-- ACHADOS CONFIRMADOS (consulta direta a pg_policy/information_schema
-- antes de escrever esta migration, não suposição):
--   1. `documentos_fiscais_pendentes` tinha uma policy RLS DELETE real
--      (`doc_fiscal_pendentes_delete_loja`, FOR DELETE, permissiva) que
--      deixava GERENTE/DONO da própria loja (ou ADMIN globalmente) apagar
--      DIRETAMENTE um documento fiscal — inclusive um EMITIDO, com chave/
--      protocolo reais da SEFAZ — via `DELETE FROM documentos_fiscais_
--      pendentes WHERE id = X`. Isso destruiria, em CASCADE, a trilha de
--      auditoria (`documentos_fiscais_eventos`) e a entrada de DLQ
--      correspondentes (ambas com `ON DELETE CASCADE` a partir de
--      `documento_id`), mesmo com `venda_id` protegido por RESTRICT.
--   2. `documentos_fiscais_dlq` tinha uma policy RLS `FOR ALL` (não
--      restrita a leitura) para o mesmo grupo de papéis — permitindo
--      excluir uma entrada de DLQ diretamente, SEM passar por
--      `fiscal_reprocessar_documento` (a única RPC que legitimamente
--      remove uma linha de DLQ, sempre com registro de evento e sempre
--      movendo o documento de volta para PENDENTE). Um DELETE direto
--      "destrancaria" silenciosamente um documento que o reaper havia
--      colocado em quarentena por esgotar tentativas, sem nenhuma decisão
--      consciente de reprocessamento e sem entrada correspondente em
--      `documentos_fiscais_eventos`.
--   3. `documentos_fiscais_eventos` (a trilha de auditoria) já não tinha
--      policy DELETE nenhuma (RLS nega por padrão) — mas dependia
--      inteiramente da proteção do PAI (`documentos_fiscais_pendentes`)
--      contra hard-delete, que o achado 1 mostra que não existia.
--
-- CORREÇÃO NA RAIZ (não CASCADE mecanicamente removido — os CASCADEs de
-- eventos_ai/dlq a partir de documento_id continuam corretos e intactos;
-- a raiz do problema era a PERMISSÃO de apagar o próprio documento_id, não
-- o mecanismo de cascade em si, exatamente como instruído):
--   * `documentos_fiscais_pendentes`: DROP da policy de DELETE — nenhum
--     `authenticated`/`anon` pode mais apagar um documento fiscal por
--     operação normal de usuário. "Remover da view" já tem o mecanismo
--     certo — `deleted_at` (soft delete, já usado em RPCs/queries
--     existentes) — sem precisar de hard delete.
--   * `documentos_fiscais_dlq`: policy trocada de FOR ALL para FOR SELECT
--     — leitura (ex.: painel gerencial) continua permitida; escrita
--     (INSERT/UPDATE/DELETE) só acontece via RPC SECURITY DEFINER
--     (`fiscal_reaper_documentos`/`fiscal_reprocessar_documento`), que
--     roda com privilégio do DONO da função, não do papel do chamador —
--     revogar o GRANT de escrita de `authenticated` não quebra essas RPCs.
--   * REVOKE DELETE (defesa em profundidade, além da RLS) nas 3 tabelas
--     para `authenticated`/`anon` — mesmo padrão já usado em
--     `20260828160000_revoke_grants_residuais_tabelas_deny_all.sql` desta
--     base de código.
--   * `service_role`/`postgres` NÃO são tocados — é o contexto de
--     confiança do sistema (worker, migrations, manutenção), fora do
--     escopo de "operação normal de usuário" que este P0 endereça.
--
-- ROLLBACK: recriar `doc_fiscal_pendentes_delete_loja` (FOR DELETE, mesmo
-- predicado de `doc_fiscal_pendentes_select_loja`) e reverter
-- `doc_fiscal_dlq_loja_isolado` para FOR ALL, disponíveis nas migrations
-- originais de RLS destas tabelas. GRANT DELETE de volta para
-- authenticated se necessário.

BEGIN;

DROP POLICY IF EXISTS "doc_fiscal_pendentes_delete_loja" ON public.documentos_fiscais_pendentes;

DROP POLICY IF EXISTS "doc_fiscal_dlq_loja_isolado" ON public.documentos_fiscais_dlq;
CREATE POLICY "doc_fiscal_dlq_loja_isolado_select"
  ON public.documentos_fiscais_dlq FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = (SELECT auth.uid())
      WHERE v.id = documentos_fiscais_dlq.venda_id
        AND (u.perfil = 'ADMIN' OR (u.perfil = ANY (ARRAY['GERENTE', 'DONO']) AND c.loja_id = u.loja_id))
    )
  );

REVOKE DELETE, INSERT, UPDATE ON public.documentos_fiscais_pendentes FROM authenticated, anon;
-- INSERT/UPDATE do fluxo normal continuam via RPC SECURITY DEFINER
-- (finalizar_venda_transacional_canonica_v4_unscoped / fiscal_enfileirar_
-- documento_venda / fiscal_marcar_*), que roda como o dono da função
-- (postgres), não como o papel do chamador — revogar de authenticated não
-- quebra nenhum desses caminhos. SELECT continua concedido (não tocado).

REVOKE DELETE, INSERT, UPDATE ON public.documentos_fiscais_dlq FROM authenticated, anon;

REVOKE DELETE ON public.documentos_fiscais_eventos FROM authenticated, anon;

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_uid uuid;
  v_venda_id uuid;
  v_doc_id uuid;
  v_bloqueado_pendentes boolean := false;
  v_bloqueado_dlq boolean := false;
  v_count_del_policies integer;
BEGIN
  -- Estrutural: nenhuma policy de DELETE deve sobrar em
  -- documentos_fiscais_pendentes; documentos_fiscais_dlq deve ter só SELECT.
  SELECT count(*) INTO v_count_del_policies
  FROM pg_policy
  WHERE polrelid = 'public.documentos_fiscais_pendentes'::regclass AND polcmd = 'd';
  IF v_count_del_policies <> 0 THEN
    RAISE EXCEPTION 'C2_9_P07_DELETE_POLICY_AINDA_EXISTE_PENDENTES: %', v_count_del_policies;
  END IF;

  SELECT count(*) INTO v_count_del_policies
  FROM pg_policy
  WHERE polrelid = 'public.documentos_fiscais_dlq'::regclass AND polcmd IN ('d', '*');
  IF v_count_del_policies <> 0 THEN
    RAISE EXCEPTION 'C2_9_P07_DELETE_OU_ALL_POLICY_AINDA_EXISTE_DLQ: %', v_count_del_policies;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name IN ('documentos_fiscais_pendentes','documentos_fiscais_dlq','documentos_fiscais_eventos')
      AND grantee IN ('authenticated','anon') AND privilege_type = 'DELETE'
  ) THEN
    RAISE EXCEPTION 'C2_9_P07_GRANT_DELETE_AINDA_EXISTE_PARA_AUTHENTICATED_ANON';
  END IF;

  -- Prova viva: sessão autenticada real (GERENTE) tenta DELETE direto em
  -- documentos_fiscais_pendentes (documento EMITIDO) e em
  -- documentos_fiscais_dlq — ambos precisam ser negados pelo Postgres
  -- (RLS nega match -> 0 linhas afetadas, não erro de permissão explícito,
  -- já que a policy simplesmente não existe mais para casar nenhuma linha).
  SELECT u.id INTO v_uid FROM public.usuarios u WHERE u.perfil IN ('GERENTE', 'DONO', 'ADMIN') LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'C2_9_P07: sem usuário gerencial para prova viva; verificação estrutural OK';
  ELSE
    v_venda_id := gen_random_uuid();
    INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
    VALUES (v_venda_id, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');

    INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
    VALUES (v_venda_id, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
    RETURNING id INTO v_doc_id;
    UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = v_doc_id;
    UPDATE public.documentos_fiscais_pendentes SET status = 'EMITIDO', chave_fiscal = repeat('7', 44), protocolo = 'PROTO-P07' WHERE id = v_doc_id;

    INSERT INTO public.documentos_fiscais_dlq (documento_id, venda_id, tipo_doc, payload, motivo, original_status, original_tentativas)
    VALUES (v_doc_id, v_venda_id, 'NFC_E_STUB', '{}'::jsonb, 'PROVA_P07', 'ERRO', 1);

    -- Simula sessão autenticada real via role authenticated + JWT — sem
    -- isso, o teste rodaria como postgres (que bypassa RLS por padrão) e
    -- não provaria nada sobre a policy. Duas defesas coexistem agora
    -- (REVOKE de GRANT + remoção da policy de DELETE): a tentativa pode
    -- ser negada por qualquer uma das duas — como `permission denied`
    -- (erro, pega no EXCEPTION) ou como RLS filtrando a linha (ROW_COUNT=0,
    -- sem erro) — ambos contam como "bloqueado" para este teste.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    SET LOCAL ROLE authenticated;

    BEGIN
      DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
      GET DIAGNOSTICS v_bloqueado_pendentes = ROW_COUNT;
      v_bloqueado_pendentes := (v_bloqueado_pendentes = 0)::boolean;
    EXCEPTION WHEN insufficient_privilege THEN
      v_bloqueado_pendentes := true;
    END;

    BEGIN
      DELETE FROM public.documentos_fiscais_dlq WHERE documento_id = v_doc_id;
      GET DIAGNOSTICS v_bloqueado_dlq = ROW_COUNT;
      v_bloqueado_dlq := (v_bloqueado_dlq = 0)::boolean;
    EXCEPTION WHEN insufficient_privilege THEN
      v_bloqueado_dlq := true;
    END;

    RESET ROLE;

    IF NOT v_bloqueado_pendentes THEN
      RAISE EXCEPTION 'C2_9_P07_DELETE_DIRETO_PENDENTES_NAO_BLOQUEADO';
    END IF;
    IF NOT v_bloqueado_dlq THEN
      RAISE EXCEPTION 'C2_9_P07_DELETE_DIRETO_DLQ_NAO_BLOQUEADO';
    END IF;

    -- Confirma que nada sumiu de fato (documento, DLQ e trilha de eventos
    -- continuam intactos após as tentativas negadas).
    IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id AND status = 'EMITIDO') THEN
      RAISE EXCEPTION 'C2_9_P07_DOCUMENTO_EMITIDO_SUMIU';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_dlq WHERE documento_id = v_doc_id) THEN
      RAISE EXCEPTION 'C2_9_P07_ENTRADA_DLQ_SUMIU';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id) THEN
      RAISE EXCEPTION 'C2_9_P07_TRILHA_AUDITORIA_SUMIU';
    END IF;

    -- Limpeza (como postgres, fora do papel authenticated simulado acima).
    DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
    DELETE FROM public.documentos_fiscais_dlq WHERE documento_id = v_doc_id;
    DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
    DELETE FROM public.vendas WHERE id = v_venda_id;
  END IF;
END
$verify$;

COMMIT;
