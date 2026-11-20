-- CRM-001 · revisão (2026-11-20): correções dos achados da revisão automática do PR #688.
-- Migration aditiva sobre 20261120120000_commercial_crm (que já está no homolog). NÃO aplicada em produção.
--   1. Auditoria: nome de membro da equipe também é dado pessoal (LGPD).
--   2. Histórico: created_at de inserções de contato/nota limitado à janela do servidor (±1 min).
--   3. Catálogo de planos para vendedores (commercial_planos segue só para gestor).
--   4. Criação manual: vendedor só checa duplicado entre leads que ele enxerga (não revela leads alheios).
--   5. Conversão: checagem de cliente duplicado serializada e também por contato textual (e-mail).
--   6. Proposta: mesma ordem de travamento da conversão (lead → proposta).
--   7. Equipe: troca de gestores serializada (sem zerar a gestão por corrida).
BEGIN;

-- 1. ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.commercial_auditar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_pessoais text[] := ARRAY['name', 'store', 'contact', 'email', 'phone', 'wechat', 'city', 'observacoes', 'notes',
                             'store_name', 'resultado', 'condicoes', 'motivo', 'motivo_perda', 'request_hash', 'body', 'nome'];
  v_ign text[] := ARRAY['updated_at', 'created_at'];
  v_campos text[];
  k text;
  v_antes jsonb := '{}'::jsonb;
  v_depois jsonb := '{}'::jsonb;
BEGIN
  SELECT coalesce(array_agg(key ORDER BY key), '{}') INTO v_campos
    FROM (SELECT key FROM jsonb_object_keys(v_old || v_new) key) x
   WHERE NOT key = ANY (v_ign) AND (v_old -> key) IS DISTINCT FROM (v_new -> key);
  IF TG_OP = 'UPDATE' AND cardinality(v_campos) = 0 THEN RETURN NULL; END IF;
  FOREACH k IN ARRAY v_campos LOOP
    IF k = ANY (v_pessoais) THEN CONTINUE; END IF;
    IF v_old ? k THEN v_antes := v_antes || jsonb_build_object(k, v_old -> k); END IF;
    IF v_new ? k THEN v_depois := v_depois || jsonb_build_object(k, v_new -> k); END IF;
  END LOOP;
  INSERT INTO public.commercial_audit (tabela, registro, acao, ator, campos, antes, depois)
  VALUES (TG_TABLE_NAME, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'user_id', v_old ->> 'user_id', v_new ->> 'codigo', v_old ->> 'codigo'),
          TG_OP, auth.uid(), v_campos,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE v_antes END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_depois END);
  RETURN NULL;
END $$;

-- 2. ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS commercial_lead_events_insert ON public.commercial_lead_events;
CREATE POLICY commercial_lead_events_insert ON public.commercial_lead_events
  FOR INSERT TO authenticated
  WITH CHECK (kind IN ('nota', 'contato') AND author = auth.uid() AND public.commercial_lead_visivel(lead_id)
              AND created_at BETWEEN now() - interval '1 minute' AND now() + interval '1 minute');

-- 3. ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commercial_catalogo_planos()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, saas, pg_temp AS $$
BEGIN
  PERFORM internal.commercial_exigir_membro();
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'nome', nome, 'tipo', tipo,
            'preco_loja_centavos', preco_loja_centavos, 'preco_placeholder', preco_placeholder) ORDER BY ordem), '[]'::jsonb)
          FROM saas.planos WHERE ativo);
END $$;
REVOKE ALL ON FUNCTION public.commercial_catalogo_planos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_catalogo_planos() TO authenticated;

