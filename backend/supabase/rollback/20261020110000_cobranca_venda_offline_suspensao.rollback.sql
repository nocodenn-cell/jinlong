-- Rollback: devolve o gatilho de vendas ao texto anterior e remove a política offline.
BEGIN;
DO $$
DECLARE v_def text := pg_get_functiondef('public.trg_fn_vendas_caixa_aberto()'::regprocedure);
BEGIN
  EXECUTE replace(v_def, 'IF v_suspensas = ''true'' AND NOT internal.cobranca_venda_offline_liberada(NEW.id, NEW.caixa_id) THEN',
                         'IF v_suspensas = ''true'' THEN');
END $$;
DROP FUNCTION IF EXISTS internal.cobranca_venda_offline_liberada(uuid, uuid);
DROP FUNCTION IF EXISTS public.cobranca_liberar_venda_offline(uuid, uuid, timestamptz);
DROP TRIGGER IF EXISTS trg_pdv_dispositivos_ciencia_suspensao ON public.pdv_dispositivos;
DROP TRIGGER IF EXISTS trg_assinaturas_suspensa_em ON saas.assinaturas;
DROP FUNCTION IF EXISTS saas.tg_dispositivo_ciencia();
DROP FUNCTION IF EXISTS saas.tg_marcar_suspensa_em();
DROP TABLE IF EXISTS saas.vendas_offline_liberadas;
DROP TABLE IF EXISTS saas.dispositivo_ciencia_suspensao;
DELETE FROM saas.parametros WHERE chave IN ('offline_janela_horas', 'offline_envio_min');
ALTER TABLE saas.assinaturas DROP COLUMN IF EXISTS suspensa_em;
COMMIT;
