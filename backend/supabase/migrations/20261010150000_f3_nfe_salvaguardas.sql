-- ============================================================================
-- F3 — Salvaguardas de NF-e (D5, D7). Nada é ativado para o cliente existente.
--
-- D7 — recebimento físico duplicado OC × NF-e.
--   Lacuna A-05: uma NF-e SEM vínculo com OC pode creditar de novo unidades que a OC
--   já deu entrada. Quando a NF-e está vinculada à OC ou a uma remessa, o fluxo atual
--   já não duplica (abate a OC ou não credita).
--   Regra: com o rollout ROLLOUT_NFE_TRAVA_RECEBIMENTO ativo PARA A EMPRESA, concluir uma
--   NF-e sem OC e sem remessa que tenha possível correspondência com recebimento anterior
--   (mesma loja, fornecedor e produto, últimos 180 dias, origem ≠ NF-e) exige vínculo ou
--   conferência registrada com justificativa.
--   A OC não passa a ser obrigatória. Os comandos canônicos de estoque não mudam.
--   Rollout por empresa, auditado (empresa_modulos). Nenhuma flag global.
--
-- D5 — relatório de vínculos fornecedor/produto (somente leitura, service_role) para
--   inventariar referências possivelmente normalizadas pelo parser anterior e colisões
--   antes de qualquer correção. Não altera vínculos.
--
-- Rollback: backend/supabase/rollback/20261010150000_f3_nfe_salvaguardas.rollback.sql
-- ============================================================================
BEGIN;

-- 1. Rollout por empresa (não é módulo comercial; usa o mesmo registro auditado)
INSERT INTO public.modulos_catalogo (codigo, descricao)
VALUES ('ROLLOUT_NFE_TRAVA_RECEBIMENTO',
        'Rollout técnico por empresa: exige vínculo ou conferência antes de concluir NF-e sem OC com possível recebimento anterior (D7). Não é módulo comercial.')
ON CONFLICT (codigo) DO NOTHING;

-- 2. Conferência registrada
ALTER TABLE public.importacoes_nfe
  ADD COLUMN IF NOT EXISTS conferencia_recebimento_anterior jsonb;

COMMENT ON COLUMN public.importacoes_nfe.conferencia_recebimento_anterior IS
  'F3/D7. Decisão humana registrada: {por, em, justificativa, suspeitos[]}. Preenchida por nfe_registrar_conferencia_recebimento_anterior.';

