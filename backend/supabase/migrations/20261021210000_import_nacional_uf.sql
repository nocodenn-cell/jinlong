-- ============================================================================
-- Importação NACIONAL (F1+F2 do plano-modulo-importacao-nacional.md) — SOMENTE ADITIVA.
--
--  * tributos_catalogo_uf: ICMS modal + FCP geral das 27 UFs, versionado por vigência, com fonte
--    e status (PESQUISADO | VERIFICADO). Mudança de alíquota = fechar vigência + nova linha.
--    Leitura para autenticados; escrita apenas service_role (manutenção pela Nature Code).
--  * empresa_parametros_importacao: UF do importador (define o ICMS — LC 87/96 art. 11 I "d"),
--    porto/modal padrão (só custos; AFRMM apenas marítimo), % efetivo de ICMS (incentivo
--    informado pelo cliente) e aceite do aviso "estimativa".
--  * empresa_tributos_override: alíquotas informadas pelo cliente/despachante (II/IPI por NCM etc.).
--  * Escrita só por RPC; tenant derivado do usuário (fp_empresa_contexto_modulo), nunca do navegador.
--  * Nada existente é alterado. O motor continua com fallback para o catálogo embarcado.
-- Rollback: backend/supabase/rollback/20261021210000_import_nacional_uf.rollback.sql
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.tributos_catalogo_uf (
  id               text        PRIMARY KEY,
  uf               char(2)     NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
  icms_modal_pct   numeric(7,4) NOT NULL CHECK (icms_modal_pct >= 0 AND icms_modal_pct < 100),
  fcp_geral_pct    numeric(7,4) NOT NULL DEFAULT 0 CHECK (fcp_geral_pct >= 0 AND fcp_geral_pct < 10),
  vigencia_inicio  date        NOT NULL,
  vigencia_fim     date,
  status           text        NOT NULL CHECK (status IN ('PESQUISADO', 'VERIFICADO')),
  base_legal       text        NOT NULL,
  nota             text,
  consultado_em    date        NOT NULL,
  versao_catalogo  text        NOT NULL,
  fonte_urls       text[]      NOT NULL DEFAULT ARRAY[
                     'https://ajudanota.com.br/tabela-icms',
                     'https://www.masteryb2b.tech/tabela-icms',
                     'https://www.ncmbrasil.com.br/icms',
                     'https://www.brasilnfe.com.br/aliquotas-icms/']::text[],
  criado_em        timestamptz NOT NULL DEFAULT now(),
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);
CREATE INDEX IF NOT EXISTS tributos_catalogo_uf_uf_idx ON public.tributos_catalogo_uf (uf, vigencia_inicio DESC);

INSERT INTO public.tributos_catalogo_uf
  (id, uf, icms_modal_pct, fcp_geral_pct, vigencia_inicio, vigencia_fim, status, base_legal, nota, consultado_em, versao_catalogo)
