-- ============================================================================
-- contas_pagar: `nfe_numero` volta a significar "numero da NF-e"
-- ============================================================================
-- Achado do QA operacional do fluxo Nota de Entrada -> Estoque -> Financeiro:
-- toda parcela gerada por importacao de NF-e aparecia na tela de Contas a
-- pagar como "NF-e #1" / "NF-e #2" -- nunca o numero real da nota.
--
-- Causa raiz: a coluna nasceu como `numero_duplicata` e foi renomeada para
-- `nfe_numero` em 108_contas_pagar_schema_e_rpc_pagamento.sql, mas quem
-- escreve (`confirmar_importacao_nfe`) continuou gravando
-- `v_dup.numero_duplicata`. O nome da coluna passou a mentir sobre o conteudo,
-- e todo consumidor do dado (tela, CSV, relatorio, integracao) herdou a
-- mentira. O frontend passou a ler o numero correto pela importacao vinculada
-- como contorno de exibicao; este migration corrige a ORIGEM para que o
-- contorno deixe de ser necessario.
--
-- Correcao canonica, sem perder informacao:
--   1. `parcela_numero` passa a existir e guarda o numero da duplicata/parcela
--      dentro da nota (o dado que hoje ocupa indevidamente `nfe_numero`).
--   2. `nfe_numero` passa a receber `importacoes_nfe.numero_nf`.
--   3. Backfill move o dado existente para a coluna certa em vez de descarta-lo:
--      linhas ligadas a uma importacao recebem o numero da nota e preservam o
--      numero da parcela.
--
-- Titulos sem `nfe_importacao_id` (lancamento fora do fluxo de NF-e) nao sao
-- tocados: nao ha nota de onde derivar numero, e sobrescrever seria inventar
-- dado. Nesses casos `nfe_numero` permanece como esta.
--
-- Nada muda em estoque, custo, conferencia ou status da importacao: o unico
-- trecho alterado do corpo de `confirmar_importacao_nfe` e o INSERT em
-- `contas_pagar`. Todo o resto e copia verbatim da definicao vigente
-- (20260904120000 + 20260830110000).
-- ============================================================================

ALTER TABLE public.contas_pagar
  ADD COLUMN IF NOT EXISTS parcela_numero text;

COMMENT ON COLUMN public.contas_pagar.nfe_numero IS
  'Numero da NF-e de origem (importacoes_nfe.numero_nf). NAO e o numero da parcela.';
COMMENT ON COLUMN public.contas_pagar.parcela_numero IS
  'Numero da duplicata/parcela dentro da NF-e (tag nDup), quando informado.';

-- Backfill: so onde existe nota de origem para derivar o numero.
UPDATE public.contas_pagar cp
   SET parcela_numero = COALESCE(cp.parcela_numero, cp.nfe_numero),
       nfe_numero     = imp.numero_nf
  FROM public.importacoes_nfe imp
 WHERE imp.id = cp.nfe_importacao_id
   AND cp.nfe_importacao_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- Predicado alinhado a trg_fn_produtos_margem (125): IS NOT TRUE trata
      -- preco_varejo NULL como o trigger (IF NULL não levanta). Sem isto o
      -- UPDATE aborta a transação e o estoque conferido nunca entra.
      UPDATE public.produtos p
         SET preco_custo = v_it.custo_unitario,
             updated_at  = now()
       WHERE p.id = v_it.produto_id
         AND (
           p.permitir_abaixo_custo
           OR (
             (p.preco_varejo < v_it.custo_unitario) IS NOT TRUE
             AND (p.preco_atacado IS NULL OR p.preco_atacado >= v_it.custo_unitario)
           )
         );
    END IF;
  END LOOP;

  FOR v_dup IN
    SELECT numero_duplicata, data_vencimento, valor
      FROM public.importacoes_nfe_duplicatas
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    INSERT INTO public.contas_pagar (
      nfe_importacao_id, fornecedor_id, loja_id,
      nfe_numero, parcela_numero, vencimento, valor_total, status
    ) VALUES (
      p_importacao_id, v_imp.fornecedor_id, v_imp.loja_id,
      v_imp.numero_nf, v_dup.numero_duplicata,
      v_dup.data_vencimento, v_dup.valor, 'PENDENTE'
    );
  END LOOP;

  UPDATE public.importacoes_nfe
     SET status = 'CONCLUIDA'
   WHERE id = p_importacao_id;
END;
$function$;

COMMENT ON FUNCTION public.confirmar_importacao_nfe(uuid) IS
  'Unico ponto que credita estoque, atualiza custo e gera contas a pagar da NF-e. Exige conferencia de todos os itens. contas_pagar.nfe_numero recebe o numero da NOTA e parcela_numero o numero da duplicata (correcao 2026-09-11).';

DO $verify$
DECLARE
  v_def text;
  v_restantes int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'contas_pagar'
       AND column_name = 'parcela_numero'
  ) THEN
    RAISE EXCEPTION 'MIG_NFE_NUMERO_COLUNA_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.confirmar_importacao_nfe(uuid)'::regprocedure);

  IF position('v_imp.numero_nf, v_dup.numero_duplicata' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG_NFE_NUMERO_INSERT_NAO_ATUALIZADO';
  END IF;

  -- Nenhum titulo ligado a importacao pode continuar com o numero da parcela
  -- no lugar do numero da nota.
  SELECT count(*) INTO v_restantes
    FROM public.contas_pagar cp
    JOIN public.importacoes_nfe imp ON imp.id = cp.nfe_importacao_id
   WHERE cp.nfe_numero IS DISTINCT FROM imp.numero_nf;

  IF v_restantes > 0 THEN
    RAISE EXCEPTION 'MIG_NFE_NUMERO_BACKFILL_INCOMPLETO: % linha(s)', v_restantes;
  END IF;
END;
$verify$;
