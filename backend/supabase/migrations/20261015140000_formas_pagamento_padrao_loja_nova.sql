-- P0 provisionamento: loja nova nasce com as formas de pagamento padrão.
--
-- Defeito (provado em stack local isolada, 2026-10-15): a migration 302 (F1-05) criou
-- `formas_pagamento` e fez backfill só das lojas que existiam. Nenhum caminho de criação de loja
-- (wizard `provisionarLojaAction` -> INSERT em `lojas`, seeds, SQL manual) cria as formas. Resultado:
-- `finalizar_venda_transacional_canonica_v4` valida a forma contra `formas_pagamento` por
-- (loja_id, codigo, ativo) e recusa FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA — loja
-- recém-provisionada não consegue vender.
--
-- Solução (SSOT único, atômico, idempotente):
--   1. `garantir_formas_pagamento_padrao(loja)`: única função que conhece o conjunto padrão
--      (mesmos codigo/nome da 302). Só age em loja SEM nenhuma linha em `formas_pagamento`; assim nunca
--      sobrescreve configuração, nunca reativa forma desativada e nunca mexe em loja já configurada.
--      Reexecutar é no-op. ON CONFLICT DO NOTHING como defesa extra contra corrida.
--   2. Trigger AFTER INSERT em `lojas` chama a função: cobre TODOS os caminhos (wizard, seed, SQL manual,
--      futuras Edge Functions) na mesma transação do INSERT da loja (atômico; falha da forma desfaz a loja).
--      Preferido a chamar só na RPC/action: não existe RPC de provisionamento (a action insere direto
--      via PostgREST) e cada novo caminho de criação teria de lembrar de chamar.
--   3. Backfill das lojas ativas sem nenhuma forma, pela mesma função.
--
-- Segurança: SECURITY DEFINER (o INSERT em `lojas` pode vir de service_role/postgres e `formas_pagamento`
-- tem RLS só de SELECT), search_path fixo, sem EXECUTE para PUBLIC/anon/authenticated (gate C1).

CREATE OR REPLACE FUNCTION public.garantir_formas_pagamento_padrao(p_loja_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inseridas integer := 0;
BEGIN
  IF p_loja_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Loja já configurada (qualquer linha, ativa ou não) não é tocada.
  IF EXISTS (SELECT 1 FROM public.formas_pagamento fp WHERE fp.loja_id = p_loja_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.formas_pagamento (loja_id, codigo, nome)
  SELECT l.id, v.codigo, v.nome
  FROM public.lojas l
  CROSS JOIN (VALUES
    ('DINHEIRO', 'Dinheiro'),
    ('PIX', 'Pix'),
    ('CARTAO_DEBITO', 'Cartão de Débito'),
    ('CARTAO_CREDITO', 'Cartão de Crédito')
  ) AS v(codigo, nome)
  WHERE l.id = p_loja_id
  ON CONFLICT (loja_id, codigo) DO NOTHING;

  GET DIAGNOSTICS v_inseridas = ROW_COUNT;
  RETURN v_inseridas;
END;
$$;

COMMENT ON FUNCTION public.garantir_formas_pagamento_padrao(uuid) IS
  'P0 (2026-10-15): garante DINHEIRO/PIX/CARTAO_DEBITO/CARTAO_CREDITO para loja SEM nenhuma forma cadastrada. Idempotente; nunca altera loja já configurada nem reativa forma desativada. Chamada pelo trigger de lojas e pelo backfill.';

REVOKE ALL ON FUNCTION public.garantir_formas_pagamento_padrao(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.garantir_formas_pagamento_padrao(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_lojas_formas_pagamento_padrao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.garantir_formas_pagamento_padrao(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_lojas_formas_pagamento_padrao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lojas_formas_pagamento_padrao ON public.lojas;
CREATE TRIGGER trg_lojas_formas_pagamento_padrao
  AFTER INSERT ON public.lojas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_lojas_formas_pagamento_padrao();

-- Backfill: lojas ativas sem nenhuma forma (mesmo recorte ativo da 302). Idempotente.
SELECT public.garantir_formas_pagamento_padrao(l.id)
FROM public.lojas l
WHERE l.ativo = true;