VALUES
  ('pesq-icms-ac-modal', 'AC', 19.0000, 0.0000, DATE '2023-04-01', NULL, 'PESQUISADO', 'LC AC 55/1997 art. 18 I (LC 422/2022)', 'Sem FCP', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-al-modal', 'AL', 20.5000, 0.0000, DATE '2026-04-01', NULL, 'PESQUISADO', 'Lei AL 5900/1996 art. 17 I "b" (Lei 9776/2025)', 'Era 19% até 31/03/2026; FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-ap-modal', 'AP', 18.0000, 0.0000, DATE '2016-02-01', NULL, 'PESQUISADO', 'Lei AP 400/1997 art. 37 III "i" (Lei 1949/2015)', 'Sem FCP', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-am-modal', 'AM', 20.0000, 0.0000, DATE '2023-04-01', NULL, 'PESQUISADO', 'LC AM 19/1997 art. 12 I "b" (LC 244/2023)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-ba-modal', 'BA', 20.5000, 0.0000, DATE '2024-02-07', NULL, 'PESQUISADO', 'Lei BA 7014/1996 art. 15 I "a" (Lei 14629/2023)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-ce-modal', 'CE', 20.0000, 0.0000, DATE '2024-01-01', NULL, 'PESQUISADO', 'Lei CE 18665/2023 art. 65 I "g"', 'FECOP 2% só para lista; FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-df-modal', 'DF', 20.0000, 0.0000, DATE '2024-01-01', NULL, 'PESQUISADO', 'Lei DF 1254/1996 art. 18 II "c" (Lei 7326/2023)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-es-modal', 'ES', 17.0000, 0.0000, DATE '2016-01-01', NULL, 'PESQUISADO', 'Lei ES 7000/2001 art. 20 I "a" (aumento revogado pela Lei 12020/2023)', 'Compete/Fundap: informe o % efetivo; FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-go-modal', 'GO', 19.0000, 0.0000, DATE '2024-04-01', NULL, 'PESQUISADO', 'Lei GO 11651/1991 art. 27 I (Lei 22460/2023)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-ma-modal', 'MA', 23.0000, 0.0000, DATE '2025-02-23', NULL, 'PESQUISADO', 'Lei MA 7799/2002 art. 23 III (Lei 12426/2024)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-mt-modal', 'MT', 17.0000, 0.0000, DATE '2016-01-01', NULL, 'PESQUISADO', 'Lei MT 7098/1998 art. 14 I "a"', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-ms-modal', 'MS', 17.0000, 0.0000, DATE '2016-01-01', NULL, 'PESQUISADO', 'Lei MS 1810/1997 art. 41 III "a"', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-mg-modal', 'MG', 18.0000, 0.0000, DATE '2016-01-01', NULL, 'PESQUISADO', 'Lei MG 6763/1975 / RICMS-MG (alíquota geral)', 'Corredor de Importação: informe o % efetivo; FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-pa-modal', 'PA', 19.0000, 0.0000, DATE '2024-03-16', NULL, 'PESQUISADO', 'Lei PA 5530/1989 (alíquota geral) — data de vigência diverge entre fontes', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-pb-modal', 'PB', 20.0000, 0.0000, DATE '2024-01-01', NULL, 'PESQUISADO', 'Lei PB 6379/1996 (alíquota geral) — data de vigência diverge entre fontes', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-pr-modal', 'PR', 19.5000, 0.0000, DATE '2024-03-18', NULL, 'PESQUISADO', 'Lei PR 11580/1996 art. 14 VIII (Lei 21850/2023)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-pe-modal', 'PE', 20.5000, 0.0000, DATE '2024-01-01', NULL, 'PESQUISADO', 'Lei PE 15730/2016 art. 15 VII (Lei 18305/2023)', 'FECEP 2% só para mercadorias do Anexo 1 (bebidas, fumo, joias etc.) — não para mercadoria comum; PRODEPE: informe o % efetivo', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-pi-modal', 'PI', 22.5000, 0.0000, DATE '2025-04-01', NULL, 'PESQUISADO', 'Lei PI 4257/1989 art. 23 I "c" (Lei 8558/2024)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-rj-modal', 'RJ', 20.0000, 2.0000, DATE '2024-03-20', NULL, 'PESQUISADO', 'Lei RJ 2657/1996 art. 14 I (Lei 10253/2023); FECP Lei 4056/2002', 'FECP 2% na regra geral (carga 22%)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-rn-modal', 'RN', 20.0000, 0.0000, DATE '2025-03-20', NULL, 'PESQUISADO', 'Lei RN 6968/1996 art. 27 I "a" (Lei 11999/2024)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-rs-modal', 'RS', 17.0000, 0.0000, DATE '2022-01-01', NULL, 'PESQUISADO', 'RICMS-RS Livro I art. 27 X (Lei 15576/2020)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-ro-modal', 'RO', 19.5000, 0.0000, DATE '2024-01-12', NULL, 'PESQUISADO', 'Lei RO 688/1996 (alíquota geral)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-rr-modal', 'RR', 20.0000, 0.0000, DATE '2023-03-30', NULL, 'PESQUISADO', 'Lei RR 059/1993 art. 32 I "d" (Lei 1767/2022)', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-sc-modal', 'SC', 17.0000, 0.0000, DATE '2016-01-01', NULL, 'PESQUISADO', 'Lei SC 10297/1996 art. 19 I', 'Revenda interna a contribuinte pode ser 12% (art. 19 III "n"); TTD: informe o % efetivo', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-sp-modal', 'SP', 18.0000, 0.0000, DATE '2016-01-01', NULL, 'PESQUISADO', 'RICMS-SP art. 52 I; Lei SP 6374/1989 art. 34', 'Sem FCP geral', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-se-modal', 'SE', 19.0000, 1.0000, DATE '2024-01-01', NULL, 'PESQUISADO', 'Lei SE 3796/1996 (Lei 9176/2023); FECOEP Lei 4731/2002 art. 2º-A', 'FECOEP 1% na regra geral (carga 20%)', DATE '2026-10-21', 'nacional-2026-10-21'),
  ('pesq-icms-to-modal', 'TO', 20.0000, 0.0000, DATE '2016-01-01', NULL, 'PESQUISADO', 'Lei TO 1287/2001 (alíquota geral) — conferir na SEFAZ-TO', 'FCP só para lista de produtos da UF (informe por NCM se aplicável)', DATE '2026-10-21', 'nacional-2026-10-21')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.empresa_parametros_importacao (
  empresa_id             uuid        PRIMARY KEY REFERENCES public.empresas (id),
  uf_importador          char(2)     NOT NULL CHECK (uf_importador ~ '^[A-Z]{2}$'),
  porto_padrao           text        CHECK (porto_padrao IS NULL OR length(btrim(porto_padrao)) BETWEEN 1 AND 80),
  modal_padrao           text        CHECK (modal_padrao IS NULL OR modal_padrao IN ('MARITIMO', 'AEREO', 'RODOVIARIO')),
  icms_efetivo_pct       numeric(7,4) CHECK (icms_efetivo_pct IS NULL OR (icms_efetivo_pct >= 0 AND icms_efetivo_pct < 100)),
  regime_incentivo_nome  text        CHECK (regime_incentivo_nome IS NULL OR length(regime_incentivo_nome) <= 120),
  aviso_aceito_em        timestamptz,
  atualizado_por         uuid,
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.empresa_tributos_override (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid        NOT NULL REFERENCES public.empresas (id),
  tributo        text        NOT NULL CHECK (tributo IN ('II', 'IPI', 'PIS_IMPORTACAO', 'COFINS_IMPORTACAO', 'ICMS', 'CBS', 'IBS')),
  ncm_prefixo    text        NOT NULL DEFAULT '' CHECK (ncm_prefixo ~ '^[0-9]{0,8}$'),
  aliquota_pct   numeric(7,4) NOT NULL CHECK (aliquota_pct >= 0 AND aliquota_pct < 100),
  nota           text        CHECK (nota IS NULL OR length(nota) <= 200),
  atualizado_por uuid,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tributo, ncm_prefixo)
);

