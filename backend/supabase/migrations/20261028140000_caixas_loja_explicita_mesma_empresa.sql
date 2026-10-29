-- caixas.loja_id explícito e da mesma empresa do operador.
--
-- Produção (somente leitura, agregados, 28/10/2026): caixas.loja_id ainda tem DEFAULT da loja piloto
-- a0000001-0000-4000-8000-000000000001 (migration 032). 20261010120000_caixa_sem_loja_padrao, que removia o
-- default, está no repo mas não no ledger de produção. 56 caixas, todos na loja piloto, 1 loja, 0 caixas com
-- operador de outra empresa, 6 com operador_id NULL (legado). Nada aqui invalida linhas existentes.
--
-- 1. DROP DEFAULT (idempotente: no banco que já aplicou 20261010120000 é no-op). INSERT sem loja falha (NOT NULL).
-- 2. Trigger BEFORE INSERT / UPDATE OF loja_id, operador_id: a loja precisa ter empresa; o operador, quando
--    informado, precisa pertencer à empresa da loja (loja do cadastro ou vínculo, ativo ou não — atividade é
--    validada em outras camadas, e um evento offline aprovado na fila de revisão pode abrir caixa de quem já
--    saiu); caixa não muda de empresa. Linhas antigas só são checadas se loja_id/operador_id mudarem.
-- Rollback: backend/supabase/rollback/20261028140000_caixas_loja_explicita_mesma_empresa.rollback.sql

ALTER TABLE public.caixas ALTER COLUMN loja_id DROP DEFAULT;

CREATE OR REPLACE FUNCTION internal.tg_caixas_loja_mesma_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_emp uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.loja_id IS NOT DISTINCT FROM OLD.loja_id
     AND NEW.operador_id IS NOT DISTINCT FROM OLD.operador_id THEN
    RETURN NEW;
  END IF;
  IF NEW.loja_id IS NULL THEN
    RAISE EXCEPTION 'CAIXA_LOJA_OBRIGATORIA' USING ERRCODE = '23502';
  END IF;
  SELECT l.empresa_id INTO v_emp FROM public.lojas l WHERE l.id = NEW.loja_id;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'CAIXA_LOJA_SEM_EMPRESA' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.loja_id IS DISTINCT FROM OLD.loja_id
     AND public.fp_empresa_da_loja(OLD.loja_id) IS DISTINCT FROM v_emp THEN
    RAISE EXCEPTION 'CAIXA_TROCA_DE_EMPRESA' USING ERRCODE = '23514';
  END IF;
  IF NEW.operador_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.usuarios u JOIN public.lojas lu ON lu.id = u.loja_id
        WHERE u.id = NEW.operador_id AND lu.empresa_id = v_emp
       UNION ALL
       SELECT 1 FROM public.usuario_vinculos v
        WHERE v.usuario_id = NEW.operador_id AND v.empresa_id = v_emp) THEN
    RAISE EXCEPTION 'CAIXA_OPERADOR_DE_OUTRA_EMPRESA' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_caixas_loja_mesma_empresa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_caixas_loja_mesma_empresa ON public.caixas;
CREATE TRIGGER trg_caixas_loja_mesma_empresa
  BEFORE INSERT OR UPDATE OF loja_id, operador_id ON public.caixas
  FOR EACH ROW EXECUTE FUNCTION internal.tg_caixas_loja_mesma_empresa();

COMMENT ON TRIGGER trg_caixas_loja_mesma_empresa ON public.caixas IS
  '20261028140000: loja explícita, com empresa, e operador da mesma empresa; caixa não troca de empresa.';
