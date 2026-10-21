-- ============================================================================
-- F4 — Persistência do Import Intelligence (módulo premium, opcional por cliente).
--
-- Princípios:
--  * Tabelas próprias (import_*). NÃO integra com estoque, contas a pagar nem preços de venda.
--  * Tenant derivado do banco: empresa = empresa da loja importadora autorizada. Nenhuma RPC
--    aceita empresa_id vindo do cliente.
--  * Inacessível por padrão: leitura e escrita exigem módulo IMPORT_INTELLIGENCE ativo para a
--    empresa (vigência + empresa operacional), usuário autenticado e ativo, papel autorizado e
--    loja autorizada (fp_pode_modulo + fp_pode_loja / fp_pode_operar_loja).
--  * Escrita só por RPC import_*. authenticated tem apenas SELECT (sob RLS).
--  * O cálculo é do motor existente (shared-core/src/import, TypeScript). O banco monta a
--    ENTRADA a partir das próprias tabelas (import_montar_entrada) e guarda entrada, saída,
--    hashes e versão do motor. As apurações são imutáveis e versionadas.
--  * Aprovação: o servidor recalcula com o motor a partir da entrada guardada e confere
--    (verificarAprovacao + igualdade de hash) antes de chamar import_aprovar_apuracao, que é
--    exclusiva de service_role e revalida o aprovador (DONO) no banco.
--  * Valores com a escala do motor (DECISÃO-06): taxa 10, moeda 6, fator 6, quantidade 3,
--    tributo 2. Nenhuma aritmética de custo em SQL (regra D-01): o banco só armazena.
--  * Documentos (D8): metadados imutáveis (sha256, quem, quando, versão por substituição);
--    arquivo em bucket privado por empresa/operação; sem exclusão.
--
-- Portado do PR #537 (F4). Rollback: backend/supabase/rollback/20261021130100_import_intelligence_persistencia.rollback.sql
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Tabelas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_operacoes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid        NOT NULL REFERENCES public.empresas (id),
  loja_importadora_id   uuid        NOT NULL,
  referencia            text        NOT NULL CHECK (length(btrim(referencia)) BETWEEN 1 AND 80),
  descricao             text,
  status                text        NOT NULL DEFAULT 'RASCUNHO'
                                    CHECK (status IN ('RASCUNHO', 'APROVADA', 'CANCELADA')),
  versao_dados          integer     NOT NULL DEFAULT 1,
  apuracao_aprovada_id  uuid,
  criado_por            uuid        NOT NULL,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_operacoes_loja_empresa_fk FOREIGN KEY (loja_importadora_id, empresa_id)
    REFERENCES public.lojas (id, empresa_id),
  CONSTRAINT import_operacoes_ref_unica UNIQUE (empresa_id, referencia)
);

CREATE TABLE IF NOT EXISTS public.import_cambios (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id  uuid        NOT NULL REFERENCES public.import_operacoes (id),
  empresa_id   uuid        NOT NULL REFERENCES public.empresas (id),
  moeda        text        NOT NULL CHECK (moeda ~ '^[A-Z]{3}$' AND moeda <> 'BRL'),
  taxa         numeric(24,10) NOT NULL CHECK (taxa > 0),
  fonte        text        NOT NULL CHECK (fonte IN ('DECLARADA_DI', 'MANUAL', 'OUTRA')),
  data         date        NOT NULL,
  documento_id uuid,
  UNIQUE (operacao_id, moeda)
);

CREATE TABLE IF NOT EXISTS public.import_itens (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id            uuid        NOT NULL REFERENCES public.import_operacoes (id),
  empresa_id             uuid        NOT NULL REFERENCES public.empresas (id),
  produto_id             uuid        REFERENCES public.produtos (id),
  descricao              text        NOT NULL CHECK (length(btrim(descricao)) > 0),
  moeda                  text        NOT NULL CHECK (moeda ~ '^[A-Z]{3}$'),
  valor_mercadoria_moeda numeric(24,6) NOT NULL CHECK (valor_mercadoria_moeda >= 0),
  valor_aduaneiro_brl    numeric(24,6) CHECK (valor_aduaneiro_brl >= 0),
  quantidade_comercial   numeric(18,3) NOT NULL CHECK (quantidade_comercial > 0),
  unidade_comercial      text        NOT NULL CHECK (length(btrim(unidade_comercial)) > 0),
  fator_para_estoque     numeric(18,6) NOT NULL CHECK (fator_para_estoque > 0),
  quantidade_estoque     numeric(18,3) NOT NULL CHECK (quantidade_estoque > 0),
  peso_liquido_kg        numeric(18,3) CHECK (peso_liquido_kg >= 0),
  peso_bruto_kg          numeric(18,3) CHECK (peso_bruto_kg >= 0),
  volume_m3              numeric(18,3) CHECK (volume_m3 >= 0),
  documento_id           uuid
);

