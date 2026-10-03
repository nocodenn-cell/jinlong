-- Sprint C2.10 (P0-1, achado Codex) — identidade do provider (empresa +
-- ambiente + provider) persistida e imutável por documento fiscal.
--
-- ACHADO: sem isto, o caminho existia de verdade:
--   documento tenta Focus -> restart/deploy muda FISCAL_PROVIDER_TYPE (ou
--   FISCAL_ENVIRONMENT, ou a config multiempresa da loja) -> retry roda sob
--   uma identidade DIFERENTE da tentativa anterior -> se o provider novo não
--   tem capacidade de consulta (P0-2) ou aponta pra outro ambiente/empresa,
--   o gate de retry-seguro (C2.7/C2.9) não tinha como saber que a
--   identidade mudou -> risco de segundo POST sob contexto errado.
--
-- CORREÇÃO (aplicação, backend/supabase/functions/fiscal-worker/
-- index.ts + fiscal_worker_orchestration.ts, mesmo commit desta migration):
-- a coluna `provider text` — já existente em documentos_fiscais_pendentes
-- desde a migration 037 (muito antes desta missão), nunca ativamente escrita
-- por nenhuma RPC desde então — passa a guardar uma string determinística
-- ("focus:<ambiente>:<loja_id>" ou "<mock|http|bling>"), escrita pelo worker
-- ANTES de qualquer chamada HTTP, e validada em toda tentativa subsequente.
--
-- Esta migration adiciona a garantia de banco (defesa em profundidade além
-- da checagem em TypeScript): uma vez que `provider` tem um valor
-- RECONHECIDO (formato acima), nenhum UPDATE pode mudá-lo — nem pela
-- aplicação, nem por engano futuro. Um valor NÃO reconhecido (ex.: o
-- literal `NFE_PROVIDER_HTTP`, gravado uma única vez pela migration 037
-- muito antes desta missão, com um significado totalmente diferente) NÃO é
-- protegido — pode ser sobrescrito pela primeira tentativa real sob este
-- mecanismo, sem falso-positivo de "identidade mudou" contra dado histórico
-- que nunca teve esse significado.
--
-- Reaproveita o trigger BEFORE UPDATE já existente
-- (`tg_documentos_fiscais_estado_bu`, roda em toda UPDATE desta tabela) —
-- não cria trigger novo, só adiciona uma checagem no início dele, antes da
-- lógica de transição de status já existente (que continua idêntica).
--
-- ROLLBACK: reaplicar a definição anterior de tg_documentos_fiscais_estado_bu
-- (sem o bloco de imutabilidade de `provider`), disponível na migration que
-- a criou originalmente.

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_documentos_fiscais_estado_bu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Sprint C2.10 (P0-1): identidade do provider imutável uma vez
  -- reconhecida — roda ANTES de qualquer outra lógica, inclusive quando o
  -- status não muda (o próprio congelamento é um UPDATE sem mudança de
  -- status). Valores não reconhecidos (dado histórico pré-C2.10) não são
  -- protegidos — só bloqueia mudança de um valor que este mecanismo
  -- realmente gravou.
  IF OLD.provider IS NOT NULL
     AND (
       OLD.provider = ANY (ARRAY['mock', 'http', 'bling'])
       OR OLD.provider ~ '^focus:(homologacao|producao):.+$'
     )
     AND NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'FISCAL_PROVIDER_IMUTAVEL_APOS_CONGELADO:%->%', OLD.provider, NEW.provider;
  END IF;

  -- A partir daqui, corpo IDÊNTICO ao anterior (só a checagem de
  -- imutabilidade de `provider` acima é nova) — nenhuma lógica de transição
  -- de status foi tocada.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'CANCELADO' THEN
    NEW.ultima_transicao_em := now();
    NEW.transicao_origem := concat(OLD.status, '>CANCELADO');
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'PENDENTE' AND NEW.status IN ('EM_PROCESSAMENTO', 'ERRO', 'CANCELADO'))
    OR (OLD.status = 'ERRO' AND NEW.status IN ('PENDENTE', 'EM_PROCESSAMENTO', 'CANCELADO'))
    OR (OLD.status = 'EM_PROCESSAMENTO' AND NEW.status IN ('EMITIDO', 'ERRO', 'PENDENTE', 'CANCELADO'))
    OR (OLD.status = 'EMITIDO' AND NEW.status IN ('CANCELADO'))
  ) THEN
    RAISE EXCEPTION 'FISCAL_TRANSICAO_INVALIDA:%->%', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.ultima_transicao_em := now();
  NEW.transicao_origem := concat(OLD.status, '>', NEW.status);
  RETURN NEW;
END;
$function$;