ALTER TABLE public.tributos_catalogo_uf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_parametros_importacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_tributos_override ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tributos_catalogo_uf, public.empresa_parametros_importacao, public.empresa_tributos_override FROM PUBLIC, anon;
GRANT SELECT ON public.tributos_catalogo_uf, public.empresa_parametros_importacao, public.empresa_tributos_override TO authenticated;
GRANT ALL ON public.tributos_catalogo_uf, public.empresa_parametros_importacao, public.empresa_tributos_override TO service_role;

DROP POLICY IF EXISTS tributos_catalogo_uf_leitura ON public.tributos_catalogo_uf;
CREATE POLICY tributos_catalogo_uf_leitura ON public.tributos_catalogo_uf FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS empresa_param_import_leitura ON public.empresa_parametros_importacao;
CREATE POLICY empresa_param_import_leitura ON public.empresa_parametros_importacao FOR SELECT TO authenticated
  USING (public.fp_pode_modulo(empresa_id, 'IMPORT_INTELLIGENCE', ARRAY['DONO', 'GERENTE']));
DROP POLICY IF EXISTS empresa_trib_override_leitura ON public.empresa_tributos_override;
CREATE POLICY empresa_trib_override_leitura ON public.empresa_tributos_override FOR SELECT TO authenticated
  USING (public.fp_pode_modulo(empresa_id, 'IMPORT_INTELLIGENCE', ARRAY['DONO', 'GERENTE']));

