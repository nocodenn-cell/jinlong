-- ============================================================================
-- Restaura registrar_conferencia_nfe — Jīn Lóng, plano de remediação PR1.
--
-- Contexto (evidência completa em docs/AUDITORIA_CODIGO_MORTO_2026-08.md §A.2
-- e no Mapa Operacional de Usabilidade, achado "Importar NF-e não credita
-- estoque"):
--
--   1. 20260805213357_296_nfe_conferencia.sql (FLX-05) criou
--      `registrar_conferencia_nfe(uuid, jsonb)` como pré-requisito de
--      `confirmar_importacao_nfe(uuid)` — sem ela, nenhum item pode sair de
--      `status_conferencia = 'EM_CONFERENCIA'`, e `confirmar_importacao_nfe`
--      recusa a operação inteira (`IMPORT_NFE_CONFERENCIA_PENDENTE`).
--   2. 20260819230000_remove_funcoes_sem_consumidor.sql removeu a função 14
--      dias depois, corretamente, pelo critério vigente na época: nenhuma
--      chamada `.rpc()` no frontend a usava. A UI de Importar NF-e nunca foi
--      atualizada para o modelo FLX-05 — continuou chamando só
--      `importar_nfe_transacao` e tratando o retorno como conclusão.
--   3. Resultado em produção, confirmado por leitura direta antes desta
--      migration: `registrar_conferencia_nfe` NÃO existe em `pg_proc`;
--      `confirmar_importacao_nfe` existe mas é hoje inalcançável (todo item
--      fica preso em EM_CONFERENCIA para sempre) — nenhuma NF-e importada
--      depois de 2026-08-05 credita estoque ou custo.
--
-- Esta migration recria `registrar_conferencia_nfe` com o MESMO corpo,
-- assinatura e grants da 296 (nenhuma regra nova) — ela deixou de ter
-- consumidor por uma lacuna de sequenciamento entre backend e frontend, não
-- por estar errada. O consumidor agora existe:
-- app/gerente/estoque/importar-nfe/actions.ts → registrarConferenciaNfe →
-- InventoryMovementWriter.registrarConferenciaNfe →
-- RPC registrar_conferencia_nfe, alimentando a nova etapa de conferência da
-- tela /admin/estoque/importar-nfe antes de confirmar_importacao_nfe.
--
-- ATUALIZADA contra o schema atual, não restaurada às cegas (gate do PR1):
-- comparado o corpo da 296 com toda migration posterior que toca
-- importacoes_nfe(_itens/_duplicatas), estoque, custo de produto,
-- contas_pagar, kardex ou RLS relacionada. Uma diferença real foi
-- encontrada e corrigida nesta migration (não na 296 original): o corpo de
-- 296 validava só `v_qtd_conf IS NULL OR v_qtd_conf < 0`, o que não barra
-- 'NaN'/'Infinity' (Postgres numeric os trata como maiores que qualquer
-- valor finito em comparação direta) — a mesma classe de defeito que a
-- migration D0-03 (20260823192024_d0_remessa_quantidade_positiva_atomica.sql)
-- fechou para o par remessa/recebimento. Sem o guard adicionado abaixo,
-- `confirmar_importacao_nfe` creditaria NaN/Infinity em
-- `estoque.quantidade_atual` de forma permanente. Nenhuma outra migration
-- posterior às tabelas/colunas tocadas por este fluxo exige mudança
-- adicional no corpo restaurado (confirmado por leitura de
-- `importacoes_nfe_itens`/`importacoes_nfe` em produção — colunas e
-- constraints batem com a 296).
--
-- Deliberadamente NÃO restaurado: `registrar_conferencia_remessa` (função
-- irmã, do fluxo de Recebimento manual) — essa continua removida por
-- decisão do dono e por reabrir o defeito que a D0-03 fechou
-- (`20260824010000_fix_remessas_conferencia_columns_drift.sql`, comentário
-- explícito). Este PR não mexe no fluxo de Recebimento.
--
-- SEGUNDA CORREÇÃO — condição de corrida (achada em revisão antes do merge,
-- não pela investigação original): `confirmar_importacao_nfe` nunca foi
-- removida, mas ficou inalcançável desde 2026-08-19 — esta migration é o
-- que a torna alcançável de novo pela primeira vez em produção. O corpo
-- original da 296 lê `importacoes_nfe.status` com um SELECT simples (sem
-- lock) antes de creditar estoque/custo/contas_pagar e só então marca
-- CONCLUIDA. Duas chamadas concorrentes na mesma importação (dois gerentes,
-- duas abas) podem ambas passar pelo checque de status antes de qualquer
-- uma commitar, duplicando o crédito de estoque e a duplicata em
-- contas_pagar. Corrigido abaixo com `FOR UPDATE` na leitura de
-- `importacoes_nfe` em AMBAS as funções (registrar e confirmar) — mesmo
-- padrão de lock de linha já usado em `decrementar_estoque_seguro` e
-- `transferir_estoque_seguro` neste mesmo schema. A segunda chamada
-- concorrente bloqueia até a primeira commitar, então relê `status` já
-- `CONCLUIDA` e recusa com `IMPORT_NFE_STATUS_INVALIDO` — nunca credita
-- duas vezes. Nenhuma outra parte do corpo original muda.
--
-- Idempotente: usa CREATE OR REPLACE (a função pode já não existir, ou já
-- ter sido recriada por uma tentativa anterior desta mesma migration).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_conferencia_nfe(p_importacao_id uuid, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  el             jsonb;
  v_item_id      uuid;
  v_qtd_conf     numeric;
  v_qtd_nfe      numeric;
  v_div_obs      text;
  v_status       text;
  v_conferidos   int := 0;
  v_divergentes  int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  -- FOR UPDATE: serializa com confirmar_importacao_nfe na mesma importação —
  -- ver comentário de cabeçalho desta migration ("SEGUNDA CORREÇÃO").
  SELECT id, loja_id, status INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_ITENS_VAZIO';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_item_id  := (el->>'item_id')::uuid;
    v_qtd_conf := (el->>'quantidade_conferida')::numeric;
    v_div_obs  := NULLIF(trim(COALESCE(el->>'divergencia_obs', '')), '');

    -- Adaptação sobre o corpo original da 296 (menor correção necessária,
    -- não uma reescrita): Postgres numeric aceita o cast de 'NaN'/'Infinity'
    -- e os trata como maiores que qualquer valor finito em comparação direta
    -- (NaN > 0 e Infinity > 0 são verdadeiros) — o mesmo defeito que a
    -- migration D0-03 (20260823192024_d0_remessa_quantidade_positiva_atomica.sql)
    -- fechou para remessas, com o comentário explícito: "NaN persiste em
    -- remessa_itens, estoque e no log de movimento, corrompendo os três."
    -- Sem este checque, `v_qtd_conf < 0` sozinho não barra esses valores, e
    -- `confirmar_importacao_nfe` (`IF quantidade_conferida > 0`) creditaria
    -- NaN/Infinity em estoque.quantidade_atual de forma permanente. A 296
    -- original não tinha esta validação porque nunca chegou a ter consumidor
    -- (ver cabeçalho desta migration) — corrigido aqui, na restauração.
    IF v_qtd_conf IS NULL OR v_qtd_conf < 0
       OR v_qtd_conf = 'NaN'::numeric OR v_qtd_conf = 'Infinity'::numeric
    THEN
      RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_QTD_INVALIDA';
    END IF;

    SELECT quantidade_nfe INTO v_qtd_nfe
      FROM public.importacoes_nfe_itens
     WHERE id = v_item_id AND importacao_nfe_id = p_importacao_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'IMPORT_NFE_ITEM_NAO_ENCONTRADO';
    END IF;

    v_status := CASE WHEN v_qtd_conf = v_qtd_nfe THEN 'CONFERIDO' ELSE 'DIVERGENTE' END;
    IF v_status = 'CONFERIDO' THEN v_conferidos := v_conferidos + 1;
    ELSE v_divergentes := v_divergentes + 1; END IF;

    UPDATE public.importacoes_nfe_itens
       SET quantidade_conferida = v_qtd_conf,
           divergencia_obs      = v_div_obs,
           status_conferencia   = v_status,
           conferido_por        = v_uid,
           conferido_em         = now()
     WHERE id = v_item_id AND importacao_nfe_id = p_importacao_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'importacao_id', p_importacao_id,
    'itens_conferidos', v_conferidos, 'itens_divergentes', v_divergentes
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) IS
  'FLX-05 (2026-08-05, restaurada 2026-08-28 com consumidor em app/gerente/estoque/importar-nfe/actions.ts). Registra contagem física por item de importação de NF-e, com auditoria. Não move estoque nem gera contas_pagar — pré-requisito de confirmar_importacao_nfe.';

REVOKE ALL ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_nfe(uuid, jsonb) TO service_role;

-- ============================================================================
-- confirmar_importacao_nfe — mesmo corpo da 296, só com FOR UPDATE
-- acrescentado na leitura de importacoes_nfe (ver "SEGUNDA CORREÇÃO" no
-- cabeçalho desta migration). Esta função nunca foi removida; esta migration
-- é o que a torna alcançável pela primeira vez, então o fechamento da
-- condição de corrida precisa entrar junto, não depois.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  v_it           record;
  v_dup          record;
  v_pendentes    int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  -- FOR UPDATE: fecha a condição de corrida com chamadas concorrentes desta
  -- mesma função (ou de registrar_conferencia_nfe) sobre a mesma importação.
  -- Uma segunda chamada concorrente bloqueia aqui até a primeira commitar;
  -- ao prosseguir, relê status já CONCLUIDA e recusa abaixo — nunca credita
  -- estoque/custo/contas_pagar duas vezes para a mesma importação.
  SELECT id, loja_id, fornecedor_id, numero_nf, status INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  -- FLX-05: nenhum crédito de estoque sem conferência. Se qualquer item ainda
  -- está EM_CONFERENCIA, a operação inteira é recusada — tudo-ou-nada.
  SELECT count(*) INTO v_pendentes
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_PENDENTE';
  END IF;

  FOR v_it IN
    SELECT produto_id, quantidade_conferida, custo_unitario, atualizar_custo, status_conferencia
      FROM public.importacoes_nfe_itens
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    IF v_it.quantidade_conferida IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_imp.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_imp.loja_id,
        v_it.produto_id,
        'ENTRADA_NFE',
        v_it.quantidade_conferida,
        v_uid,
        format('Importação NF-e %s (conferido%s)', p_importacao_id::text,
               CASE WHEN v_it.status_conferencia = 'DIVERGENTE' THEN ', divergente da nota' ELSE '' END)
      );
    END IF;

    IF v_it.atualizar_custo AND v_it.custo_unitario > 0 THEN
      UPDATE public.produtos
         SET preco_custo = v_it.custo_unitario,
             updated_at  = now()
       WHERE id = v_it.produto_id;
    END IF;
  END LOOP;

  FOR v_dup IN
    SELECT numero_duplicata, data_vencimento, valor
      FROM public.importacoes_nfe_duplicatas
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    INSERT INTO public.contas_pagar (
      nfe_importacao_id, fornecedor_id, loja_id, nfe_numero, vencimento, valor_total, status
    ) VALUES (
      p_importacao_id, v_imp.fornecedor_id, v_imp.loja_id, v_dup.numero_duplicata,
      v_dup.data_vencimento, v_dup.valor, 'PENDENTE'
    );
  END LOOP;

  UPDATE public.importacoes_nfe
     SET status = 'CONCLUIDA'
   WHERE id = p_importacao_id;
