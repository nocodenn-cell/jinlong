-- ============================================================================
-- Vinculo Ordem de Compra <-> Importacao de NF-e e guarda de dupla entrada
-- ============================================================================
-- Achado do QA operacional (risco mais grave do fluxo): nao existia nenhum
-- vinculo entre `ordens_compra` e `importacoes_nfe`. Receber a ordem creditava
-- estoque; importar a NF-e da MESMA compra creditava de novo. Duas entradas
-- para uma mercadoria so, sem alerta, e -- depois de 20260911130000 -- tambem
-- duas obrigacoes financeiras para a mesma divida.
--
-- Modelagem: `importacoes_nfe.ordem_compra_id` (opcional) declara que aquela
-- nota e o documento fiscal daquela ordem. Indice unico parcial impede duas
-- notas apontando para a mesma ordem.
--
-- Guarda em ambas as portas, no banco -- nao so na interface:
--   * `confirmar_importacao_nfe` recusa (IMPORT_NFE_OC_JA_RECEBIDA) quando a
--     ordem vinculada ja esta RECEBIDA.
--   * `receber_ordem_compra` recusa (OC_NFE_JA_CREDITADA) quando ja existe nota
--     vinculada CONCLUIDA.
--   * Confirmar a nota vinculada ENCERRA a ordem como RECEBIDA. A partir dai a
--     guarda de status ja existente (OC_STATUS_INVALIDO) bloqueia o segundo
--     credito, mesmo que a guarda especifica fosse removida no futuro.
--   * O financeiro segue a nota: ordem com nota vinculada nao gera titulo
--     proprio, porque as duplicatas da NF-e ja sao a obrigacao.
--
-- Limite conhecido e deliberado: sem vinculo declarado, o sistema nao tem como
-- saber que uma nota e uma ordem sao a mesma compra. Bloquear por heuristica
-- (mesmo fornecedor, valores proximos) recusaria remessas legitimas. Por isso a
-- protecao e o vinculo explicito, e a UI passa a oferecer as ordens em transito
-- do fornecedor no momento da conferencia.
--
-- `vincular_importacao_nfe_ordem_compra` existe para que o vinculo possa ser
-- declarado sem alterar a assinatura de `importar_nfe_transacao` (que ja tem 8
-- parametros e e chamada de varios pontos). Valida loja, estado de ambos os
-- lados e exige perfil gerencial -- como as demais RPCs deste fluxo.
-- ============================================================================

ALTER TABLE public.importacoes_nfe
  ADD COLUMN IF NOT EXISTS ordem_compra_id uuid;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'importacoes_nfe_ordem_compra_id_fkey'
  ) THEN
    ALTER TABLE public.importacoes_nfe
      ADD CONSTRAINT importacoes_nfe_ordem_compra_id_fkey
      FOREIGN KEY (ordem_compra_id) REFERENCES public.ordens_compra(id);
  END IF;
END
$fk$;

COMMENT ON COLUMN public.importacoes_nfe.ordem_compra_id IS
  'Ordem de compra da qual esta NF-e e o documento fiscal. Base da guarda de dupla entrada.';

CREATE UNIQUE INDEX IF NOT EXISTS importacoes_nfe_ordem_compra_unico
  ON public.importacoes_nfe (ordem_compra_id)
  WHERE ordem_compra_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.vincular_importacao_nfe_ordem_compra(
  p_importacao_id uuid,
  p_oc_id uuid
)
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
  v_oc           record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'VINCULO_OC_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'VINCULO_OC_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, status INTO v_imp
    FROM public.importacoes_nfe WHERE id = p_importacao_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VINCULO_OC_NFE_IMPORTACAO_NAO_ENCONTRADA';
  END IF;

  SELECT id, loja_id, status INTO v_oc
    FROM public.ordens_compra WHERE id = p_oc_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VINCULO_OC_NFE_ORDEM_NAO_ENCONTRADA';
  END IF;

  IF v_imp.loja_id IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'VINCULO_OC_NFE_LOJA_DIVERGENTE';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'VINCULO_OC_NFE_LOJA';
  END IF;

  -- Vincular depois do credito nao teria efeito de protecao nenhum.
  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'VINCULO_OC_NFE_IMPORTACAO_JA_CONCLUIDA';
  END IF;

  IF v_oc.status IN ('RECEBIDA', 'CANCELADA') THEN
    RAISE EXCEPTION 'VINCULO_OC_NFE_ORDEM_ENCERRADA';
  END IF;

  UPDATE public.importacoes_nfe
     SET ordem_compra_id = p_oc_id
   WHERE id = p_importacao_id;
END;
$function$;

COMMENT ON FUNCTION public.vincular_importacao_nfe_ordem_compra(uuid, uuid) IS
  'Declara que uma importacao de NF-e e o documento fiscal de uma ordem de compra. Base da guarda de dupla entrada; so aceita importacao ainda em conferencia e ordem ainda aberta, na mesma loja.';

