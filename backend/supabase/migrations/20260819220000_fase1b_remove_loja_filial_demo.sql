-- ============================================================
-- Fase 1B — item 1B-3: remove a `Filial demo` do caminho do repositório
--
-- CONTEXTO
--
-- `036_loja_filial_demo.sql` cria a loja `Filial demo`
-- (`a0000002-0000-4000-8000-000000000002`, código `FILIAL_DEMO`) como dado
-- semente de desenvolvimento. Ela foi REMOVIDA À MÃO de produção em
-- 2026-08-19, por decisão do dono, junto das demais lojas de teste
-- (retrato em `backend/scripts/rollback/lojas-teste.pre-2026-08-19.sql`).
--
-- Verificado em produção nesta data: `public.lojas` contém APENAS `Matriz`.
--
-- Consequência antes desta migration: um `db reset` a partir do Git recriava
-- a loja demo, e o banco reconstruído divergia de produção. Catalogado em
-- `docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md`.
--
-- O QUE ESTA MIGRATION FAZ
--
-- Remove a loja demo ao final da cadeia de migrations, de modo que tanto um
-- banco novo quanto produção terminem no mesmo estado. A `036` é preservada
-- como registro histórico — reescrevê-la quebraria a reprodutibilidade de
-- qualquer checkout anterior a esta data.
--
-- SEGURANÇA — por que o guard é dinâmico
--
-- `lojas` tem 29 tabelas dependentes por FK. Enumerá-las à mão aqui criaria
-- uma lista que envelhece: a primeira tabela nova com `loja_id` passaria
-- despercebida, e o DELETE falharia por violação de FK no meio de um deploy,
-- ou — pior — o dado seria apagado se alguém adicionasse `ON DELETE CASCADE`.
--
-- Em vez disso, a migration VARRE `information_schema` em tempo de execução e
-- conta linhas da loja demo em toda tabela que referencie `lojas`. Só
-- `formas_pagamento` é aceita como resíduo de seed (é o que a `036` popula).
-- Qualquer outra dependência com linhas ABORTA a migration: uma loja demo com
-- venda, estoque ou usuário vinculado não é mais uma loja demo, e apagá-la em
-- silêncio destruiria dado de negócio.
--
-- Idempotente: `DELETE` de linha ausente é no-op; a varredura não roda quando
-- a loja já não existe (estado de produção).
-- ============================================================

DO $$
DECLARE
  v_loja_id    uuid := 'a0000002-0000-4000-8000-000000000002';
  r            record;
  v_count      bigint;
  v_bloqueios  text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lojas WHERE id = v_loja_id) THEN
    RAISE NOTICE 'FASE1B: loja demo ausente — nada a fazer (estado de producao).';
    RETURN;
  END IF;

  FOR r IN
    SELECT DISTINCT tc.table_name AS tabela, kcu.column_name AS coluna
    FROM   information_schema.table_constraints tc
    JOIN   information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema    = tc.table_schema
    JOIN   information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
    WHERE  tc.constraint_type = 'FOREIGN KEY'
      AND  tc.table_schema    = 'public'
      AND  ccu.table_name     = 'lojas'
      -- resíduo de seed conhecido, removido logo abaixo
      AND  tc.table_name <> 'formas_pagamento'
    ORDER  BY 1
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = %L',
                   r.tabela, r.coluna, v_loja_id)
    INTO v_count;

    IF v_count > 0 THEN
      v_bloqueios := v_bloqueios || format('%s.%s=%s ', r.tabela, r.coluna, v_count);
    END IF;
  END LOOP;

  IF v_bloqueios <> '' THEN
    RAISE EXCEPTION
      'FASE1B_LOJA_DEMO_EM_USO: dependencias com dado real [ % ] — remocao abortada, decisao humana necessaria',
      trim(v_bloqueios);
  END IF;

  DELETE FROM public.formas_pagamento WHERE loja_id = v_loja_id;
  DELETE FROM public.lojas            WHERE id      = v_loja_id;

  RAISE NOTICE 'FASE1B: loja demo % removida (nenhuma dependencia com dado real).', v_loja_id;
END;
$$;