END;
$$;

COMMENT ON FUNCTION public.confirmar_importacao_nfe(uuid) IS
  'FLX-05 (2026-08-05, endurecida contra corrida em 2026-08-28 ao ficar alcançável de novo). Credita estoque e gera contas_pagar só com base em quantidade_conferida (gravada por registrar_conferencia_nfe) — nunca do XML. Exige todos os itens conferidos. FOR UPDATE na leitura de importacoes_nfe impede dupla confirmação concorrente.';

REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO service_role;

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO — dentro da transação.
-- ============================================================================

DO $verify$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('public.registrar_conferencia_nfe(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'RESTAURA_296_RPC_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.registrar_conferencia_nfe(uuid,jsonb)'::regprocedure);
  IF position('NaN' IN v_def) = 0 OR position('Infinity' IN v_def) = 0 THEN
    RAISE EXCEPTION 'RESTAURA_296_GUARD_NAN_INFINITY_AUSENTE';
  END IF;
  IF position('FOR UPDATE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'RESTAURA_296_LOCK_AUSENTE_REGISTRAR';
  END IF;

  IF has_function_privilege('anon', 'public.registrar_conferencia_nfe(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RESTAURA_296_GRANT_ANON_INDEVIDO';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.registrar_conferencia_nfe(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RESTAURA_296_GRANT_AUTHENTICATED_AUSENTE';
  END IF;

  -- confirmar_importacao_nfe precisa continuar existindo, com o mesmo gate
  -- de conferência pendente E o lock de linha que fecha a corrida.
  IF to_regprocedure('public.confirmar_importacao_nfe(uuid)') IS NULL THEN
    RAISE EXCEPTION 'RESTAURA_296_CONFIRMAR_AUSENTE_PRE_REQUISITO_FALTANDO';
  END IF;

  v_def := pg_get_functiondef('public.confirmar_importacao_nfe(uuid)'::regprocedure);
  IF position('IMPORT_NFE_CONFERENCIA_PENDENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'RESTAURA_296_GATE_CONFERENCIA_AUSENTE';
  END IF;
  IF position('FOR UPDATE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'RESTAURA_296_LOCK_AUSENTE_CONFIRMAR';
  END IF;

  RAISE NOTICE 'restaura_registrar_conferencia_nfe OK — RPCs recriadas, guard NaN/Infinity presente, locks FOR UPDATE presentes (registrar + confirmar), grants corretos.';
END
$verify$;

COMMIT;
