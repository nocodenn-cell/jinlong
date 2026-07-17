-- 271 — Fase 5, Entrega 5: ledger explícito de eventos de venda em espera
-- (park/resume/discard/convert), fechando o TODO de
-- pdv-importados/app/caixa/TODO_auditoria_255.md:
-- "Ledger/auditoria de park/resume/discard/consulta rápida (eventos explícitos)".
--
-- Decisão: tabela dedicada em vez de reaproveitar `venda_eventos` — essa tabela
-- tem CHECK (event_type IN ('SALE_REGISTERED','SALE_CANCELLED')) e colunas
-- NOT NULL (caixa_id, total) que não fazem sentido para uma venda que ainda não
-- foi finalizada. Criar uma tabela isolada é aditivo e reversível; alterar o
-- CHECK do ledger principal de vendas concluídas não seria.
--
-- Implementado via trigger (não via edição das RPCs) para não precisar
-- reescrever colocar/retomar/descartar_venda_em_espera de novo.

CREATE TABLE IF NOT EXISTS public.vendas_em_espera_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_em_espera_id uuid NOT NULL REFERENCES public.vendas_em_espera (id),
  evento          text NOT NULL CHECK (evento IN ('PARK', 'RESUME', 'DISCARD', 'CONVERT')),
  operador_id     uuid NOT NULL,
  loja_id         uuid NOT NULL,
  numero_local    integer NOT NULL,
  ocorrido_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_em_espera_eventos_venda
  ON public.vendas_em_espera_eventos (venda_em_espera_id, ocorrido_em);

CREATE INDEX IF NOT EXISTS idx_vendas_em_espera_eventos_loja
  ON public.vendas_em_espera_eventos (loja_id, ocorrido_em DESC);

COMMENT ON TABLE public.vendas_em_espera_eventos IS
  'Ledger append-only de operações sobre vendas em espera (park/resume/discard/convert).';

ALTER TABLE public.vendas_em_espera_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vendas_em_espera_eventos FROM anon;
GRANT SELECT ON TABLE public.vendas_em_espera_eventos TO authenticated;
GRANT SELECT, INSERT ON TABLE public.vendas_em_espera_eventos TO service_role;

CREATE POLICY vendas_em_espera_eventos_select ON public.vendas_em_espera_eventos
  FOR SELECT TO authenticated
  USING (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('ADMIN', 'DONO', 'GERENTE')
        AND u.loja_id = vendas_em_espera_eventos.loja_id
    )
  );

CREATE OR REPLACE FUNCTION public.trg_vendas_em_espera_log_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_evento := 'PARK';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_evento := CASE NEW.status
      WHEN 'RETOMADA' THEN 'RESUME'
      WHEN 'DESCARTADA' THEN 'DISCARD'
      WHEN 'CONVERTIDA' THEN 'CONVERT'
      ELSE NULL
    END;
  END IF;

  IF v_evento IS NOT NULL THEN
    INSERT INTO public.vendas_em_espera_eventos (
      venda_em_espera_id, evento, operador_id, loja_id, numero_local
    ) VALUES (
      NEW.id, v_evento, NEW.operador_id, NEW.loja_id, NEW.numero_local
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendas_em_espera_log_evento ON public.vendas_em_espera;

CREATE TRIGGER trg_vendas_em_espera_log_evento
  AFTER INSERT OR UPDATE OF status ON public.vendas_em_espera
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_vendas_em_espera_log_evento();