-- Empresa do contexto (DONO/GERENTE com módulo ativo); sem contexto único ⇒ erro.
CREATE OR REPLACE FUNCTION public._import_empresa_contexto()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501'; END IF;
  v := public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE', ARRAY['DONO', 'GERENTE']);
  IF v IS NULL THEN RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501'; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public._import_empresa_contexto() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_salvar_parametros_empresa(p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_emp uuid := public._import_empresa_contexto();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tributos_catalogo_uf WHERE uf = upper(p_dados->>'uf_importador')) THEN
    RAISE EXCEPTION 'IMPORT_VALOR_INVALIDO' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.empresa_parametros_importacao AS e
    (empresa_id, uf_importador, porto_padrao, modal_padrao, icms_efetivo_pct, regime_incentivo_nome, aviso_aceito_em, atualizado_por, atualizado_em)
  VALUES (v_emp, upper(p_dados->>'uf_importador'), nullif(btrim(coalesce(p_dados->>'porto_padrao', '')), ''),
          nullif(p_dados->>'modal_padrao', ''), nullif(p_dados->>'icms_efetivo_pct', '')::numeric,
          nullif(btrim(coalesce(p_dados->>'regime_incentivo_nome', '')), ''),
          CASE WHEN (p_dados->>'aviso_aceito')::boolean THEN now() END, auth.uid(), now())
  ON CONFLICT (empresa_id) DO UPDATE SET
    uf_importador = EXCLUDED.uf_importador, porto_padrao = EXCLUDED.porto_padrao, modal_padrao = EXCLUDED.modal_padrao,
    icms_efetivo_pct = EXCLUDED.icms_efetivo_pct, regime_incentivo_nome = EXCLUDED.regime_incentivo_nome,
    aviso_aceito_em = coalesce(e.aviso_aceito_em, EXCLUDED.aviso_aceito_em),
    atualizado_por = auth.uid(), atualizado_em = now();
END $$;

CREATE OR REPLACE FUNCTION public.import_salvar_override_tributo(p_dados jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_emp uuid := public._import_empresa_contexto(); v_id uuid;
BEGIN
  INSERT INTO public.empresa_tributos_override AS o (empresa_id, tributo, ncm_prefixo, aliquota_pct, nota, atualizado_por)
  VALUES (v_emp, p_dados->>'tributo', regexp_replace(coalesce(p_dados->>'ncm_prefixo', ''), '[^0-9]', '', 'g'),
          (p_dados->>'aliquota_pct')::numeric, nullif(btrim(coalesce(p_dados->>'nota', '')), ''), auth.uid())
  ON CONFLICT (empresa_id, tributo, ncm_prefixo) DO UPDATE SET
    aliquota_pct = EXCLUDED.aliquota_pct, nota = EXCLUDED.nota, atualizado_por = auth.uid(), atualizado_em = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Remove uma alíquota informada pelo próprio cliente (configuração dele; não afeta lançamentos já registrados).
CREATE OR REPLACE FUNCTION public.import_remover_override_tributo(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_emp uuid := public._import_empresa_contexto();
BEGIN
  DELETE FROM public.empresa_tributos_override WHERE id = p_id AND empresa_id = v_emp;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.import_salvar_parametros_empresa(jsonb), public.import_salvar_override_tributo(jsonb),
  public.import_remover_override_tributo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_salvar_parametros_empresa(jsonb), public.import_salvar_override_tributo(jsonb),
  public.import_remover_override_tributo(uuid) TO authenticated, service_role;

COMMIT;
