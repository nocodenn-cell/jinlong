-- ============================================================
-- Remoção de funções sem consumidor — autorizada pelo dono em 2026-08-19
--
-- Base: `docs/AUDITORIA_CODIGO_MORTO_2026-08.md`, grupo A.
--
-- Critério aplicado a cada função antes de entrar nesta lista: não é função
-- de trigger; não é referenciada no corpo de nenhuma outra função; não aparece
-- em `pg_trigger`, `pg_policies`, `pg_views`, `pg_constraint` nem `pg_attrdef`;
-- não tem chamada `.rpc()` no `pdv-importados`, no `pdv-local`, nas Edge
-- Functions ou em `backend/scripts`; e não há agendamento — `pg_cron` está
-- instalado e `cron.job` está vazio em produção.
--
-- Referência que aparece SOMENTE em `database.types.ts` não conta como
-- consumo: o arquivo é gerado a partir do schema, então toda função aparece
-- nele por construção.
--
-- NÃO ENTRAM AQUI, e o motivo fica registrado para quem vier depois:
--
--   `verificar_consistencia_venda`, `relatorio_consistencia_vendas`
--       diagnósticos operacionais, sem consumidor POR DESENHO — restritos a
--       service_role justamente para não serem alcançáveis pelo app. GATE 9
--       existe para provar que continuam fechados.
--   `transferir_estoque_entre_lojas`
--       sem consumidor no app, mas exercitada por 3 das 42 regras de
--       `test:rls-scope`. Remover reduz cobertura de autorização.
--   `fiscal_reaper_documentos`
--       NUNCA foi agendada, e é exatamente por isso que fica: é salvaguarda
--       contra documento fiscal preso em EM_PROCESSAMENTO. A ação correta é
--       agendar (item 20 do backlog), não apagar.
--   `caixa_integridade_gate_check`, `listar_valores_sistema_dinheiro_caixas`,
--   `shadow_validar_venda_engine_v4`
--       existem SÓ em produção — nenhuma migration do repositório as cria.
--       Removê-las é item 1B-5, não limpeza de repositório.
--
-- Idempotente: cada DROP é guardado por `to_regprocedure`, que devolve NULL
-- quando a assinatura não existe — necessário porque parte destas funções
-- existe no repositório e não em produção (ex.: `registrar_conferencia_remessa`).
-- ============================================================

DO $$
DECLARE
  v_alvos text[] := ARRAY[
    -- CRUD de funcionarios_meta (20260711143312_267_funcionarios_meta_crud.sql).
    -- Quatro destas já haviam sido alvo de
    -- `20260731201500_revoke_anon_authenticated_funcoes_sem_uso_publico.sql`,
    -- migration cujo próprio nome reconhece que não têm uso.
    'public.fn_criar_funcionario(uuid, uuid, text, text, text, numeric, text, numeric)',
    'public.fn_atualizar_funcionario(uuid, text, text, numeric, text, numeric)',
    'public.fn_desativar_funcionario(uuid)',
    'public.fn_listar_funcionarios_gerente(uuid, text, text)',
    'public.resumo_comissoes_por_funcionario(uuid, date, date)',
    'public.total_vendas_por_funcionario(uuid, date, date)',

    -- Conferência de recebimento, sem consumidor.
    'public.registrar_conferencia_nfe(uuid, jsonb)',
    'public.registrar_conferencia_remessa(uuid, jsonb, text)',

    -- Helpers órfãos.
    'public.venda_eventos_items_from_payload(jsonb)',

    -- Shim legado: a `070` fez com que delegue a `decrementar_estoque_seguro` e
    -- a `071` removeu EXECUTE de authenticated. `pdv-importados/core/sync/
    -- TAURI_SYNC.md` documenta que a sync-outbox migrou.
    -- RISCO ACEITO PELO DONO em 2026-08-19: um binário antigo do `pdv-local`
    -- em campo que ainda chame esta RPC passa a receber erro de função
    -- inexistente. Nenhum cliente desatualizado foi confirmado — mas também
    -- não foi possível provar que não existe.
    'public.decrementar_estoque_idempotente(uuid, numeric, uuid)'
  ];
  v_alvo      text;
  v_removidas int := 0;
  v_ausentes  int := 0;
BEGIN
  FOREACH v_alvo IN ARRAY v_alvos LOOP
    IF to_regprocedure(v_alvo) IS NOT NULL THEN
      EXECUTE format('DROP FUNCTION %s', v_alvo);
      v_removidas := v_removidas + 1;
      RAISE NOTICE 'removida: %', v_alvo;
    ELSE
      v_ausentes := v_ausentes + 1;
      RAISE NOTICE 'ausente (nada a fazer): %', v_alvo;
    END IF;
  END LOOP;

  RAISE NOTICE 'codigo morto SQL: % removida(s), % ja ausente(s).', v_removidas, v_ausentes;
END;
$$;