-- 3. Suspeitos (núcleo sem checagem de identidade: só para uso interno)
CREATE OR REPLACE FUNCTION public._nfe_recebimentos_suspeitos(p_importacao uuid)
RETURNS TABLE (recebimento_id uuid, ordem_id uuid, produto_id uuid, quantidade numeric, recebido_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.ordem_id, r.produto_id, r.quantidade, r.created_at
    FROM public.importacoes_nfe i
    JOIN public.ordens_compra oc ON oc.loja_id = i.loja_id AND oc.fornecedor_id = i.fornecedor_id
    JOIN public.ordens_compra_recebimentos r ON r.ordem_id = oc.id AND r.loja_id = i.loja_id
   WHERE i.id = p_importacao
     AND r.origem <> 'NFE'
     AND r.importacao_nfe_id IS NULL
     AND r.quantidade > 0
     AND r.created_at >= now() - interval '180 days'
     AND r.produto_id IN (SELECT it.produto_id FROM public.importacoes_nfe_itens it WHERE it.importacao_nfe_id = i.id)
     -- a OC ainda não teve documento fiscal vinculado
     AND NOT EXISTS (SELECT 1 FROM public.importacoes_nfe o
                      WHERE o.ordem_compra_id = oc.id AND o.id <> i.id AND o.status = 'CONCLUIDA')
     AND NOT EXISTS (SELECT 1 FROM public.entrada_documentos d WHERE d.remessa_id = r.remessa_id AND r.remessa_id IS NOT NULL)
$$;

REVOKE ALL ON FUNCTION public._nfe_recebimentos_suspeitos(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Consulta para a tela de conferência: identidade, papel gerencial e cerca da empresa.
CREATE OR REPLACE FUNCTION public.nfe_recebimentos_anteriores_suspeitos(p_importacao uuid)
RETURNS TABLE (recebimento_id uuid, ordem_id uuid, produto_id uuid, quantidade numeric, recebido_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_loja uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH' USING ERRCODE = '42501';
  END IF;
  SELECT loja_id INTO v_loja FROM public.importacoes_nfe WHERE id = p_importacao;
  IF v_loja IS NULL OR NOT public.auth_usuario_gerencial_loja(v_loja) THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public._nfe_recebimentos_suspeitos(p_importacao);
END
$$;

REVOKE ALL ON FUNCTION public.nfe_recebimentos_anteriores_suspeitos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nfe_recebimentos_anteriores_suspeitos(uuid) TO authenticated, service_role;

-- 4. Registro da conferência humana (não altera estoque nem obrigação)
CREATE OR REPLACE FUNCTION public.nfe_registrar_conferencia_recebimento_anterior(p_importacao uuid, p_justificativa text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_imp record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH' USING ERRCODE = '42501';
  END IF;
  SELECT id, loja_id, status INTO v_imp FROM public.importacoes_nfe WHERE id = p_importacao FOR UPDATE;
  IF v_imp.id IS NULL OR NOT public.auth_usuario_gerencial_loja(v_imp.loja_id) THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA' USING ERRCODE = '42501';
  END IF;
  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;
  IF length(btrim(coalesce(p_justificativa, ''))) < 10 THEN
    RAISE EXCEPTION 'NFE_CONFERENCIA_JUSTIFICATIVA_OBRIGATORIA';
  END IF;
  UPDATE public.importacoes_nfe
     SET conferencia_recebimento_anterior = jsonb_build_object(
           'por', auth.uid(), 'em', now(), 'justificativa', btrim(p_justificativa),
           'suspeitos', coalesce((SELECT jsonb_agg(s.recebimento_id) FROM public._nfe_recebimentos_suspeitos(p_importacao) s), '[]'::jsonb))
   WHERE id = p_importacao;
END
$$;

REVOKE ALL ON FUNCTION public.nfe_registrar_conferencia_recebimento_anterior(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nfe_registrar_conferencia_recebimento_anterior(uuid, text) TO authenticated, service_role;

-- 5. Trava na transição para CONCLUIDA (vale para qualquer caminho; mesma transação ⇒ atômica)
CREATE OR REPLACE FUNCTION public.trg_nfe_trava_recebimento_duplicado()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_empresa uuid;
  v_n int;
BEGIN
  IF NEW.status <> 'CONCLUIDA' OR (TG_OP = 'UPDATE' AND OLD.status = 'CONCLUIDA') THEN
    RETURN NEW;
  END IF;
  SELECT empresa_id INTO v_empresa FROM public.lojas WHERE id = NEW.loja_id;
  IF v_empresa IS NULL OR NOT public.fp_modulo_ativo(v_empresa, 'ROLLOUT_NFE_TRAVA_RECEBIMENTO') THEN
    RETURN NEW;   -- rollout desligado: comportamento atual, inalterado
  END IF;
  IF NEW.ordem_compra_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.entrada_documentos d WHERE d.importacao_id = NEW.id) THEN
    RETURN NEW;   -- vínculo explícito: o fluxo canônico já não duplica
  END IF;
  IF NEW.conferencia_recebimento_anterior IS NOT NULL THEN
    RETURN NEW;   -- conferência humana registrada
  END IF;
  SELECT count(*) INTO v_n FROM public._nfe_recebimentos_suspeitos(NEW.id);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'NFE_POSSIVEL_RECEBIMENTO_DUPLICADO'
      USING DETAIL = format('%s recebimento(s) de OC sem documento para os mesmos produtos e fornecedor. Vincule a OC ou registre a conferência.', v_n);
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.trg_nfe_trava_recebimento_duplicado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS nfe_trava_recebimento_duplicado ON public.importacoes_nfe;
CREATE TRIGGER nfe_trava_recebimento_duplicado
  BEFORE INSERT OR UPDATE OF status ON public.importacoes_nfe
  FOR EACH ROW EXECUTE FUNCTION public.trg_nfe_trava_recebimento_duplicado();

-- 6. D5 — relatório de vínculos (somente leitura, service_role)
CREATE OR REPLACE FUNCTION public.ops_relatorio_vinculos_d5()
RETURNS TABLE (classe text, loja_id uuid, fornecedor_id uuid, ref_fornecedor text, produto_id uuid, detalhe text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  -- (a) referência só com dígitos: pode ter perdido zeros à esquerda no parser anterior
  SELECT 'POSSIVELMENTE_NORMALIZADA'::text, v.loja_id, v.fornecedor_id, v.ref_fornecedor, v.produto_id,
         'cProd numérico gravado pelo parser numérico; o código original pode ter zeros à esquerda'::text
    FROM public.vinculos_fornecedor_produto v
   WHERE v.ref_fornecedor ~ '^[0-9]+$' AND v.ref_fornecedor !~ '^0'
  UNION ALL
  -- (b) códigos que diferem só por zeros à esquerda e apontam para produtos DIFERENTES
  SELECT 'COLISAO_PRODUTOS_DIFERENTES', v.loja_id, v.fornecedor_id, v.ref_fornecedor, v.produto_id,
         'mesma loja/fornecedor, mesmo código sem zeros (' || ltrim(v.ref_fornecedor, '0') || '), produtos distintos'
    FROM public.vinculos_fornecedor_produto v
   WHERE EXISTS (SELECT 1 FROM public.vinculos_fornecedor_produto w
                  WHERE w.loja_id = v.loja_id AND w.fornecedor_id = v.fornecedor_id
                    AND w.ref_fornecedor <> v.ref_fornecedor
                    AND ltrim(w.ref_fornecedor, '0') = ltrim(v.ref_fornecedor, '0')
                    AND w.produto_id <> v.produto_id)
  UNION ALL
  -- (c) mesmo produto ligado por códigos equivalentes (duplicação inofensiva, a consolidar com conferência)
  SELECT 'EQUIVALENTE_MESMO_PRODUTO', v.loja_id, v.fornecedor_id, v.ref_fornecedor, v.produto_id,
         'há outro código do mesmo fornecedor, igual sem zeros, para o mesmo produto'
    FROM public.vinculos_fornecedor_produto v
   WHERE EXISTS (SELECT 1 FROM public.vinculos_fornecedor_produto w
                  WHERE w.loja_id = v.loja_id AND w.fornecedor_id = v.fornecedor_id
                    AND w.ref_fornecedor <> v.ref_fornecedor
                    AND ltrim(w.ref_fornecedor, '0') = ltrim(v.ref_fornecedor, '0')
                    AND w.produto_id = v.produto_id)
  UNION ALL
  -- (d) vínculo para produto inexistente ou inativo
  SELECT 'PRODUTO_INATIVO_OU_AUSENTE', v.loja_id, v.fornecedor_id, v.ref_fornecedor, v.produto_id,
         coalesce('produto inativo: ' || p.nome, 'produto inexistente')
    FROM public.vinculos_fornecedor_produto v
    LEFT JOIN public.produtos p ON p.id = v.produto_id
   WHERE p.id IS NULL OR NOT p.ativo
  UNION ALL
  -- (e) código de barras com comprimento atípico (7 ou 11 dígitos): GTIN-8/UPC-12 sem o zero inicial.
  -- 13 dígitos não entra: GTIN-14 sem zero é um EAN-13 válido e indistinguível (o preview casa os dois).
  SELECT 'GTIN_POSSIVELMENTE_NORMALIZADO', p.loja_id, NULL::uuid, p.codigo_barras, p.id,
         'codigo_barras com ' || length(p.codigo_barras) || ' dígitos: pode ser GTIN-' || (length(p.codigo_barras) + 1) || ' sem zero inicial'
    FROM public.produtos p
   WHERE p.codigo_barras ~ '^[0-9]+$' AND length(p.codigo_barras) IN (7, 11)
  UNION ALL
  -- (f) código numérico longo: o parser numérico pode ter arredondado dígitos ou gravado em notação científica
  SELECT 'REFERENCIA_CORROMPIDA_PROVAVEL', v.loja_id, v.fornecedor_id, v.ref_fornecedor, v.produto_id,
         'código numérico com 16+ dígitos ou em notação científica: precisão de float excedida no parser anterior'
    FROM public.vinculos_fornecedor_produto v
   WHERE v.ref_fornecedor ~* '^[0-9.]+e[+-]?[0-9]+$' OR v.ref_fornecedor ~ '^[0-9]{16,}$'
$$;

REVOKE ALL ON FUNCTION public.ops_relatorio_vinculos_d5() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_relatorio_vinculos_d5() TO service_role;

COMMIT;
