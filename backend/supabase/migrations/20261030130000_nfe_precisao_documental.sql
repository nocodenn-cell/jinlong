-- ============================================================================
-- Precisão documental da NF-e de entrada (sprint corretiva, 2026-10-30).
--
-- ORIGEM DO CASO 7 × 3,335 (investigado antes desta migration):
--   1. A NF-e informa vUnCom = 3,335 (até 10 casas) e vProd = 23,35 (2 casas, arredondado
--      pelo emitente sobre qCom × vUnCom = 23,345).
--   2. O import gravava custo_unitario = ROUND(vUnCom / fator, 2) = 3,34 (importar_nfe_transacao).
--   3. A conciliação recalculava o exigível com o custo gravado: 7 × 3,34 = 23,38 ≠ 23,35.
--   4. O parser (pdv-importados/lib/nfe/nfeParser.ts) não lia vProd, então o total documental
--      nunca era disponível. A divergência era artificial: nasceu do arredondamento do custo
--      unitário antes da multiplicação.
--
-- CAMPOS (sem substituição do documental por recálculo arredondado):
--   Precisão do custo unitário:    valor_unitario_documento numeric(18,10)  (vUnCom, exato)
--   Precisão da quantidade:        quantidade_nfe / quantidade_conferida numeric(10,3) (sem alteração;
--                                  qCom com mais de 3 casas é limite conhecido, ver relatório)
--   Fator de conversão:            fator_conversao numeric(18,6)  (unidade comercial → estoque)
--   Valor total dos itens (XML):   valor_total_documento numeric(14,2)  (vProd, quando informado)
--   Total exigível do documento:   calculado na confirmação (ver regra abaixo), nunca gravado
--   Soma das duplicatas:           importacoes_nfe_duplicatas.valor numeric(14,2)
--
-- REGRA DE EXIGÍVEL POR ITEM (internal.confirmar_importacao_nfe):
--   a) quantidade conferida = quantidade da NF e vProd informado  ⇒ usa vProd (valor documental)
--   b) valor_unitario_documento informado                         ⇒ ROUND(qtd_conf / fator × vUnCom, 2)
--   c) sem dado documental (itens anteriores a esta migration)    ⇒ ROUND(qtd_conf × custo_unitario, 2)
--   O arredondamento é ROUND(numeric, 2), o mesmo de public.round_abnt.
--   Tolerância entre exigível e Σ duplicatas: R$ 0,01 no total (D3), aplicada uma vez ao total.
--
-- Não altera: custo médio, produtos.preco_custo, estoque, kardex, RLS, triggers.
-- Aplicação por substituição textual exata (cada trecho com 1 ocorrência; falha ⇒ aborta).
-- Rollback: backend/supabase/rollback/20261030130000_nfe_precisao_documental_rollback.sql
-- ============================================================================

BEGIN;

ALTER TABLE public.importacoes_nfe_itens
  ADD COLUMN IF NOT EXISTS valor_unitario_documento numeric(18,10),
  ADD COLUMN IF NOT EXISTS fator_conversao numeric(18,6),
  ADD COLUMN IF NOT EXISTS valor_total_documento numeric(14,2);

-- Idempotente: pode ser reaplicada após o rollback (que mantém as colunas e as constraints).
DO $ck$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_nfe_item_valor_unitario_documento') THEN
    ALTER TABLE public.importacoes_nfe_itens
      ADD CONSTRAINT chk_nfe_item_valor_unitario_documento CHECK (valor_unitario_documento IS NULL OR valor_unitario_documento >= 0),
      ADD CONSTRAINT chk_nfe_item_fator_conversao CHECK (fator_conversao IS NULL OR fator_conversao > 0),
      ADD CONSTRAINT chk_nfe_item_valor_total_documento CHECK (valor_total_documento IS NULL OR valor_total_documento >= 0);
  END IF;
END
$ck$;

COMMENT ON COLUMN public.importacoes_nfe_itens.valor_unitario_documento IS
  'vUnCom da NF-e, com a precisão informada (até 10 casas). Base do exigível por item.';
COMMENT ON COLUMN public.importacoes_nfe_itens.fator_conversao IS
  'Fator unidade comercial → estoque usado no import (quantidade_nfe = qCom × fator).';
COMMENT ON COLUMN public.importacoes_nfe_itens.valor_total_documento IS
  'vProd da NF-e (valor total do item, 2 casas, informado pelo emitente). NULL quando não informado.';

DO $prec$
DECLARE
  v_def text;
  r record;
  v_n int;
BEGIN
  -- 1) importar: grava os dados documentais do item
  v_def := pg_get_functiondef('internal.importar_nfe_transacao(text,text,text,text,uuid,jsonb,boolean,jsonb)'::regprocedure);
  FOR r IN
    SELECT * FROM (VALUES
      (
        E'    INSERT INTO public.importacoes_nfe_itens (\n      importacao_nfe_id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo\n    ) VALUES (\n      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo\n    );\n',
        E'    INSERT INTO public.importacoes_nfe_itens (\n      importacao_nfe_id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo,\n      valor_unitario_documento, fator_conversao, valor_total_documento\n    ) VALUES (\n      v_imp_id, v_produto_id, v_q_entrada, ROUND(v_custo_unit, 2), v_item_atualiza_custo,\n      v_v_un, v_fator,\n      CASE WHEN el ->> ''v_prod'' IS NOT NULL THEN (el ->> ''v_prod'')::numeric END\n    );\n'
      )
    ) AS t(antigo, novo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'PRECISAO_NFE (importar): trecho encontrado % vezes (esperado 1)', v_n;
    END IF;
    v_def := replace(v_def, r.antigo, r.novo);
  END LOOP;
  EXECUTE v_def;
END
$prec$;

DO $prec2$
DECLARE
  v_def text;
  r record;
  v_n int;
BEGIN
  -- 2) confirmação: exigível por item segundo a regra documental
  v_def := pg_get_functiondef('internal.confirmar_importacao_nfe(uuid)'::regprocedure);
  FOR r IN
    SELECT * FROM (VALUES
      (
        E'  SELECT coalesce(sum(i.quantidade_conferida * i.custo_unitario), 0) INTO v_exigivel\n',
        E'  SELECT coalesce(sum(\n           CASE\n             WHEN i.valor_total_documento IS NOT NULL AND i.quantidade_conferida = i.quantidade_nfe\n               THEN i.valor_total_documento\n             WHEN i.valor_unitario_documento IS NOT NULL\n               THEN round(i.quantidade_conferida / i.fator_conversao * i.valor_unitario_documento, 2)\n             ELSE round(i.quantidade_conferida * i.custo_unitario, 2)\n           END\n         ), 0) INTO v_exigivel\n'
      )
    ) AS t(antigo, novo)
  LOOP
    v_n := (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'PRECISAO_NFE (confirmar): trecho encontrado % vezes (esperado 1)', v_n;
    END IF;
    v_def := replace(v_def, r.antigo, r.novo);
  END LOOP;
  EXECUTE v_def;
END
$prec2$;

-- Prova: as duas funções contêm a regra nova.
DO $prova$
BEGIN
  IF position('valor_unitario_documento' IN pg_get_functiondef('internal.importar_nfe_transacao(text,text,text,text,uuid,jsonb,boolean,jsonb)'::regprocedure)) = 0
     OR position('valor_total_documento' IN pg_get_functiondef('internal.confirmar_importacao_nfe(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'PRECISAO_NFE PROVA FAIL';
  END IF;
END
$prova$;

COMMIT;
