-- Rollback de 20261028130000_sync_outbox_legado_revisao_offline.sql (somente após decisão do dono).
-- ORDEM: primeiro volte a Edge Function sync-outbox para a versão anterior (ela chama estas RPCs; sem elas a versão
-- nova falha fechado: eventos ficam pendentes no PDV, nada é gravado nem perdido).
-- A TRILHA É PRESERVADA: public.sync_eventos_revisao e internal.sync_eventos_recebidos NÃO são apagadas
-- (decisões e eventos pendentes continuam consultáveis por SQL). Só as funções saem.
BEGIN;
DROP FUNCTION IF EXISTS public.revisar_evento_offline(uuid, text, text);
DROP FUNCTION IF EXISTS internal.sync_aplicar_evento_revisado(public.sync_eventos_revisao);
DROP FUNCTION IF EXISTS public.sync_enfileirar_revisao(jsonb);
DROP FUNCTION IF EXISTS public.sync_avaliar_evento(jsonb);
DROP FUNCTION IF EXISTS internal.sync_avaliar_evento_base(jsonb);
DROP FUNCTION IF EXISTS public.sync_registrar_recebimento(text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS internal.fp_usuario_teve_vinculo_na_loja(uuid, uuid, text[], boolean);
DROP FUNCTION IF EXISTS internal.fp_usuario_perdeu_acesso_em(uuid);
DROP FUNCTION IF EXISTS internal.fp_uuid_ou_null(text);
DROP FUNCTION IF EXISTS internal.fp_ts_ou_null(text);
-- tabela fica; leitura direta continua só para DONO/GERENTE da loja (RLS)
COMMIT;