-- 4. ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commercial_lead_criar(
  p_product text, p_name text, p_store text, p_contact text, p_channel text, p_origem text,
  p_email text DEFAULT NULL, p_city text DEFAULT NULL, p_uf text DEFAULT NULL, p_observacoes text DEFAULT NULL,
  p_forcar boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE v_id uuid; v_dig text := internal.commercial_digitos(p_contact); v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_proto text;
BEGIN
  PERFORM internal.commercial_exigir_membro();
  IF p_origem NOT IN ('indicacao', 'prospeccao', 'evento', 'whatsapp', 'outro') THEN RAISE EXCEPTION 'COMMERCIAL_ORIGEM_INVALIDA'; END IF;
  IF p_product NOT IN ('jinlong', 'venddi') THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO'; END IF;
  -- duplicado só entre leads que quem chama enxerga: vendedor não descobre lead de outro membro
  IF NOT coalesce(p_forcar, false) AND EXISTS (
       SELECT 1 FROM public.commercial_leads l
        WHERE public.commercial_pode_ver(l.owner_id)
          AND ((v_dig IS NOT NULL AND char_length(v_dig) >= 8 AND internal.commercial_digitos(l.contact) = v_dig)
           OR (v_email IS NOT NULL AND lower(l.email) = v_email)
           OR (lower(l.contact) = lower(btrim(p_contact))))) THEN
    RAISE EXCEPTION 'COMMERCIAL_LEAD_DUPLICADO';
  END IF;
  LOOP
    v_proto := CASE p_product WHEN 'venddi' THEN 'VD' ELSE 'JL' END || substr(internal.commercial_protocolo(), 3);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.commercial_leads WHERE protocol = v_proto);
  END LOOP;
  INSERT INTO public.commercial_leads (protocol, product, name, store, contact, channel, locale, origem, email, city, uf,
                                       observacoes, owner_id)
  VALUES (v_proto, p_product, btrim(p_name), btrim(p_store), btrim(p_contact), p_channel, 'pt-BR', p_origem, v_email,
          nullif(btrim(coalesce(p_city, '')), ''), nullif(upper(btrim(coalesce(p_uf, ''))), ''),
          nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (v_id, 'nota', 'Lead cadastrado manualmente (origem: ' || p_origem || ')', auth.uid());
  RETURN v_id;
EXCEPTION
  WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO';
END $$;

-- 5. + 6. ─────────────────────────────────────────────────────────────────────
-- Proposta: trava o lead ANTES da proposta (mesma ordem de commercial_lead_converter).
CREATE OR REPLACE FUNCTION public.commercial_proposta_status(p_id uuid, p_status text, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE p public.commercial_proposals; l public.commercial_leads; v_lead uuid; v_ok boolean; v_etapa text; v_ordem_atual int; v_ordem_nova int;
BEGIN
  PERFORM internal.commercial_exigir_membro();
  SELECT lead_id INTO v_lead FROM public.commercial_proposals WHERE id = p_id;
  IF NOT FOUND OR NOT public.commercial_lead_visivel(v_lead) THEN RAISE EXCEPTION 'COMMERCIAL_PROPOSTA_NAO_ENCONTRADA'; END IF;
  l := internal.commercial_lead_travar(v_lead);
  SELECT * INTO p FROM public.commercial_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_PROPOSTA_NAO_ENCONTRADA'; END IF;
  v_ok := (p.status, p_status) IN (('rascunho', 'enviada'), ('rascunho', 'cancelada'),
            ('enviada', 'em_negociacao'), ('enviada', 'recusada'), ('enviada', 'expirada'), ('enviada', 'cancelada'),
            ('em_negociacao', 'enviada'), ('em_negociacao', 'recusada'), ('em_negociacao', 'expirada'), ('em_negociacao', 'cancelada'));
  IF NOT v_ok THEN RAISE EXCEPTION 'COMMERCIAL_TRANSICAO_PROPOSTA_INVALIDA'; END IF;
  IF p_status = 'enviada' AND p.validade < current_date THEN RAISE EXCEPTION 'COMMERCIAL_VALIDADE_INVALIDA'; END IF;
  UPDATE public.commercial_proposals SET status = p_status, updated_at = now(),
    enviada_em = CASE WHEN p_status = 'enviada' THEN coalesce(enviada_em, now()) ELSE enviada_em END,
    decidida_em = CASE WHEN p_status IN ('recusada', 'expirada', 'cancelada') THEN now() ELSE decidida_em END,
    motivo = coalesce(left(nullif(btrim(coalesce(p_motivo, '')), ''), 500), motivo)
  WHERE id = p_id;
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author)
  VALUES (p.lead_id, 'proposta', left(format('Proposta v%s: %s → %s%s', p.versao, p.status, p_status,
          coalesce(' · ' || nullif(btrim(coalesce(p_motivo, '')), ''), '')), 2000), auth.uid());
  v_etapa := CASE p_status WHEN 'enviada' THEN 'proposta' WHEN 'em_negociacao' THEN 'negociacao' END;
  IF v_etapa IS NOT NULL THEN
    SELECT s.ordem INTO v_ordem_atual FROM public.commercial_stages s WHERE s.codigo = l.status AND s.tipo = 'aberta';
    SELECT s.ordem INTO v_ordem_nova FROM public.commercial_stages s WHERE s.codigo = v_etapa AND s.ativo;
    IF v_ordem_atual IS NOT NULL AND v_ordem_nova IS NOT NULL AND v_ordem_nova > v_ordem_atual THEN
      PERFORM public.commercial_lead_mover(p.lead_id, v_etapa, NULL);
    END IF;
  END IF;
END $$;

-- Conversão: duplicado checado também por contato textual (e-mail) e serializado por advisory lock.
CREATE OR REPLACE FUNCTION public.commercial_lead_converter(p_lead uuid, p_proposta uuid, p_observacao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, internal, pg_temp AS $$
DECLARE l public.commercial_leads; p public.commercial_proposals; v_obs text := btrim(coalesce(p_observacao, ''));
  v_cliente uuid; v_dig text; v_plano text;
BEGIN
  PERFORM internal.commercial_exigir_gestor();
  l := internal.commercial_lead_travar(p_lead);
  IF l.origem = 'teste_gratis' THEN RAISE EXCEPTION 'COMMERCIAL_USE_CENTRAL'; END IF;
  IF l.status = 'contratado' THEN RAISE EXCEPTION 'COMMERCIAL_JA_CLIENTE'; END IF;
  IF l.status = 'perdido' THEN RAISE EXCEPTION 'COMMERCIAL_LEAD_ENCERRADO'; END IF;
  IF char_length(v_obs) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'COMMERCIAL_OBSERVACAO_OBRIGATORIA'; END IF;
  SELECT * INTO p FROM public.commercial_proposals WHERE id = p_proposta AND lead_id = p_lead FOR UPDATE;
  IF NOT FOUND OR p.status NOT IN ('enviada', 'em_negociacao') THEN RAISE EXCEPTION 'COMMERCIAL_PROPOSTA_NAO_CONVERTIVEL'; END IF;
  -- serializa conversões: duas transações não podem ver "sem cliente" e inserir o mesmo cliente
  PERFORM pg_advisory_xact_lock(hashtext('commercial_cliente_conversao'));
  v_dig := internal.commercial_digitos(l.contact);
  IF EXISTS (SELECT 1 FROM public.commercial_customers c
              WHERE c.lead_id IS DISTINCT FROM p_lead AND c.subscription_status <> 'cancelado'
                AND ((v_dig IS NOT NULL AND char_length(v_dig) >= 8 AND internal.commercial_digitos(c.contact) = v_dig)
                     OR lower(btrim(c.contact)) = lower(btrim(l.contact))
                     OR (c.product = l.product AND lower(btrim(c.store_name)) = lower(btrim(l.store))))) THEN
    RAISE EXCEPTION 'COMMERCIAL_CLIENTE_DUPLICADO';
  END IF;
  v_plano := coalesce(p.plano_codigo || CASE WHEN cardinality(p.addons) > 0 THEN ' + ' || array_to_string(p.addons, '+') ELSE '' END,
                      'Proposta v' || p.versao);
  UPDATE public.commercial_proposals SET status = 'aceita', decidida_em = now(), updated_at = now() WHERE id = p.id;
  UPDATE public.commercial_proposals SET status = 'cancelada', decidida_em = now(), updated_at = now(),
         motivo = 'Outra proposta aceita (v' || p.versao || ')'
   WHERE lead_id = p_lead AND id <> p.id AND status IN ('rascunho', 'enviada', 'em_negociacao');
  UPDATE public.commercial_leads SET status = 'contratado', etapa_desde = now(), updated_at = now(), motivo_perda = NULL WHERE id = p_lead;
  INSERT INTO public.commercial_lead_events (lead_id, kind, from_status, to_status, author) VALUES (p_lead, 'status', l.status, 'contratado', auth.uid());
  INSERT INTO public.commercial_lead_events (lead_id, kind, body, author) VALUES (p_lead, 'conversao', left(format(
    'Convertido manualmente com a proposta v%s: %s · R$ %s/mês%s. %s', p.versao, v_plano,
    to_char(p.valor_mensal_centavos / 100.0, 'FM999G999G990D00'),
    CASE WHEN p.preco_tabela_provisorio THEN ' (preço de tabela provisório)' ELSE '' END, v_obs), 2000), auth.uid());
  INSERT INTO public.commercial_customers (lead_id, product, store_name, contact, plan, monthly_value, subscription_status, notes)
  VALUES (p_lead, l.product, l.store, left(l.contact, 60), left(v_plano, 60), round(p.valor_mensal_centavos / 100.0, 2), 'ativo', left(v_obs, 2000))
  ON CONFLICT (lead_id) DO UPDATE SET plan = EXCLUDED.plan, monthly_value = EXCLUDED.monthly_value,
    subscription_status = 'ativo', notes = EXCLUDED.notes
  RETURNING id INTO v_cliente;
  RETURN v_cliente;
END $$;

-- 7. ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commercial_equipe_salvar(p_email text, p_nome text, p_papel text, p_ativo boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid;
BEGIN
  PERFORM internal.commercial_exigir_gestor();
  -- troca de gestão serializada: duas alterações simultâneas não podem deixar a equipe sem gestor
  PERFORM pg_advisory_xact_lock(hashtext('commercial_equipe_gestores'));
  IF p_papel NOT IN ('gestor', 'vendedor') THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO'; END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(btrim(coalesce(p_email, ''))) LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'COMMERCIAL_USUARIO_NAO_ENCONTRADO'; END IF;
  INSERT INTO public.commercial_admins (user_id, nome, papel, ativo)
  VALUES (v_user, nullif(btrim(coalesce(p_nome, '')), ''), p_papel, coalesce(p_ativo, true))
  ON CONFLICT (user_id) DO UPDATE SET nome = coalesce(EXCLUDED.nome, commercial_admins.nome), papel = EXCLUDED.papel, ativo = EXCLUDED.ativo;
  IF NOT EXISTS (SELECT 1 FROM public.commercial_admins WHERE papel = 'gestor' AND ativo) THEN
    RAISE EXCEPTION 'COMMERCIAL_ULTIMO_GESTOR';
  END IF;
  RETURN v_user;
EXCEPTION
  WHEN check_violation THEN RAISE EXCEPTION 'COMMERCIAL_CAMPO_INVALIDO';
END $$;

-- Prova mínima
DO $verify$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.commercial_catalogo_planos()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.commercial_catalogo_planos()', 'EXECUTE') THEN
    RAISE EXCEPTION 'CRM revisão: privilégio do catálogo';
  END IF;
END
$verify$;

COMMIT;
