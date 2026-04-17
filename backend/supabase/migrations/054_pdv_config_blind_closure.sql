-- P1.2 Fechamento cego: quando ativo, o operador não vê saldo sistema antes de informar valor contado.

ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS blind_closure boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pdv_config.blind_closure IS
  'Se true, habilita fechamento cego no caixa (esconde saldo estimado antes da contagem do operador).';
