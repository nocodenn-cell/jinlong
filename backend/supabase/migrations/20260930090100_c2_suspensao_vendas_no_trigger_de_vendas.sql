-- C2 (auditoria JINLONG 2026-09-30, P0-01): suspensão de vendas passa a ser regra do BANCO.
--
-- Causa-raiz: `configuracoes_gerais.vendas_suspensas` só era lida pela finalização v3 (hoje desabilitada,
-- ver 20260916120100) e enviada ao navegador por configuracoes_para_caixa_web(). A engine vigente
-- (finalizar_venda_transacional_canonica_v4[_unscoped]) nunca a lê → a suspensão só existia no cliente e
-- o DONO conseguia vender com a tela prometendo "nenhuma venda poderá ser processada".
--
-- Fonte canônica: o gatilho que TODA venda já atravessa (trg_vendas_caixa_aberto_bi → trg_fn_vendas_caixa_aberto).
-- Estendemos esse gatilho em vez de replicar a regra em cada engine (v2/v3/v4/sync-outbox).
-- Decisão de produto (2026-09-30): suspensão vale para TODOS os perfis.
--
-- Escopo: só INSERT (venda nova). Cancelamento/devolução são UPDATE/INSERT em outras tabelas e continuam livres.

CREATE OR REPLACE FUNCTION public.trg_fn_vendas_caixa_aberto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_suspensas text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT c.valor INTO v_suspensas
    FROM public.configuracoes_gerais c
    WHERE c.chave = 'vendas_suspensas';

    IF v_suspensas = 'true' THEN
      RAISE EXCEPTION 'VENDAS_SUSPENSAS'
        USING HINT = 'Vendas suspensas em /admin/suspensao. Nenhuma venda nova é aceita até reativar.';
    END IF;
  END IF;

  IF NEW.caixa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.status
  INTO v_status
  FROM public.caixas c
  WHERE c.id = NEW.caixa_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENDA_CAIXA_NAO_ENCONTRADO'
      USING HINT = 'O caixa_id informado não existe na tabela caixas.';
  END IF;

  IF v_status <> 'ABERTO' THEN
    RAISE EXCEPTION 'VENDA_CAIXA_FECHADO'
      USING HINT = 'Não é possível inserir ou reatribuir vendas a um caixa que não está ABERTO.';
  END IF;

  RETURN NEW;
END;
$function$;