REVOKE ALL ON FUNCTION public.vincular_importacao_nfe_ordem_compra(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vincular_importacao_nfe_ordem_compra(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.vincular_importacao_nfe_ordem_compra(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_importacao_nfe_ordem_compra(uuid, uuid) TO service_role;

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

  SELECT id, loja_id, fornecedor_id, numero_nf, status, ordem_compra_id INTO v_imp
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

  -- Guarda de dupla entrada: se esta nota pertence a uma ordem de compra que
  -- ja foi recebida, a mercadoria ja creditou estoque por aquela porta.
  IF v_imp.ordem_compra_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ordens_compra o
     WHERE o.id = v_imp.ordem_compra_id AND o.status = 'RECEBIDA'
  ) THEN
    RAISE EXCEPTION 'IMPORT_NFE_OC_JA_RECEBIDA';
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

  -- Uma compra, um credito: se a nota pertence a uma ordem, a ordem se encerra
  -- aqui. Assim a guarda de status de `receber_ordem_compra` passa a impedir
  -- que a mesma mercadoria seja recebida de novo pela porta da ordem.
  IF v_imp.ordem_compra_id IS NOT NULL THEN
    UPDATE public.ordens_compra
       SET status = 'RECEBIDA'
     WHERE id = v_imp.ordem_compra_id
       AND status <> 'CANCELADA';
  END IF;
END;
$function$;CREATE OR REPLACE FUNCTION public.receber_ordem_compra(p_oc_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_oc           record;
  v_it           record;
  v_pendentes    int;
  v_total        numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  SELECT id, loja_id, status, fornecedor_id, data_vencimento INTO v_oc
    FROM public.ordens_compra
   WHERE id = p_oc_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_oc.status <> 'EM_TRANSITO' THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  -- Guarda de dupla entrada, lado da ordem: se uma NF-e vinculada a esta ordem
  -- ja foi confirmada, o estoque daquela compra ja entrou.
  IF EXISTS (
    SELECT 1 FROM public.importacoes_nfe i
     WHERE i.ordem_compra_id = p_oc_id AND i.status = 'CONCLUIDA'
  ) THEN
    RAISE EXCEPTION 'OC_NFE_JA_CREDITADA';
  END IF;

  SELECT count(*) INTO v_pendentes
    FROM public.ordens_compra_itens
   WHERE ordem_id = p_oc_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'OC_CONFERENCIA_PENDENTE';
  END IF;

  FOR v_it IN
    SELECT id, produto_id, quantidade_conferida
      FROM public.ordens_compra_itens
     WHERE ordem_id = p_oc_id
  LOOP
    IF v_it.produto_id IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_oc.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_oc.loja_id,
        v_it.produto_id,
        'ENTRADA_OC',
        v_it.quantidade_conferida,
        v_uid,
        format('Recebimento OC %s (conferido)', p_oc_id::text)
      );
    END IF;

    UPDATE public.ordens_compra_itens
       SET quantidade_recebida = COALESCE(quantidade_conferida, 0)
     WHERE id = v_it.id;
  END LOOP;

  -- ── Obrigacao financeira ──────────────────────────────────────────────────
  -- Mesma grandeza que creditou estoque: quantidade CONFERIDA x preco da ordem.
  -- Nota vinculada manda no financeiro: as duplicatas da NF-e sao a obrigacao
  -- real. Gerar titulo aqui tambem duplicaria a divida com o fornecedor.
  IF v_oc.fornecedor_id IS NOT NULL AND v_oc.data_vencimento IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.importacoes_nfe i WHERE i.ordem_compra_id = p_oc_id
     ) THEN
    SELECT public.round_abnt(
             COALESCE(sum(COALESCE(quantidade_conferida, 0) * preco_unitario), 0), 2)
      INTO v_total
      FROM public.ordens_compra_itens
     WHERE ordem_id = p_oc_id;

    IF v_total > 0 THEN
      INSERT INTO public.contas_pagar (
        ordem_compra_id, fornecedor_id, loja_id,
        descricao, vencimento, valor_total, status
      ) VALUES (
        p_oc_id, v_oc.fornecedor_id, v_oc.loja_id,
        format('Ordem de compra %s', upper(left(p_oc_id::text, 8))),
        v_oc.data_vencimento, v_total, 'PENDENTE'
      )
      ON CONFLICT (ordem_compra_id) WHERE ordem_compra_id IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  UPDATE public.ordens_compra
     SET status = 'RECEBIDA'
   WHERE id = p_oc_id;
END;
$function$;
DO $verify$
DECLARE
  v_conf text;
  v_receb text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'importacoes_nfe_ordem_compra_unico'
  ) THEN
    RAISE EXCEPTION 'MIG_VINCULO_INDICE_AUSENTE';
  END IF;

  v_conf  := pg_get_functiondef('public.confirmar_importacao_nfe(uuid)'::regprocedure);
  v_receb := pg_get_functiondef('public.receber_ordem_compra(uuid)'::regprocedure);

  IF position('IMPORT_NFE_OC_JA_RECEBIDA' IN v_conf) = 0 THEN
    RAISE EXCEPTION 'MIG_VINCULO_GUARDA_NFE_AUSENTE';
  END IF;

  IF position('OC_NFE_JA_CREDITADA' IN v_receb) = 0 THEN
    RAISE EXCEPTION 'MIG_VINCULO_GUARDA_OC_AUSENTE';
  END IF;

  -- Invariantes anteriores nao podem ter sido perdidas nas reescritas.
  IF position('IMPORT_NFE_CONFERENCIA_PENDENTE' IN v_conf) = 0
     OR position('OC_CONFERENCIA_PENDENTE' IN v_receb) = 0 THEN
    RAISE EXCEPTION 'MIG_VINCULO_GUARDA_CONFERENCIA_PERDIDA';
  END IF;

  IF position('v_imp.numero_nf, v_dup.numero_duplicata' IN v_conf) = 0 THEN
    RAISE EXCEPTION 'MIG_VINCULO_NUMERO_NFE_PERDIDO';
  END IF;
END;
$verify$;
