-- Corretiva: restaura os efeitos de schema de
-- 20260801120000_recebimento_conferencia_explicita que constam como
-- aplicados em supabase_migrations.schema_migrations mas nunca existiram
-- fisicamente em produção — drift documentado desde 05/08/2026 em
-- 296_nfe_conferencia.sql ("remessas não tem origem_tipo/origem_ref/
-- conferido_por/conferido_em/divergencia_motivo... confirmado por consulta
-- direta em produção") e confirmado de novo em 24/08/2026 ao aplicar D0-03:
-- criar_confirmar_remessa_entrada falhou em toda chamada real com
-- "column conferido_por of relation remessas does not exist".
--
-- Escopo deliberadamente menor que a migration original: só schema
-- (colunas + constraints), aditivo e idempotente. NÃO recria
-- registrar_conferencia_remessa — essa função foi deliberadamente removida
-- em 20260819230000_remove_funcoes_sem_consumidor (código morto sem
-- consumidor) e recriá-la reabriria a aceitação de
-- quantidade_conferida = 0 que a migration D0-03 (20260823192024) existe
-- para fechar. confirmar_remessa_entrada já existe em produção (verificado
-- via to_regprocedure) e não referencia estas colunas em seu corpo — não
-- precisa ser recriada.

BEGIN;

ALTER TABLE public.remessas
  ADD COLUMN IF NOT EXISTS origem_tipo text NOT NULL DEFAULT 'SEM_DOCUMENTO',
  ADD COLUMN IF NOT EXISTS origem_ref text,
  ADD COLUMN IF NOT EXISTS conferido_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz,
  ADD COLUMN IF NOT EXISTS divergencia_motivo text;

ALTER TABLE public.remessas DROP CONSTRAINT IF EXISTS remessas_origem_tipo_check;
ALTER TABLE public.remessas ADD CONSTRAINT remessas_origem_tipo_check
  CHECK (origem_tipo IN ('NFE', 'ORDEM_COMPRA', 'SEM_DOCUMENTO'));

ALTER TABLE public.remessas DROP CONSTRAINT IF EXISTS remessas_status_check;
ALTER TABLE public.remessas ADD CONSTRAINT remessas_status_check
  CHECK (status IN ('RASCUNHO', 'EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE', 'CONCLUIDA', 'CANCELADA'));

COMMENT ON COLUMN public.remessas.origem_tipo IS
  'Origem da expectativa do que deveria chegar. Determina o pre-preenchimento, nunca o comportamento.';
COMMENT ON COLUMN public.remessas.origem_ref IS
  'Chave da NF-e, id da ordem de compra, ou NULL quando nao ha documento.';

COMMIT;
