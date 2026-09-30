-- Regressão da migration 20260930090100_c2_suspensao_vendas_no_trigger_de_vendas.sql (P0-01).
--
-- Prova: com vendas_suspensas='true', QUALQUER INSERT em public.vendas é recusado com VENDAS_SUSPENSAS
-- (independe da engine ou do perfil). O trigger BEFORE roda antes de NOT NULL/CHECK/FK, então basta um
-- INSERT mínimo. Com a flag 'false' a recusa NÃO pode ser VENDAS_SUSPENSAS.
-- Tudo em transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

DO $c2_check$
DECLARE
  v_msg text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.configuracoes_gerais WHERE chave = 'vendas_suspensas') THEN
    INSERT INTO public.configuracoes_gerais (chave, valor, tipo_dado, descricao)
    VALUES ('vendas_suspensas', 'false', 'text', 'teste');
  END IF;

  -- 1) suspenso -> VENDAS_SUSPENSAS
  UPDATE public.configuracoes_gerais SET valor = 'true' WHERE chave = 'vendas_suspensas';
  v_msg := NULL;
  BEGIN
    INSERT INTO public.vendas (id) VALUES (gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg IS DISTINCT FROM 'VENDAS_SUSPENSAS' THEN
    RAISE EXCEPTION 'c2 FALHOU: com suspensão ativa esperava VENDAS_SUSPENSAS, veio: %', COALESCE(v_msg, '<inseriu>');
  END IF;

  -- 2) reativado -> a recusa (se houver, por NOT NULL/FK) não pode ser a da suspensão
  UPDATE public.configuracoes_gerais SET valor = 'false' WHERE chave = 'vendas_suspensas';
  v_msg := NULL;
  BEGIN
    INSERT INTO public.vendas (id) VALUES (gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  IF v_msg = 'VENDAS_SUSPENSAS' THEN
    RAISE EXCEPTION 'c2 FALHOU: suspensão desativada mas o trigger ainda recusa';
  END IF;

  RAISE NOTICE 'c2-suspensao-vendas-trigger OK';
END
$c2_check$;

ROLLBACK;