CREATE TABLE IF NOT EXISTS public.import_despesas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id      uuid        NOT NULL REFERENCES public.import_operacoes (id),
  empresa_id       uuid        NOT NULL REFERENCES public.empresas (id),
  tipo             text        NOT NULL CHECK (length(btrim(tipo)) > 0),
  moeda            text        NOT NULL CHECK (moeda ~ '^[A-Z]{3}$'),
  valor            numeric(24,6) NOT NULL,            -- pode ser negativo: estorno documentado
  incorporavel     text        NOT NULL CHECK (incorporavel IN ('SIM', 'NAO', 'DECISAO_03')),
  atribuicao_modo  text        NOT NULL CHECK (atribuicao_modo IN ('DIRETA', 'RATEIO')),
  item_id          uuid        REFERENCES public.import_itens (id),
  criterio         text        CHECK (criterio IN ('VALOR_ADUANEIRO', 'PESO_LIQUIDO', 'PESO_BRUTO', 'VOLUME', 'QUANTIDADE_ESTOQUE')),
  justificativa    text        NOT NULL,
  documento_id     uuid,
  CONSTRAINT import_despesas_atribuicao_check CHECK (
    (atribuicao_modo = 'DIRETA' AND item_id IS NOT NULL AND criterio IS NULL)
    OR (atribuicao_modo = 'RATEIO' AND item_id IS NULL AND criterio IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.import_descontos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id    uuid        NOT NULL REFERENCES public.import_operacoes (id),
  empresa_id     uuid        NOT NULL REFERENCES public.empresas (id),
  escopo         text        NOT NULL CHECK (escopo IN ('ITEM', 'PROCESSO')),
  moeda          text        NOT NULL CHECK (moeda ~ '^[A-Z]{3}$'),
  valor          numeric(24,6) NOT NULL CHECK (valor > 0),
  item_id        uuid        REFERENCES public.import_itens (id),
  criterio       text        CHECK (criterio IN ('VALOR_ADUANEIRO', 'PESO_LIQUIDO', 'PESO_BRUTO', 'VOLUME', 'QUANTIDADE_ESTOQUE')),
  justificativa  text        NOT NULL,
  documento_id   uuid,
  CONSTRAINT import_descontos_escopo_item_check CHECK (
    (escopo = 'ITEM' AND item_id IS NOT NULL) OR (escopo = 'PROCESSO' AND item_id IS NULL AND criterio IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.import_tributos (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id             uuid        NOT NULL REFERENCES public.import_operacoes (id),
  empresa_id              uuid        NOT NULL REFERENCES public.empresas (id),
  tributo_codigo          text        NOT NULL CHECK (length(btrim(tributo_codigo)) > 0),
  status_recuperabilidade text        NOT NULL CHECK (status_recuperabilidade IN (
                            'PENDENTE_VALIDACAO', 'NAO_RECUPERAVEL', 'RECUPERAVEL_POTENCIAL',
                            'RECUPERAVEL_RECONHECIDO', 'GLOSADO', 'NAO_APLICAVEL')),
  valor_apurado_brl       numeric(18,2) NOT NULL CHECK (valor_apurado_brl >= 0),
  item_id                 uuid        REFERENCES public.import_itens (id),
  regra_id                text,
  regra_incorpora_custo   boolean,
  regra_vigencia_inicio   date,
  regra_vigencia_fim      date,
  data_fato_gerador       date,
  validado_por            text,
  documento_id            uuid,
  CONSTRAINT import_tributos_regra_check CHECK (
    (regra_id IS NULL AND regra_incorpora_custo IS NULL AND regra_vigencia_inicio IS NULL AND regra_vigencia_fim IS NULL)
    OR (regra_id IS NOT NULL AND regra_incorpora_custo IS NOT NULL AND regra_vigencia_inicio IS NOT NULL))
);

-- Documentos (D8): metadados imutáveis; nova versão = nova linha que substitui a anterior.
CREATE TABLE IF NOT EXISTS public.import_documentos (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id            uuid        NOT NULL REFERENCES public.import_operacoes (id),
  empresa_id             uuid        NOT NULL REFERENCES public.empresas (id),
  tipo                   text        NOT NULL CHECK (tipo IN ('INVOICE', 'PACKING_LIST', 'CONHECIMENTO_EMBARQUE',
                                       'DI', 'DUIMP', 'NFE', 'COMPROVANTE_PAGAMENTO', 'CONTRATO_CAMBIO', 'OUTRO')),
  numero                 text,
  data_documento         date,
  storage_bucket         text,
  storage_path           text,
  sha256                 text        CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  tamanho_bytes          bigint      CHECK (tamanho_bytes IS NULL OR tamanho_bytes > 0),
  mime_type              text,
  versao                 integer     NOT NULL DEFAULT 1 CHECK (versao >= 1),
  substitui_documento_id uuid        REFERENCES public.import_documentos (id),
  enviado_por            uuid        NOT NULL,
  enviado_em             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_documentos_arquivo_check CHECK (
    (storage_path IS NULL AND sha256 IS NULL) OR (storage_path IS NOT NULL AND sha256 IS NOT NULL AND storage_bucket IS NOT NULL)),
  CONSTRAINT import_documentos_caminho_tenant CHECK (
    storage_path IS NULL OR storage_path LIKE (empresa_id::text || '/' || operacao_id::text || '/%'))
);

-- Apurações (simulações e versões): imutáveis.
CREATE TABLE IF NOT EXISTS public.import_apuracoes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id      uuid        NOT NULL REFERENCES public.import_operacoes (id),
  empresa_id       uuid        NOT NULL REFERENCES public.empresas (id),
  versao           integer     NOT NULL,
  tipo             text        NOT NULL CHECK (tipo IN ('SIMULACAO', 'APURACAO')),
  versao_dados     integer     NOT NULL,
  engine_version   text        NOT NULL,
  entrada          jsonb       NOT NULL,
  entrada_sha256   text        NOT NULL CHECK (entrada_sha256 ~ '^[0-9a-f]{64}$'),
  saida            jsonb       NOT NULL,
  saida_sha256     text        NOT NULL CHECK (saida_sha256 ~ '^[0-9a-f]{64}$'),
  status_calculo   text        NOT NULL CHECK (status_calculo IN ('OK', 'BLOQUEADO')),
  conservacao_ok   boolean     NOT NULL,
  criado_por       uuid        NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operacao_id, versao)
);

CREATE TABLE IF NOT EXISTS public.import_apuracao_itens (
  apuracao_id          uuid    NOT NULL REFERENCES public.import_apuracoes (id),
  empresa_id           uuid    NOT NULL REFERENCES public.empresas (id),
  item_id              uuid    NOT NULL REFERENCES public.import_itens (id),
  produto_id           uuid,
  quantidade_estoque   numeric NOT NULL,
  custo_total_brl      numeric NOT NULL,
  custo_unitario_brl   numeric NOT NULL,
  residuo_unitario_brl numeric NOT NULL,
  residuo_total_brl    numeric NOT NULL,
  componentes_brl      jsonb   NOT NULL,
  memoria              jsonb   NOT NULL,
  PRIMARY KEY (apuracao_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.import_apuracao_rateios (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  apuracao_id       uuid    NOT NULL REFERENCES public.import_apuracoes (id),
  empresa_id        uuid    NOT NULL REFERENCES public.empresas (id),
  origem_id         text    NOT NULL,
  componente        text    NOT NULL CHECK (componente IN ('despesas', 'descontos', 'tributos')),
  criterio          text    NOT NULL,
  base_total        numeric NOT NULL,
  item_id           uuid    NOT NULL,
  base_item         numeric NOT NULL,
  valor_alocado_brl numeric NOT NULL,
  justificativa     text    NOT NULL
);

CREATE TABLE IF NOT EXISTS public.import_divergencias (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  apuracao_id uuid  NOT NULL REFERENCES public.import_apuracoes (id),
  empresa_id  uuid  NOT NULL REFERENCES public.empresas (id),
  codigo      text  NOT NULL,
  severidade  text  NOT NULL CHECK (severidade IN ('BLOQUEANTE', 'AVISO')),
  referencia  text  NOT NULL,
  mensagem    text  NOT NULL
);

CREATE TABLE IF NOT EXISTS public.import_aprovacoes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id  uuid        NOT NULL REFERENCES public.import_operacoes (id),
  apuracao_id  uuid        REFERENCES public.import_apuracoes (id),
  empresa_id   uuid        NOT NULL REFERENCES public.empresas (id),
  decisao      text        NOT NULL CHECK (decisao IN ('APROVADA', 'REABERTA', 'CANCELADA')),
  por          uuid        NOT NULL,
  motivo       text        NOT NULL,
  verificacao  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  em           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.import_auditoria (
  id           bigserial   PRIMARY KEY,
  empresa_id   uuid        NOT NULL,
  operacao_id  uuid,
  acao         text        NOT NULL,
  entidade     text        NOT NULL,
  entidade_id  uuid,
  por          uuid,
  detalhe      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_operacoes_empresa_idx ON public.import_operacoes (empresa_id, status);
CREATE INDEX IF NOT EXISTS import_itens_op_idx ON public.import_itens (operacao_id);
CREATE INDEX IF NOT EXISTS import_cambios_op_idx ON public.import_cambios (operacao_id);
CREATE INDEX IF NOT EXISTS import_despesas_op_idx ON public.import_despesas (operacao_id);
CREATE INDEX IF NOT EXISTS import_descontos_op_idx ON public.import_descontos (operacao_id);
CREATE INDEX IF NOT EXISTS import_tributos_op_idx ON public.import_tributos (operacao_id);
CREATE INDEX IF NOT EXISTS import_documentos_op_idx ON public.import_documentos (operacao_id);
CREATE INDEX IF NOT EXISTS import_apuracoes_op_idx ON public.import_apuracoes (operacao_id, versao);
CREATE INDEX IF NOT EXISTS import_apuracao_rateios_ap_idx ON public.import_apuracao_rateios (apuracao_id);
CREATE INDEX IF NOT EXISTS import_divergencias_ap_idx ON public.import_divergencias (apuracao_id);
CREATE INDEX IF NOT EXISTS import_aprovacoes_op_idx ON public.import_aprovacoes (operacao_id, em);
CREATE INDEX IF NOT EXISTS import_auditoria_op_idx ON public.import_auditoria (operacao_id, em);

-- ----------------------------------------------------------------------------
-- 2. Imutabilidade (apurações, documentos, aprovações, auditoria)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_apuracoes', 'import_apuracao_itens', 'import_apuracao_rateios',
                           'import_divergencias', 'import_documentos', 'import_aprovacoes', 'import_auditoria']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_imutavel', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_historico_imutavel()',
                   t || '_imutavel', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Autorização
-- ----------------------------------------------------------------------------
-- Pode agir sobre a operação com um dos papéis: módulo ativo + loja autorizada. Sem identidade ⇒ false.
CREATE OR REPLACE FUNCTION public.fp_import_pode_operacao(p_operacao uuid, p_papeis text[] DEFAULT ARRAY['DONO', 'GERENTE'])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.import_operacoes o
     WHERE o.id = p_operacao
       AND public.fp_pode_modulo(o.empresa_id, 'IMPORT_INTELLIGENCE', p_papeis)
       AND public.fp_pode_loja(o.loja_importadora_id, p_papeis))
$$;

REVOKE ALL ON FUNCTION public.fp_import_pode_operacao(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_import_pode_operacao(uuid, text[]) TO authenticated, service_role;

-- Mesma regra para um usuário EXPLÍCITO (usada só pela aprovação, chamada pelo servidor).
CREATE OR REPLACE FUNCTION public._fp_import_usuario_pode(p_usuario uuid, p_operacao uuid, p_papeis text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.import_operacoes o
      JOIN public.usuarios u ON u.id = p_usuario AND u.ativo
      JOIN public.usuario_vinculos v ON v.usuario_id = u.id AND v.ativo AND v.empresa_id = o.empresa_id
                                    AND v.papel = ANY (p_papeis)
                                    AND (v.papel = 'DONO' OR v.loja_id = o.loja_importadora_id)
     WHERE o.id = p_operacao
       AND public.fp_modulo_ativo(o.empresa_id, 'IMPORT_INTELLIGENCE'))
$$;

REVOKE ALL ON FUNCTION public._fp_import_usuario_pode(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated, service_role;

-- Carrega a operação para escrita: identidade, permissão e estado RASCUNHO. Incrementa versao_dados.
CREATE OR REPLACE FUNCTION public._import_operacao_para_escrita(p_operacao uuid)
RETURNS public.import_operacoes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v public.import_operacoes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.import_operacoes WHERE id = p_operacao FOR UPDATE;
  IF v.id IS NULL OR NOT public.fp_import_pode_operacao(p_operacao, ARRAY['DONO', 'GERENTE'])
     OR NOT public.fp_pode_operar_loja(v.loja_importadora_id, ARRAY['DONO', 'GERENTE']) THEN
    RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF v.status <> 'RASCUNHO' THEN
    RAISE EXCEPTION 'IMPORT_OPERACAO_NAO_EDITAVEL';
  END IF;
  UPDATE public.import_operacoes SET versao_dados = versao_dados + 1, atualizado_em = now()
   WHERE id = p_operacao RETURNING * INTO v;
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public._import_operacao_para_escrita(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._import_auditar(p_empresa uuid, p_operacao uuid, p_acao text, p_entidade text,
                                                  p_entidade_id uuid, p_detalhe jsonb)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  INSERT INTO public.import_auditoria (empresa_id, operacao_id, acao, entidade, entidade_id, por, detalhe)
  VALUES (p_empresa, p_operacao, p_acao, p_entidade, p_entidade_id, auth.uid(), coalesce(p_detalhe, '{}'::jsonb))
$$;

REVOKE ALL ON FUNCTION public._import_auditar(uuid, uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. RLS: somente leitura para authenticated, inacessível sem módulo/papel/loja
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_operacoes', 'import_cambios', 'import_itens', 'import_despesas', 'import_descontos',
                           'import_tributos', 'import_documentos', 'import_apuracoes', 'import_apuracao_itens',
                           'import_apuracao_rateios', 'import_divergencias', 'import_aprovacoes', 'import_auditoria']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS import_leitura ON public.%I', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.import_auditoria_id_seq TO service_role;

CREATE POLICY import_leitura ON public.import_operacoes FOR SELECT TO authenticated
  USING (public.fp_import_pode_operacao(id));
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_cambios', 'import_itens', 'import_despesas', 'import_descontos', 'import_tributos',
                           'import_documentos', 'import_apuracoes', 'import_aprovacoes', 'import_auditoria']
  LOOP
    EXECUTE format('CREATE POLICY import_leitura ON public.%I FOR SELECT TO authenticated USING (public.fp_import_pode_operacao(operacao_id))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['import_apuracao_itens', 'import_apuracao_rateios', 'import_divergencias']
  LOOP
    EXECUTE format('CREATE POLICY import_leitura ON public.%I FOR SELECT TO authenticated USING (EXISTS (
      SELECT 1 FROM public.import_apuracoes a WHERE a.id = apuracao_id AND public.fp_import_pode_operacao(a.operacao_id)))', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. RPCs de escrita (authenticated; tenant derivado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_criar_operacao(p_loja_importadora uuid, p_referencia text, p_descricao text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_empresa uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  -- tenant derivado da loja; a loja precisa ser operável pelo usuário (cerca + papel + empresa operacional)
  SELECT empresa_id INTO v_empresa FROM public.lojas WHERE id = p_loja_importadora;
  IF v_empresa IS NULL
     OR NOT public.fp_pode_operar_loja(p_loja_importadora, ARRAY['DONO', 'GERENTE'])
     OR NOT public.fp_pode_modulo(v_empresa, 'IMPORT_INTELLIGENCE', ARRAY['DONO', 'GERENTE']) THEN
    RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.import_operacoes (empresa_id, loja_importadora_id, referencia, descricao, criado_por)
  VALUES (v_empresa, p_loja_importadora, btrim(p_referencia), nullif(btrim(coalesce(p_descricao, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public._import_auditar(v_empresa, v_id, 'CRIAR', 'operacao', v_id, jsonb_build_object('referencia', btrim(p_referencia)));
  RETURN v_id;
END
$$;

-- Item: insere (p_item->>'id' nulo) ou atualiza. Produto, se informado, precisa ser da mesma empresa.
CREATE OR REPLACE FUNCTION public.import_salvar_item(p_operacao uuid, p_item jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_prod uuid := nullif(p_item ->> 'produto_id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  o := public._import_operacao_para_escrita(p_operacao);
  IF v_prod IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.produtos p JOIN public.lojas l ON l.id = p.loja_id
        WHERE p.id = v_prod AND l.empresa_id = o.empresa_id) THEN
    RAISE EXCEPTION 'IMPORT_PRODUTO_FORA_DA_EMPRESA' USING ERRCODE = '42501';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.import_itens (operacao_id, empresa_id, produto_id, descricao, moeda, valor_mercadoria_moeda,
      valor_aduaneiro_brl, quantidade_comercial, unidade_comercial, fator_para_estoque, quantidade_estoque,
      peso_liquido_kg, peso_bruto_kg, volume_m3, documento_id)
    VALUES (o.id, o.empresa_id, v_prod, p_item ->> 'descricao', upper(p_item ->> 'moeda'),
      (p_item ->> 'valor_mercadoria_moeda')::numeric, (p_item ->> 'valor_aduaneiro_brl')::numeric,
      (p_item ->> 'quantidade_comercial')::numeric, p_item ->> 'unidade_comercial',
      (p_item ->> 'fator_para_estoque')::numeric, (p_item ->> 'quantidade_estoque')::numeric,
      (p_item ->> 'peso_liquido_kg')::numeric, (p_item ->> 'peso_bruto_kg')::numeric, (p_item ->> 'volume_m3')::numeric,
      nullif(p_item ->> 'documento_id', '')::uuid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.import_itens SET produto_id = v_prod, descricao = p_item ->> 'descricao', moeda = upper(p_item ->> 'moeda'),
      valor_mercadoria_moeda = (p_item ->> 'valor_mercadoria_moeda')::numeric,
      valor_aduaneiro_brl = (p_item ->> 'valor_aduaneiro_brl')::numeric,
      quantidade_comercial = (p_item ->> 'quantidade_comercial')::numeric, unidade_comercial = p_item ->> 'unidade_comercial',
      fator_para_estoque = (p_item ->> 'fator_para_estoque')::numeric, quantidade_estoque = (p_item ->> 'quantidade_estoque')::numeric,
      peso_liquido_kg = (p_item ->> 'peso_liquido_kg')::numeric, peso_bruto_kg = (p_item ->> 'peso_bruto_kg')::numeric,
      volume_m3 = (p_item ->> 'volume_m3')::numeric, documento_id = nullif(p_item ->> 'documento_id', '')::uuid
     WHERE id = v_id AND operacao_id = o.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_ITEM_NAO_ENCONTRADO'; END IF;
  END IF;
  PERFORM public._import_auditar(o.empresa_id, o.id, 'SALVAR', 'item', v_id, p_item);
  RETURN v_id;
END
$$;

-- Lançamentos: CAMBIO | DESPESA | DESCONTO | TRIBUTO (insere ou atualiza por id).
CREATE OR REPLACE FUNCTION public.import_salvar_lancamento(p_operacao uuid, p_tipo text, p_dados jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
  v_id uuid := nullif(p_dados ->> 'id', '')::uuid;
  v_item uuid := nullif(p_dados ->> 'item_id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  o := public._import_operacao_para_escrita(p_operacao);
  IF v_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.import_itens WHERE id = v_item AND operacao_id = o.id) THEN
    RAISE EXCEPTION 'IMPORT_ITEM_DE_OUTRA_OPERACAO';
  END IF;

  IF p_tipo = 'CAMBIO' THEN
    IF v_id IS NULL THEN
      INSERT INTO public.import_cambios (operacao_id, empresa_id, moeda, taxa, fonte, data, documento_id)
      VALUES (o.id, o.empresa_id, upper(p_dados ->> 'moeda'), (p_dados ->> 'taxa')::numeric, p_dados ->> 'fonte',
              (p_dados ->> 'data')::date, nullif(p_dados ->> 'documento_id', '')::uuid)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.import_cambios SET moeda = upper(p_dados ->> 'moeda'), taxa = (p_dados ->> 'taxa')::numeric,
             fonte = p_dados ->> 'fonte', data = (p_dados ->> 'data')::date, documento_id = nullif(p_dados ->> 'documento_id', '')::uuid
       WHERE id = v_id AND operacao_id = o.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
    END IF;
  ELSIF p_tipo = 'DESPESA' THEN
    IF v_id IS NULL THEN
      INSERT INTO public.import_despesas (operacao_id, empresa_id, tipo, moeda, valor, incorporavel, atribuicao_modo,
                                         item_id, criterio, justificativa, documento_id)
      VALUES (o.id, o.empresa_id, p_dados ->> 'tipo', upper(p_dados ->> 'moeda'), (p_dados ->> 'valor')::numeric,
              p_dados ->> 'incorporavel', p_dados ->> 'atribuicao_modo', v_item, p_dados ->> 'criterio',
              coalesce(p_dados ->> 'justificativa', ''), nullif(p_dados ->> 'documento_id', '')::uuid)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.import_despesas SET tipo = p_dados ->> 'tipo', moeda = upper(p_dados ->> 'moeda'),
             valor = (p_dados ->> 'valor')::numeric, incorporavel = p_dados ->> 'incorporavel',
             atribuicao_modo = p_dados ->> 'atribuicao_modo', item_id = v_item, criterio = p_dados ->> 'criterio',
             justificativa = coalesce(p_dados ->> 'justificativa', ''), documento_id = nullif(p_dados ->> 'documento_id', '')::uuid
       WHERE id = v_id AND operacao_id = o.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
    END IF;
  ELSIF p_tipo = 'DESCONTO' THEN
    IF v_id IS NULL THEN
      INSERT INTO public.import_descontos (operacao_id, empresa_id, escopo, moeda, valor, item_id, criterio, justificativa, documento_id)
      VALUES (o.id, o.empresa_id, p_dados ->> 'escopo', upper(p_dados ->> 'moeda'), (p_dados ->> 'valor')::numeric,
              v_item, p_dados ->> 'criterio', coalesce(p_dados ->> 'justificativa', ''), nullif(p_dados ->> 'documento_id', '')::uuid)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.import_descontos SET escopo = p_dados ->> 'escopo', moeda = upper(p_dados ->> 'moeda'),
             valor = (p_dados ->> 'valor')::numeric, item_id = v_item, criterio = p_dados ->> 'criterio',
             justificativa = coalesce(p_dados ->> 'justificativa', ''), documento_id = nullif(p_dados ->> 'documento_id', '')::uuid
       WHERE id = v_id AND operacao_id = o.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
    END IF;
  ELSIF p_tipo = 'TRIBUTO' THEN
    IF v_id IS NULL THEN
      INSERT INTO public.import_tributos (operacao_id, empresa_id, tributo_codigo, status_recuperabilidade, valor_apurado_brl,
        item_id, regra_id, regra_incorpora_custo, regra_vigencia_inicio, regra_vigencia_fim, data_fato_gerador, validado_por, documento_id)
      VALUES (o.id, o.empresa_id, p_dados ->> 'tributo_codigo', p_dados ->> 'status_recuperabilidade',
        (p_dados ->> 'valor_apurado_brl')::numeric, v_item, p_dados ->> 'regra_id', (p_dados ->> 'regra_incorpora_custo')::boolean,
        (p_dados ->> 'regra_vigencia_inicio')::date, (p_dados ->> 'regra_vigencia_fim')::date,
        (p_dados ->> 'data_fato_gerador')::date, p_dados ->> 'validado_por', nullif(p_dados ->> 'documento_id', '')::uuid)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.import_tributos SET tributo_codigo = p_dados ->> 'tributo_codigo',
        status_recuperabilidade = p_dados ->> 'status_recuperabilidade', valor_apurado_brl = (p_dados ->> 'valor_apurado_brl')::numeric,
        item_id = v_item, regra_id = p_dados ->> 'regra_id', regra_incorpora_custo = (p_dados ->> 'regra_incorpora_custo')::boolean,
        regra_vigencia_inicio = (p_dados ->> 'regra_vigencia_inicio')::date, regra_vigencia_fim = (p_dados ->> 'regra_vigencia_fim')::date,
        data_fato_gerador = (p_dados ->> 'data_fato_gerador')::date, validado_por = p_dados ->> 'validado_por',
        documento_id = nullif(p_dados ->> 'documento_id', '')::uuid
       WHERE id = v_id AND operacao_id = o.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'IMPORT_TIPO_LANCAMENTO_INVALIDO';
  END IF;

  PERFORM public._import_auditar(o.empresa_id, o.id, 'SALVAR', lower(p_tipo), v_id, p_dados);
  RETURN v_id;
END
$$;

-- Remoção de rascunho (item ou lançamento), auditada com o estado anterior.
CREATE OR REPLACE FUNCTION public.import_remover_rascunho(p_operacao uuid, p_tipo text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
  v_tab text := CASE p_tipo WHEN 'ITEM' THEN 'import_itens' WHEN 'CAMBIO' THEN 'import_cambios'
                            WHEN 'DESPESA' THEN 'import_despesas' WHEN 'DESCONTO' THEN 'import_descontos'
                            WHEN 'TRIBUTO' THEN 'import_tributos' END;
  v_antes jsonb;
BEGIN
  IF v_tab IS NULL THEN RAISE EXCEPTION 'IMPORT_TIPO_LANCAMENTO_INVALIDO'; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  o := public._import_operacao_para_escrita(p_operacao);
  EXECUTE format('DELETE FROM public.%I WHERE id = $1 AND operacao_id = $2 RETURNING to_jsonb(%I.*)', v_tab, v_tab)
     INTO v_antes USING p_id, o.id;
  IF v_antes IS NULL THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
  PERFORM public._import_auditar(o.empresa_id, o.id, 'REMOVER', lower(p_tipo), p_id, v_antes);
END
$$;

-- Documento (D8): metadados imutáveis. Arquivo no bucket privado, caminho <empresa>/<operacao>/...
CREATE OR REPLACE FUNCTION public.import_registrar_documento(
  p_operacao uuid, p_tipo text, p_numero text, p_data date,
  p_storage_path text, p_sha256 text, p_tamanho bigint, p_mime text, p_substitui uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
  v_versao int := 1;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.import_operacoes WHERE id = p_operacao;
  -- documentos podem ser anexados em qualquer estado (inclusive APROVADA), nunca apagados
  IF o.id IS NULL OR NOT public.fp_import_pode_operacao(p_operacao, ARRAY['DONO', 'GERENTE'])
     OR NOT public.fp_pode_operar_loja(o.loja_importadora_id, ARRAY['DONO', 'GERENTE']) THEN
    RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF p_substitui IS NOT NULL THEN
    SELECT versao + 1 INTO v_versao FROM public.import_documentos WHERE id = p_substitui AND operacao_id = o.id;
    IF v_versao IS NULL THEN RAISE EXCEPTION 'IMPORT_DOCUMENTO_SUBSTITUIDO_INEXISTENTE'; END IF;
  END IF;
  INSERT INTO public.import_documentos (operacao_id, empresa_id, tipo, numero, data_documento, storage_bucket, storage_path,
                                        sha256, tamanho_bytes, mime_type, versao, substitui_documento_id, enviado_por)
  VALUES (o.id, o.empresa_id, p_tipo, p_numero, p_data, CASE WHEN p_storage_path IS NOT NULL THEN 'import-documentos' END,
          p_storage_path, lower(p_sha256), p_tamanho, p_mime, v_versao, p_substitui, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public._import_auditar(o.empresa_id, o.id, 'REGISTRAR', 'documento', v_id,
    jsonb_build_object('tipo', p_tipo, 'sha256', lower(p_sha256), 'versao', v_versao, 'substitui', p_substitui));
  RETURN v_id;
END
$$;

-- ----------------------------------------------------------------------------
-- 6. Entrada do motor montada PELO BANCO (formato LandedCostInput, schema_version 1)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._import_montar_entrada(p_operacao uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'schema_version', '1',
    'processo', jsonb_build_object('id', o.id::text, 'loja_importadora_id', o.loja_importadora_id::text, 'moeda_base', 'BRL'),
    'politica', jsonb_build_object('escala_intermediaria', 10, 'escala_persistencia', 4, 'escala_unitario', 6,
                                   'arredondamento', 'HALF_UP', 'ordem_residuo', 'MAIOR_RESTO_ITEM_ID_ASC'),
    'cambios', coalesce((SELECT jsonb_agg(jsonb_build_object('moeda', c.moeda, 'taxa', c.taxa::text, 'fonte', c.fonte,
                          'data', to_char(c.data, 'YYYY-MM-DD')) ORDER BY c.moeda)
                          FROM public.import_cambios c WHERE c.operacao_id = o.id), '[]'::jsonb),
    'itens', coalesce((SELECT jsonb_agg(jsonb_build_object(
                          'id', i.id::text, 'produto_id', i.produto_id::text, 'moeda', i.moeda,
                          'valor_mercadoria_moeda', i.valor_mercadoria_moeda::text,
                          'valor_aduaneiro_brl', i.valor_aduaneiro_brl::text,
                          'quantidade_comercial', i.quantidade_comercial::text, 'unidade_comercial', i.unidade_comercial,
                          'fator_para_estoque', i.fator_para_estoque::text, 'quantidade_estoque', i.quantidade_estoque::text,
                          'peso_liquido_kg', i.peso_liquido_kg::text, 'peso_bruto_kg', i.peso_bruto_kg::text,
                          'volume_m3', i.volume_m3::text) ORDER BY i.id::text)
                        FROM public.import_itens i WHERE i.operacao_id = o.id), '[]'::jsonb),
    'despesas', coalesce((SELECT jsonb_agg(jsonb_build_object(
                          'id', d.id::text, 'tipo', d.tipo, 'moeda', d.moeda, 'valor', d.valor::text,
                          'incorporavel', CASE d.incorporavel WHEN 'SIM' THEN to_jsonb(true) WHEN 'NAO' THEN to_jsonb(false)
                                                              ELSE to_jsonb('DECISAO_03'::text) END,
                          'atribuicao', CASE d.atribuicao_modo
                             WHEN 'DIRETA' THEN jsonb_build_object('modo', 'DIRETA', 'item_id', d.item_id::text, 'justificativa', d.justificativa)
                             ELSE jsonb_build_object('modo', 'RATEIO', 'criterio', d.criterio, 'justificativa', d.justificativa) END)
                          ORDER BY d.id::text)
                        FROM public.import_despesas d WHERE d.operacao_id = o.id), '[]'::jsonb),
    'descontos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                          'id', x.id::text, 'escopo', x.escopo, 'moeda', x.moeda, 'valor', x.valor::text,
                          'justificativa', x.justificativa)
                          || CASE WHEN x.item_id IS NOT NULL THEN jsonb_build_object('item_id', x.item_id::text) ELSE '{}'::jsonb END
                          || CASE WHEN x.criterio IS NOT NULL THEN jsonb_build_object('criterio', x.criterio) ELSE '{}'::jsonb END
                          ORDER BY x.id::text)
                        FROM public.import_descontos x WHERE x.operacao_id = o.id), '[]'::jsonb),
    'tributos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                          'id', t.id::text, 'tributo_codigo', t.tributo_codigo,
                          'status_recuperabilidade', t.status_recuperabilidade,
                          'valor_apurado_brl', t.valor_apurado_brl::text, 'item_id', t.item_id::text,
                          'regra', CASE WHEN t.regra_id IS NULL THEN NULL ELSE jsonb_build_object(
                             'id', t.regra_id, 'incorpora_custo', t.regra_incorpora_custo,
                             'vigencia_inicio', to_char(t.regra_vigencia_inicio, 'YYYY-MM-DD'),
                             'vigencia_fim', to_char(t.regra_vigencia_fim, 'YYYY-MM-DD')) END,
                          'data_fato_gerador', to_char(t.data_fato_gerador, 'YYYY-MM-DD'),
                          'validado_por', t.validado_por) ORDER BY t.id::text)
                        FROM public.import_tributos t WHERE t.operacao_id = o.id), '[]'::jsonb))
  FROM public.import_operacoes o
  WHERE o.id = p_operacao
$$;

REVOKE ALL ON FUNCTION public._import_montar_entrada(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.import_montar_entrada(p_operacao uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.fp_import_pode_operacao(p_operacao) THEN
    RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'versao_dados', (SELECT versao_dados FROM public.import_operacoes WHERE id = p_operacao),
    'entrada', public._import_montar_entrada(p_operacao));
END
$$;

-- ----------------------------------------------------------------------------
-- 7. Registro de apuração (simulação ou versão). Entrada é a do BANCO no mesmo instante;
--    a saída vem do motor no servidor. Divergências e itens ficam consultáveis.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_registrar_apuracao(
  p_operacao uuid, p_tipo text, p_versao_dados integer,
  p_entrada_sha256 text, p_saida jsonb, p_saida_sha256 text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
  v_id uuid;
  v_versao int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.import_operacoes WHERE id = p_operacao FOR UPDATE;
  IF o.id IS NULL OR NOT public.fp_import_pode_operacao(p_operacao, ARRAY['DONO', 'GERENTE'])
     OR NOT public.fp_pode_operar_loja(o.loja_importadora_id, ARRAY['DONO', 'GERENTE']) THEN
    RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF o.status <> 'RASCUNHO' THEN
    RAISE EXCEPTION 'IMPORT_OPERACAO_NAO_EDITAVEL';
  END IF;
  -- concorrência: o cálculo tem de ter partido da versão atual dos dados
  IF p_versao_dados IS DISTINCT FROM o.versao_dados THEN
    RAISE EXCEPTION 'IMPORT_DADOS_ALTERADOS_DURANTE_CALCULO';
  END IF;
  IF p_tipo NOT IN ('SIMULACAO', 'APURACAO') OR p_saida ->> 'schema_version' <> '1'
     OR p_saida ->> 'status' NOT IN ('OK', 'BLOQUEADO') OR coalesce(p_saida ->> 'engine_version', '') = '' THEN
    RAISE EXCEPTION 'IMPORT_SAIDA_INVALIDA';
  END IF;
  -- os itens da saída precisam ser exatamente os itens da operação
  IF (SELECT array_agg(x ->> 'item_id' ORDER BY x ->> 'item_id') FROM jsonb_array_elements(p_saida -> 'itens') x)
     IS DISTINCT FROM (SELECT array_agg(i.id::text ORDER BY i.id::text) FROM public.import_itens i WHERE i.operacao_id = o.id) THEN
    RAISE EXCEPTION 'IMPORT_SAIDA_NAO_CORRESPONDE_AOS_ITENS';
  END IF;

  SELECT coalesce(max(versao), 0) + 1 INTO v_versao FROM public.import_apuracoes WHERE operacao_id = o.id;
  INSERT INTO public.import_apuracoes (operacao_id, empresa_id, versao, tipo, versao_dados, engine_version, entrada,
      entrada_sha256, saida, saida_sha256, status_calculo, conservacao_ok, criado_por)
  VALUES (o.id, o.empresa_id, v_versao, p_tipo, o.versao_dados, p_saida ->> 'engine_version',
          public._import_montar_entrada(o.id), lower(p_entrada_sha256), p_saida, lower(p_saida_sha256),
          p_saida ->> 'status', coalesce((p_saida -> 'conservacao' ->> 'ok')::boolean, false), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.import_apuracao_itens (apuracao_id, empresa_id, item_id, produto_id, quantidade_estoque, custo_total_brl,
      custo_unitario_brl, residuo_unitario_brl, residuo_total_brl, componentes_brl, memoria)
  SELECT v_id, o.empresa_id, (x ->> 'item_id')::uuid, nullif(x ->> 'produto_id', '')::uuid,
         (x ->> 'quantidade_estoque')::numeric, (x ->> 'custo_total_brl')::numeric, (x ->> 'custo_unitario_brl')::numeric,
         (x ->> 'residuo_unitario_brl')::numeric, (x ->> 'residuo_total_brl')::numeric,
         x -> 'componentes_brl', coalesce(x -> 'memoria', '[]'::jsonb)
    FROM jsonb_array_elements(p_saida -> 'itens') x;

  INSERT INTO public.import_apuracao_rateios (apuracao_id, empresa_id, origem_id, componente, criterio, base_total, item_id,
      base_item, valor_alocado_brl, justificativa)
  SELECT v_id, o.empresa_id, x ->> 'origem_id', x ->> 'componente', x ->> 'criterio', (x ->> 'base_total')::numeric,
         (x ->> 'item_id')::uuid, (x ->> 'base_item')::numeric, (x ->> 'valor_alocado_brl')::numeric, x ->> 'justificativa'
    FROM jsonb_array_elements(coalesce(p_saida -> 'rateios', '[]'::jsonb)) x;

  INSERT INTO public.import_divergencias (apuracao_id, empresa_id, codigo, severidade, referencia, mensagem)
  SELECT v_id, o.empresa_id, x ->> 'codigo', x ->> 'severidade', x ->> 'referencia', x ->> 'mensagem'
    FROM jsonb_array_elements(coalesce(p_saida -> 'divergencias', '[]'::jsonb)) x;

  PERFORM public._import_auditar(o.empresa_id, o.id, 'APURAR', 'apuracao', v_id,
    jsonb_build_object('tipo', p_tipo, 'versao', v_versao, 'status', p_saida ->> 'status',
                       'entrada_sha256', lower(p_entrada_sha256), 'saida_sha256', lower(p_saida_sha256)));
  RETURN v_id;
END
$$;

-- ----------------------------------------------------------------------------
-- 8. Aprovação (service_role, chamada pelo servidor depois de recalcular e conferir)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_aprovar_apuracao(p_apuracao uuid, p_ator uuid, p_motivo text, p_verificacao jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  a public.import_apuracoes;
  o public.import_operacoes;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'IMPORT_APROVACAO_SOMENTE_SERVIDOR' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM public.import_apuracoes WHERE id = p_apuracao;
  IF a.id IS NULL THEN RAISE EXCEPTION 'IMPORT_APURACAO_NAO_ENCONTRADA'; END IF;
  SELECT * INTO o FROM public.import_operacoes WHERE id = a.operacao_id FOR UPDATE;
  IF p_ator IS NULL OR NOT public._fp_import_usuario_pode(p_ator, o.id, ARRAY['DONO']) THEN
    RAISE EXCEPTION 'IMPORT_APROVADOR_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'IMPORT_MOTIVO_OBRIGATORIO'; END IF;
  IF o.status <> 'RASCUNHO' THEN RAISE EXCEPTION 'IMPORT_OPERACAO_NAO_EDITAVEL'; END IF;
  IF a.tipo <> 'APURACAO' THEN RAISE EXCEPTION 'IMPORT_SIMULACAO_NAO_APROVAVEL'; END IF;
  IF a.versao_dados <> o.versao_dados THEN RAISE EXCEPTION 'IMPORT_DADOS_ALTERADOS_APOS_APURACAO'; END IF;
  IF a.status_calculo <> 'OK' OR NOT a.conservacao_ok
     OR EXISTS (SELECT 1 FROM public.import_divergencias d WHERE d.apuracao_id = a.id AND d.severidade = 'BLOQUEANTE') THEN
    RAISE EXCEPTION 'IMPORT_APURACAO_BLOQUEADA';
  END IF;
  IF coalesce((p_verificacao ->> 'recalculo_confere')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'IMPORT_RECALCULO_NAO_CONFERIDO';
  END IF;

  INSERT INTO public.import_aprovacoes (operacao_id, apuracao_id, empresa_id, decisao, por, motivo, verificacao)
  VALUES (o.id, a.id, o.empresa_id, 'APROVADA', p_ator, btrim(p_motivo), coalesce(p_verificacao, '{}'::jsonb));
  UPDATE public.import_operacoes SET status = 'APROVADA', apuracao_aprovada_id = a.id, atualizado_em = now() WHERE id = o.id;
  INSERT INTO public.import_auditoria (empresa_id, operacao_id, acao, entidade, entidade_id, por, detalhe)
  VALUES (o.empresa_id, o.id, 'APROVAR', 'apuracao', a.id, p_ator, coalesce(p_verificacao, '{}'::jsonb));
END
$$;

-- Reabrir (DONO) e cancelar (DONO/GERENTE): estados registrados; nada é apagado.
CREATE OR REPLACE FUNCTION public.import_mudar_estado(p_operacao uuid, p_acao text, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
  v_papeis text[] := CASE p_acao WHEN 'REABRIR' THEN ARRAY['DONO'] ELSE ARRAY['DONO', 'GERENTE'] END;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM public.import_operacoes WHERE id = p_operacao FOR UPDATE;
  IF o.id IS NULL OR NOT public.fp_import_pode_operacao(p_operacao, v_papeis) THEN
    RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'IMPORT_MOTIVO_OBRIGATORIO'; END IF;
  IF p_acao = 'REABRIR' AND o.status = 'APROVADA' THEN
    UPDATE public.import_operacoes SET status = 'RASCUNHO', apuracao_aprovada_id = NULL,
           versao_dados = versao_dados + 1, atualizado_em = now() WHERE id = o.id;
    INSERT INTO public.import_aprovacoes (operacao_id, apuracao_id, empresa_id, decisao, por, motivo)
    VALUES (o.id, o.apuracao_aprovada_id, o.empresa_id, 'REABERTA', auth.uid(), btrim(p_motivo));
  ELSIF p_acao = 'CANCELAR' AND o.status = 'RASCUNHO' THEN
    UPDATE public.import_operacoes SET status = 'CANCELADA', atualizado_em = now() WHERE id = o.id;
    INSERT INTO public.import_aprovacoes (operacao_id, empresa_id, decisao, por, motivo)
    VALUES (o.id, o.empresa_id, 'CANCELADA', auth.uid(), btrim(p_motivo));
  ELSE
    RAISE EXCEPTION 'IMPORT_TRANSICAO_INVALIDA';
  END IF;
  PERFORM public._import_auditar(o.empresa_id, o.id, p_acao, 'operacao', o.id, jsonb_build_object('motivo', btrim(p_motivo)));
END
$$;

-- Grants das RPCs
REVOKE ALL ON FUNCTION
  public.import_criar_operacao(uuid, text, text), public.import_salvar_item(uuid, jsonb),
  public.import_salvar_lancamento(uuid, text, jsonb), public.import_remover_rascunho(uuid, text, uuid),
  public.import_registrar_documento(uuid, text, text, date, text, text, bigint, text, uuid),
  public.import_montar_entrada(uuid), public.import_registrar_apuracao(uuid, text, integer, text, jsonb, text),
  public.import_mudar_estado(uuid, text, text), public.import_aprovar_apuracao(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.import_criar_operacao(uuid, text, text), public.import_salvar_item(uuid, jsonb),
  public.import_salvar_lancamento(uuid, text, jsonb), public.import_remover_rascunho(uuid, text, uuid),
  public.import_registrar_documento(uuid, text, text, date, text, text, bigint, text, uuid),
  public.import_montar_entrada(uuid), public.import_registrar_apuracao(uuid, text, integer, text, jsonb, text),
  public.import_mudar_estado(uuid, text, text)
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.import_aprovar_apuracao(uuid, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.import_aprovar_apuracao(uuid, uuid, text, jsonb) TO service_role;

-- ----------------------------------------------------------------------------
-- 9. Storage privado (D8): bucket por caminho <empresa>/<operacao>/...; sem update/delete.
-- ----------------------------------------------------------------------------
-- Avalia o caminho só quando o bucket é o do módulo e os segmentos são UUIDs (sem cast inseguro:
-- a ordem do AND em policy não é garantida e objetos de outros buckets não podem gerar erro).
CREATE OR REPLACE FUNCTION public.fp_import_pode_objeto(p_bucket text, p_nome text, p_papeis text[] DEFAULT ARRAY['DONO', 'GERENTE'])
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp text := split_part(coalesce(p_nome, ''), '/', 1);
  v_op  text := split_part(coalesce(p_nome, ''), '/', 2);
  re    text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF auth.uid() IS NULL OR p_bucket IS DISTINCT FROM 'import-documentos' OR v_emp !~ re OR v_op !~ re THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.import_operacoes o WHERE o.id = v_op::uuid AND o.empresa_id = v_emp::uuid)
     AND public.fp_import_pode_operacao(v_op::uuid, p_papeis);
END
$$;

REVOKE ALL ON FUNCTION public.fp_import_pode_objeto(text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_import_pode_objeto(text, text, text[]) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('import-documentos', 'import-documentos', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS import_documentos_leitura ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS import_documentos_envio ON storage.objects';
    EXECUTE $p$CREATE POLICY import_documentos_leitura ON storage.objects FOR SELECT TO authenticated
      USING (public.fp_import_pode_objeto(bucket_id, name))$p$;
    EXECUTE $p$CREATE POLICY import_documentos_envio ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (public.fp_import_pode_objeto(bucket_id, name))$p$;
    -- sem policy de UPDATE/DELETE: arquivo é imutável e não pode ser apagado por usuários
  END IF;
END $$;

COMMIT;
