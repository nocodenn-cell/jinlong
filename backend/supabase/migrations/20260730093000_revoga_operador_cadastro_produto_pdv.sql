-- STATUS: NÃO APLICADA. Limpeza de permissão SEM URGÊNCIA — aplicar em janela
-- de manutenção do Supabase, pelo pipeline normal (§1 de
-- docs/CHECKLIST_DEPLOY_SUPABASE.md). Prioridade atual é fluxo comercial e
-- estabilidade do piloto.
--
-- NÃO CORRIGE EXPOSIÇÃO: as funções tocadas têm EXECUTE apenas para postgres e
-- service_role, nunca para authenticated/anon — a permissão órfã nunca foi
-- alcançável por cliente algum. É redução de superfície, não incidente.
--
-- Escopo, impacto em testes e ROLLBACK: docs/P2_GOVERNANCA_RLS_E_PENTEST.md §5.
--
-- Revoga as permissões de OPERADOR que existiam APENAS para o cadastro
-- relâmpago no PDV, removido em 2026-07-30 (o PDV não cadastra produto; isso
-- pertence ao módulo Produtos). Ver docs/architecture/pdv_cadastro_removido.md.
--
-- Reverte, na prática, os gates de perfil de:
--   20260718135138_criar_produto_permite_operador_pdv.sql
--   20260718135500_ajuste_estoque_inicial_operador_pdv.sql
--
-- NÃO altera nenhuma outra permissão de estoque: os demais gates, motivos,
-- validações, kardex e ACLs ficam intactos.
--
-- TÉCNICA: em vez de reescrever o corpo das funções à mão (5 KB de plpgsql —
-- onde um erro de transcrição viraria incidente), a migração DERIVA o novo
-- corpo da definição viva com `replace()` literal e falha alto se o texto
-- esperado não existir. Assim o corpo fica byte-idêntico exceto o gate.
--
-- ACL: `CREATE OR REPLACE FUNCTION` preserva os grants existentes
-- (postgres/service_role EXECUTE). Nada de GRANT/REVOKE aqui, de propósito.

BEGIN;

-- 1) criar_produto_com_estoque_inicial: remove OPERADOR da lista de perfis.
DO $mig$
DECLARE
  v_def text;
  v_novo text;
  v_de   text := $frag$IF v_perfil NOT IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN') THEN$frag$;
  v_para text := $frag$IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN$frag$;
BEGIN
  v_def := pg_get_functiondef(
    'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)'::regprocedure
  );

  IF position(v_de IN v_def) = 0 THEN
    IF position(v_para IN v_def) > 0 THEN
      RAISE NOTICE 'criar_produto_com_estoque_inicial: gate já sem OPERADOR — nada a fazer.';
      RETURN;
    END IF;
    RAISE EXCEPTION 'MIG_GATE_CRIAR_PRODUTO_NAO_ENCONTRADO: gate de perfil não casou; revisar manualmente.';
  END IF;

  v_novo := replace(v_def, v_de, v_para);
  EXECUTE v_novo;

  IF position('OPERADOR' IN pg_get_functiondef(
       'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'MIG_CRIAR_PRODUTO_AINDA_CITA_OPERADOR: replace não surtiu efeito.';
  END IF;
END
$mig$;

-- 2) ajustar_estoque_manual(7 args): remove a exceção estreita de estoque
--    inicial para OPERADOR, junto com a variável que só servia a ela.
--    O overload de 6 args NÃO é tocado (delega a este com ator NULL).
DO $mig$
DECLARE
  v_def text;
  v_novo text;
  v_decl_de text := $frag$
  v_estoque_inicial boolean;$frag$;
  v_bloco_de text := $frag$  v_estoque_inicial := p_motivo_codigo = 'ACERTO_INVENTARIO'
    AND COALESCE(BTRIM(p_observacao), '') = 'Estoque inicial no cadastro de produto';
  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN')
     AND NOT (v_perfil = 'OPERADOR' AND v_estoque_inicial) THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_PERFIL';
  END IF;$frag$;
  v_bloco_para text := $frag$  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN RAISE EXCEPTION 'AJUSTE_ESTOQUE_PERFIL'; END IF;$frag$;
BEGIN
  v_def := pg_get_functiondef(
    'public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)'::regprocedure
  );

  IF position(v_bloco_de IN v_def) = 0 THEN
    IF position('OPERADOR' IN v_def) = 0 THEN
      RAISE NOTICE 'ajustar_estoque_manual: exceção de OPERADOR já ausente — nada a fazer.';
      RETURN;
    END IF;
    RAISE EXCEPTION 'MIG_GATE_AJUSTE_NAO_ENCONTRADO: bloco de perfil não casou; revisar manualmente.';
  END IF;

  v_novo := replace(v_def, v_bloco_de, v_bloco_para);
  v_novo := replace(v_novo, v_decl_de, '');
  EXECUTE v_novo;

  v_def := pg_get_functiondef(
    'public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)'::regprocedure
  );
  IF position('OPERADOR' IN v_def) > 0 OR position('v_estoque_inicial' IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG_AJUSTE_AINDA_CITA_OPERADOR: replace não surtiu efeito.';
  END IF;
  -- Guarda-corpo: o resto do corpo tem de continuar íntegro.
  IF position('AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA' IN v_def) = 0
     OR position('movimentos_estoque_log' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG_AJUSTE_CORPO_DEGRADADO: kardex/validações sumiram do corpo.';
  END IF;
END
$mig$;

COMMENT ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) IS
  'Cria produto + linha estoque + opcional ajuste/kardex em uma única transação. Idempotente via p_request_id. GERENTE+ apenas — cadastro no PDV foi removido em 2026-07-30.';

COMMIT;
