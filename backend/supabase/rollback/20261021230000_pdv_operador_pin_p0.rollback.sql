-- Rollback de 20261021230000_pdv_operador_pin_p0 (apaga PINs e auditoria de operador; nada mais depende deles).
DROP FUNCTION IF EXISTS public.pdv_pin_registrar_tentativa(uuid, boolean);
DROP FUNCTION IF EXISTS public.pdv_operadores_da_loja(uuid);
DROP FUNCTION IF EXISTS public.status_pin_equipe_pdv();
DROP FUNCTION IF EXISTS public.resetar_pin_operador_pdv(uuid);
DROP FUNCTION IF EXISTS public.definir_meu_pin_pdv(text, text, integer);
DROP FUNCTION IF EXISTS public.pdv_pin_obvio(text);
DROP TABLE IF EXISTS public.pdv_operador_eventos;
DROP TABLE IF EXISTS public.usuario_pin;
ALTER TABLE public.pdv_config DROP COLUMN IF EXISTS bloqueio_inatividade_min;
ALTER TABLE public.pdv_config DROP COLUMN IF EXISTS exigir_pin_operador;
