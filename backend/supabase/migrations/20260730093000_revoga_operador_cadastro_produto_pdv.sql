-- STATUS: APLICADA NO PIPELINE NORMAL
--
-- Remove permissão de cadastro de produto pelo OPERADOR.
--
-- Contexto:
-- O cadastro de produto pertence ao módulo Produtos.
-- O PDV não deve criar produtos.
--
-- Reverte:
--   20260718135138_criar_produto_permite_operador_pdv.sql
--   20260718135500_ajuste_estoque_inicial_operador_pdv.sql
--
-- Estratégia:
-- Não reescreve funções manualmente.
-- Deriva a definição atual via pg_get_functiondef()
-- e substitui somente os gates necessários.
--
-- ACL:
-- CREATE OR REPLACE FUNCTION preserva grants existentes.

BEGIN;


-- ============================================================
-- 1) criar_produto_com_estoque_inicial
-- Remove OPERADOR do gate de criação de produto
-- ============================================================

DO $mig$
DECLARE
  v_def text;
  v_novo text;

  v_gate_antigo text :=
    $frag$IF v_perfil NOT IN ('OPERADOR', 'GERENTE', 'DONO', 'ADMIN') THEN$frag$;

  v_gate_novo text :=
    $frag$IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN$frag$;

BEGIN

  v_def := pg_get_functiondef(
    'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)'::regprocedure
  );


  IF position(v_gate_antigo IN v_def) > 0 THEN

    v_novo := replace(
      v_def,
      v_gate_antigo,
      v_gate_novo
    );

    EXECUTE v_novo;

  ELSIF position(v_gate_novo IN v_def) > 0 THEN

    RAISE NOTICE
      'criar_produto_com_estoque_inicial já está sem OPERADOR';

  ELSE

    RAISE EXCEPTION
      'MIG_GATE_CRIAR_PRODUTO_NAO_ENCONTRADO';

  END IF;


  v_def := pg_get_functiondef(
    'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)'::regprocedure
  );


  IF position(v_gate_antigo IN v_def) > 0 THEN
    RAISE EXCEPTION
      'MIG_CRIAR_PRODUTO_GATE_ANTIGO_PRESENTE';
  END IF;


  IF position(v_gate_novo IN v_def) = 0 THEN
    RAISE EXCEPTION
      'MIG_CRIAR_PRODUTO_GATE_NOVO_AUSENTE';
  END IF;


END
$mig$;



-- ============================================================
-- 2) ajustar_estoque_manual
-- Remove exceção estreita de estoque inicial para OPERADOR
-- ============================================================

DO $mig$
DECLARE

  v_def text;
  v_novo text;

  v_decl_antigo text :=
$frag$
  v_estoque_inicial boolean;$frag$;


  v_bloco_antigo text :=
$frag$
  v_estoque_inicial := p_motivo_codigo = 'ACERTO_INVENTARIO'
    AND COALESCE(BTRIM(p_observacao), '') = 'Estoque inicial no cadastro de produto';
  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN')
     AND NOT (v_perfil = 'OPERADOR' AND v_estoque_inicial) THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_PERFIL';
  END IF;$frag$;


  v_bloco_novo text :=
$frag$
  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_PERFIL';
  END IF;$frag$;


BEGIN


  v_def := pg_get_functiondef(
    'public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)'::regprocedure
  );


  IF position(v_bloco_antigo IN v_def) > 0 THEN

    v_novo := replace(
      v_def,
      v_bloco_antigo,
      v_bloco_novo
    );


    v_novo := replace(
      v_novo,
      v_decl_antigo,
      ''
    );


    EXECUTE v_novo;


  ELSE

    IF position(v_bloco_novo IN v_def) > 0 THEN

      RAISE NOTICE
        'ajustar_estoque_manual já está sem exceção OPERADOR';

    ELSE

      RAISE EXCEPTION
        'MIG_GATE_AJUSTE_NAO_ENCONTRADO';

    END IF;

  END IF;



  v_def := pg_get_functiondef(
    'public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)'::regprocedure
  );


  IF position(v_bloco_antigo IN v_def) > 0 THEN
    RAISE EXCEPTION
      'MIG_AJUSTE_BLOCO_ANTIGO_PRESENTE';
  END IF;


  IF position(v_bloco_novo IN v_def) = 0 THEN
    RAISE EXCEPTION
      'MIG_AJUSTE_GATE_NOVO_AUSENTE';
  END IF;


  -- Guard rails de integridade

  IF position('AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA' IN v_def) = 0 THEN
    RAISE EXCEPTION
      'MIG_AJUSTE_CORPO_DEGRADADO_VALIDACAO_REMOVIDA';
  END IF;


  IF position('movimentos_estoque_log' IN v_def) = 0 THEN
    RAISE EXCEPTION
      'MIG_AJUSTE_CORPO_DEGRADADO_KARDEX_REMOVIDO';
  END IF;


END
$mig$;



COMMENT ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid)
IS
'Cria produto + estoque + kardex inicial. Permissão GERENTE+ apenas. Cadastro de produto removido do PDV em 2026-07-30.';



COMMIT;