COMMENT ON COLUMN public.documentos_fiscais_pendentes.provider IS
  'Identidade do provider (empresa+ambiente+provider) que processou a 1ª tentativa deste documento — '
  'formato "focus:<homologacao|producao>:<loja_id>" ou "<mock|http|bling>". Congelada pelo worker ANTES '
  'da 1ª chamada HTTP externa (fiscal-worker/index.ts); imutável uma vez reconhecida (trigger '
  'tg_documentos_fiscais_estado_bu). Sprint C2.10 (2026-09-03, P0-1) — repurpose de coluna já existente '
  '(migration 037), nunca ativamente escrita antes desta sprint.';

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_def text;
  v_uid uuid;
  v_venda_id uuid;
  v_doc_id uuid;
  v_bloqueado boolean := false;
BEGIN
  -- B2 (go-live): o autoteste roda dentro de um sub-bloco que SEMPRE termina
  -- com a exceção sentinela VRB01. O Postgres desfaz tudo o que o sub-bloco
  -- gravou (vendas, itens, pagamentos, estoque, saldo, kardex, comissões,
  -- documentos fiscais, eventos). As asserções continuam valendo: qualquer
  -- outra exceção (inclusive as RAISE do teste) não é capturada e aborta a
  -- migration, como antes. Os RETURN de pré-condição vêm antes de qualquer
  -- escrita, então não deixam efeito.
  BEGIN
  v_def := pg_get_functiondef('tg_documentos_fiscais_estado_bu'::regproc);
  IF position('FISCAL_PROVIDER_IMUTAVEL_APOS_CONGELADO' IN v_def) = 0 THEN
    RAISE EXCEPTION 'C2_10_P01_CHECAGEM_IMUTABILIDADE_AUSENTE';
  END IF;
  -- Regressão: transições de status pré-existentes continuam presentes.
  IF position('FISCAL_TRANSICAO_INVALIDA' IN v_def) = 0 THEN
    RAISE EXCEPTION 'C2_10_P01_REGRESSAO_TRANSICAO_STATUS';
  END IF;

  SELECT id INTO v_uid FROM public.usuarios LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'C2_10_P01: sem usuário para prova viva; verificação estrutural OK';
  ELSE
    v_venda_id := gen_random_uuid();
    INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
    VALUES (v_venda_id, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
    INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
    VALUES (v_venda_id, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
    RETURNING id INTO v_doc_id;

    -- 1ª escrita (congelamento) — permitida.
    UPDATE public.documentos_fiscais_pendentes SET provider = 'focus:homologacao:loja-x' WHERE id = v_doc_id;
    IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id AND provider = 'focus:homologacao:loja-x') THEN
      RAISE EXCEPTION 'C2_10_P01_CONGELAMENTO_FALHOU';
    END IF;

    -- 2ª tentativa de mudar um valor JÁ reconhecido — precisa ser rejeitada.
    BEGIN
      UPDATE public.documentos_fiscais_pendentes SET provider = 'mock' WHERE id = v_doc_id;
    EXCEPTION WHEN OTHERS THEN
      v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'C2_10_P01_IDENTIDADE_MUTAVEL_APOS_CONGELADA';
    END IF;

    -- Valor legado NÃO reconhecido pode ser sobrescrito (não é o mecanismo
    -- desta sprint) — segundo documento, simula dado histórico.
    DECLARE
      v_venda_legado uuid := gen_random_uuid();
      v_doc_legado uuid;
      v_sobrescreveu boolean := false;
    BEGIN
      INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
      VALUES (v_venda_legado, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
      INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload, provider)
      VALUES (v_venda_legado, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb, 'NFE_PROVIDER_HTTP')
      RETURNING id INTO v_doc_legado;

      BEGIN
        UPDATE public.documentos_fiscais_pendentes SET provider = 'focus:producao:loja-y' WHERE id = v_doc_legado;
        v_sobrescreveu := true;
      EXCEPTION WHEN OTHERS THEN
        v_sobrescreveu := false;
      END;
      IF NOT v_sobrescreveu THEN
        RAISE EXCEPTION 'C2_10_P01_VALOR_LEGADO_BLOQUEOU_PRIMEIRO_CONGELAMENTO_REAL';
      END IF;
      DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_legado;
      DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_legado;
      DELETE FROM public.vendas WHERE id = v_venda_legado;
    END;

    DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
    DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
    DELETE FROM public.vendas WHERE id = v_venda_id;
  END IF;
  RAISE EXCEPTION 'VERIFY_ROLLBACK_SENTINELA' USING ERRCODE = 'VRB01';
  EXCEPTION WHEN SQLSTATE 'VRB01' THEN
    RAISE NOTICE '20260903120000: autoteste concluído; efeitos desfeitos (rollback do sub-bloco)';
  END;
END
$verify$;

COMMIT;
