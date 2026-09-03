-- Sprint de convergência fiscal (auditoria Codex) — achado:
-- `documentos_fiscais_pendentes.venda_id` tem `ON DELETE CASCADE` desde a
-- criação da tabela (035_fiado_fiscal_stub.sql). Um documento fiscal
-- AUTORIZADO (status EMITIDO, com chave de acesso/protocolo reais da SEFAZ)
-- não pode desaparecer silenciosamente só porque a venda de origem foi
-- excluída — é um registro com existência legal própria, sujeito a guarda
-- fiscal obrigatória (retenção documental), independente do que aconteça
-- com a venda.
--
-- RISCO CONFIRMADO (não teórico): existe uma policy RLS de DELETE em
-- `vendas` (`vendas_delete_loja`, escopo GERENTE/DONO/ADMIN da própria
-- loja) e GRANT DELETE para `authenticated`/`service_role` — um `DELETE FROM
-- vendas` é uma operação alcançável, não hipotética.
--
-- POR QUE HOJE NÃO ACONTECE NA PRÁTICA (mas é frágil, não é proteção
-- arquitetural deliberada): `itens_venda.venda_id` é uma FK NOT NULL com
-- regra NO ACTION (não CASCADE) para `vendas` — toda venda tem pelo menos 1
-- item (FINALIZAR_VENDA_CANONICA_ITENS_INVALIDOS já impede o contrário), e
-- linhas de itens_venda nunca são apagadas depois — então, HOJE, qualquer
-- `DELETE FROM vendas` de uma venda real já falha ali antes de o CASCADE
-- deste arquivo chegar a rodar. Mas isso é um efeito colateral incidental de
-- OUTRA tabela, não uma garantia desta. Se `itens_venda` (ou qualquer outra
-- FK intermediária) for relaxada no futuro por qualquer motivo não
-- relacionado a fiscal, o CASCADE aqui silenciosamente apagaria documentos
-- fiscais reais sem qualquer aviso — exatamente o cenário que este fix
-- fecha, deliberadamente, nesta própria tabela.
--
-- PADRÃO JÁ EXISTENTE NO MESMO SCHEMA: `comissoes_ajustes`, `comissoes_itens`,
-- `comissoes_vendedores`, `devolucoes`, `estoque_baixas`,
-- `vendas_canceladas_auditoria` — todas tabelas de auditoria/trilha —
-- já usam `ON DELETE RESTRICT` para `venda_id`. Esta migration só alinha
-- `documentos_fiscais_pendentes` ao mesmo padrão, não inventa uma regra nova.
--
-- NÃO MISTURADO com nenhuma mudança de comportamento de negócio: nenhuma
-- linha existente é tocada (ALTER de constraint, não de dado); "exclusão" de
-- um documento fiscal neste schema já é soft-delete (`deleted_at`, usado em
-- várias RPCs/queries existentes) — RESTRICT não conflita com esse padrão,
-- só impede o HARD DELETE da venda-pai enquanto existir qualquer linha
-- (mesmo soft-deletada) de documento fiscal associada.
--
-- ROLLBACK: ALTER TABLE documentos_fiscais_pendentes
--   DROP CONSTRAINT documentos_fiscais_pendentes_venda_id_fkey,
--   ADD CONSTRAINT documentos_fiscais_pendentes_venda_id_fkey
--   FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE;

BEGIN;

ALTER TABLE public.documentos_fiscais_pendentes
  DROP CONSTRAINT documentos_fiscais_pendentes_venda_id_fkey;

ALTER TABLE public.documentos_fiscais_pendentes
  ADD CONSTRAINT documentos_fiscais_pendentes_venda_id_fkey
  FOREIGN KEY (venda_id) REFERENCES public.vendas(id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT documentos_fiscais_pendentes_venda_id_fkey ON public.documentos_fiscais_pendentes IS
  'RESTRICT (não CASCADE) — sprint de convergência fiscal, 2026-09-02: um documento fiscal '
  '(sobretudo EMITIDO, com existência legal/SEFAZ própria) nunca pode ser apagado como efeito '
  'colateral de excluir a venda de origem. Mesmo padrão já usado por comissoes_*/devolucoes/'
  'estoque_baixas/vendas_canceladas_auditoria nesta tabela.';

DO $verify$
DECLARE
  v_deltype "char";
BEGIN
  SELECT confdeltype INTO v_deltype
  FROM pg_constraint
  WHERE conrelid = 'public.documentos_fiscais_pendentes'::regclass
    AND conname = 'documentos_fiscais_pendentes_venda_id_fkey';

  IF v_deltype IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'DOC_FISCAL_VENDA_ID_NAO_RESTRICT: obtido %', v_deltype;
  END IF;

  -- Prova viva: cria venda + documento fiscal (status EMITIDO, o caso de
  -- maior risco) e confirma que DELETE FROM vendas falha com
  -- foreign_key_violation — nunca apaga o documento silenciosamente.
  DECLARE
    v_venda_id uuid := gen_random_uuid();
    v_doc_id uuid;
    v_caixa_id uuid;
    v_operador_id uuid;
    v_bloqueado boolean := false;
  BEGIN
    SELECT id INTO v_operador_id FROM public.usuarios LIMIT 1;
    IF v_operador_id IS NULL THEN
      RAISE NOTICE 'DOC_FISCAL_VERIFY: sem usuário para prova viva; verificação estrutural (confdeltype) já OK';
    ELSE
      INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
      VALUES (v_venda_id, v_operador_id, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');

      -- Máquina de estados (tg_documentos_fiscais_estado_bi/bu) só permite
      -- INSERT com status='PENDENTE' e a transição EMITIDO só a partir de
      -- EM_PROCESSAMENTO — percorre a sequência real, não pula etapas.
      INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
      VALUES (v_venda_id, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
      RETURNING id INTO v_doc_id;

      UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = v_doc_id;
      UPDATE public.documentos_fiscais_pendentes
        SET status = 'EMITIDO', chave_fiscal = repeat('3', 44), protocolo = 'PROTO-VERIFY'
        WHERE id = v_doc_id;

      BEGIN
        DELETE FROM public.vendas WHERE id = v_venda_id;
      EXCEPTION WHEN foreign_key_violation THEN
        v_bloqueado := true;
      END;

      IF NOT v_bloqueado THEN
        RAISE EXCEPTION 'DOC_FISCAL_EMITIDO_APAGADO_POR_CASCADE_DA_VENDA';
      END IF;

      -- Confirma que o documento (e a venda) realmente sobreviveram — o
      -- bloqueio acima não deixou nenhum estado parcial.
      IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id) THEN
        RAISE EXCEPTION 'DOC_FISCAL_SUMIU_APESAR_DO_BLOQUEIO';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE id = v_venda_id) THEN
        RAISE EXCEPTION 'VENDA_SUMIU_APESAR_DO_BLOQUEIO';
      END IF;

      -- Limpeza (ordem inversa, sem CASCADE): documento antes, venda depois —
      -- agora que a prova terminou, nada impede a limpeza normal do teste.
      DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
      DELETE FROM public.vendas WHERE id = v_venda_id;
    END IF;
  END;
END
$verify$;

COMMIT;
