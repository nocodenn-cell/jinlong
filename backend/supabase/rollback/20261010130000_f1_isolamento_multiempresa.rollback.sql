-- ============================================================================
-- ROLLBACK da F1 (20261010130000_f1_isolamento_multiempresa.sql).
-- NÃO fica em supabase/migrations/. Executar manualmente, com autorização.
-- Restaura o estado exato da M1 (testado: pg_dump --schema-only idêntico, doc 14).
--
-- ATENÇÃO: reabre os P0 corrigidos pela F1 (escrita cruzada em lojas, DONO/ADMIN
-- globais entre empresas). Só usar se a F1 causar incidente e houver UMA empresa.
-- Perde: cadastro de plataforma, auditoria de plataforma, vigência/responsável dos
-- módulos e a proveniência dos vínculos. Dados de negócio não são tocados.
-- ============================================================================
BEGIN;

-- 9. Views
CREATE OR REPLACE VIEW public.produtos_custos WITH (security_invoker = off) AS
 SELECT p.id AS produto_id,
    p.loja_id,
    p.preco_custo,
    p.preco_custo_medio
   FROM produtos p
     JOIN usuarios u ON u.id = (( SELECT auth.uid() AS uid)) AND COALESCE(u.ativo, false) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text])) AND (u.perfil = 'ADMIN'::text OR u.loja_id = p.loja_id);
ALTER VIEW public.v_top_produtos RESET (security_invoker);
ALTER VIEW public.v_vendas_dia RESET (security_invoker);
ALTER VIEW public.v_venda_consistencia_anomalias RESET (security_invoker);

-- 8/7. Funções novas de módulo e contexto
DROP FUNCTION IF EXISTS public.fp_empresa_contexto_modulo(text, text[], uuid);
DROP FUNCTION IF EXISTS public.plataforma_definir_modulo_empresa(uuid, text, boolean, text, text, date, date);
DROP FUNCTION IF EXISTS public.ops_definir_modulo_empresa(uuid, text, boolean, text, text, text, date, date);
DROP FUNCTION IF EXISTS public.modulo_definir_empresa_nucleo(uuid, text, boolean, text, text, date, date, uuid, text, text);
ALTER TABLE public.empresa_modulos DROP CONSTRAINT IF EXISTS empresa_modulos_vigencia_check;
ALTER TABLE public.empresa_modulos
  DROP COLUMN IF EXISTS vigencia_inicio, DROP COLUMN IF EXISTS vigencia_fim,
  DROP COLUMN IF EXISTS responsavel_id, DROP COLUMN IF EXISTS responsavel, DROP COLUMN IF EXISTS motivo;
ALTER TABLE public.empresa_modulos_historico DISABLE TRIGGER empresa_modulos_historico_imutavel;
ALTER TABLE public.empresa_modulos_historico
  DROP COLUMN IF EXISTS vigencia_inicio, DROP COLUMN IF EXISTS vigencia_fim,
  DROP COLUMN IF EXISTS responsavel_id, DROP COLUMN IF EXISTS responsavel;
ALTER TABLE public.empresa_modulos_historico ENABLE TRIGGER empresa_modulos_historico_imutavel;

-- 6. Provisionamento de plataforma
DROP FUNCTION IF EXISTS public.plataforma_provisionar_loja(uuid, text, text);
DROP FUNCTION IF EXISTS public.plataforma_criar_empresa(text, text, text);

-- 5. lojas: policies originais (044/224), grants e triggers
DROP POLICY IF EXISTS empresas_leitura_plataforma ON public.empresas;
DROP POLICY IF EXISTS lojas_select_escopo ON public.lojas;
DROP POLICY IF EXISTS lojas_update_gestao ON public.lojas;
CREATE POLICY lojas_select_authenticated ON public.lojas
  FOR SELECT USING (((SELECT auth.role()) = 'authenticated'::text));
CREATE POLICY lojas_write_gerente ON public.lojas
  FOR ALL USING ((EXISTS ( SELECT 1
     FROM usuarios u
    WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.perfil = ANY (ARRAY['GERENTE'::text, 'DONO'::text, 'ADMIN'::text]))))));
GRANT INSERT, DELETE ON public.lojas TO authenticated;
DROP TRIGGER IF EXISTS lojas_empresa_obrigatoria ON public.lojas;
DROP FUNCTION IF EXISTS public.trg_lojas_empresa_obrigatoria();

-- 4. Cerca de empresa
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND p.polname = 'cerca_empresa'
  LOOP
    EXECUTE format('DROP POLICY cerca_empresa ON public.%I', t);
  END LOOP;
  FOR t IN SELECT c.relname FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND g.tgname = 'cerca_empresa_escrita'
  LOOP
    EXECUTE format('DROP TRIGGER cerca_empresa_escrita ON public.%I', t);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.trg_cerca_empresa_escrita();
DROP FUNCTION IF EXISTS public.fp_caixas_cerca();
DROP FUNCTION IF EXISTS public.fp_loja_na_cerca(uuid);
DROP FUNCTION IF EXISTS public.fp_lojas_cerca();
DROP FUNCTION IF EXISTS public.fp_empresas_cerca();

-- 2. Sincronização de vínculos
DROP TRIGGER IF EXISTS usuarios_sincroniza_vinculo ON public.usuarios;
DROP TRIGGER IF EXISTS lojas_empresa_sincroniza_vinculos ON public.lojas;
DROP FUNCTION IF EXISTS public.trg_usuarios_sincroniza_vinculo();
DROP FUNCTION IF EXISTS public.trg_lojas_empresa_sincroniza_vinculos();
-- m1_backfill_empresa_legada é restaurada abaixo (antes de remover a função que ela chama)

-- 1. Plataforma
DROP FUNCTION IF EXISTS public.fp_plataforma_pode(text);
DROP FUNCTION IF EXISTS public.ops_definir_plataforma_admin(uuid, boolean, text[], text, text);
DROP TRIGGER IF EXISTS plataforma_admins_somente_procedimento ON public.plataforma_admins;
DROP FUNCTION IF EXISTS public.trg_plataforma_admins_somente_procedimento();
DROP TABLE IF EXISTS public.plataforma_admins_historico;
ALTER TABLE public.plataforma_admins DROP CONSTRAINT IF EXISTS plataforma_admins_capacidades_check;
ALTER TABLE public.plataforma_admins DROP COLUMN IF EXISTS capacidades, DROP COLUMN IF EXISTS atualizado_em;

-- 0. Auditoria e controle
DROP TABLE IF EXISTS public.plataforma_auditoria;
DROP TABLE IF EXISTS public.multiempresa_controle;

-- ------------------------------------------------------------------------------
-- Definições da M1 (extraídas de pg_get_functiondef no banco M1 local)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fp_pode_loja(p_loja uuid, p_papeis text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL AND p_loja IS NOT NULL AND (
    p_loja IN (SELECT public.fp_lojas_permitidas(p_papeis))
    OR (public.fp_legado_admin_global() AND EXISTS (SELECT 1 FROM public.lojas l WHERE l.id = p_loja))
  )
$function$

;

CREATE OR REPLACE FUNCTION public.auth_usuario_gerencial_loja(p_loja_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = (SELECT auth.uid())
      AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      AND (u.perfil = 'ADMIN' OR u.loja_id = p_loja_id)
  );
$function$

;

CREATE OR REPLACE FUNCTION public.fp_modulo_ativo(p_empresa uuid, p_modulo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.empresa_modulos m
     WHERE m.empresa_id = p_empresa AND m.modulo_codigo = p_modulo AND m.habilitado
  ) AND public.fp_empresa_operacional(p_empresa)
$function$

;

CREATE OR REPLACE FUNCTION public.trg_empresa_modulos_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.habilitado = NEW.habilitado
     AND OLD.autorizado_por IS NOT DISTINCT FROM NEW.autorizado_por THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.empresa_modulos_historico
    (empresa_id, modulo_codigo, acao, autorizado_por, motivo, origem)
  VALUES (
    NEW.empresa_id, NEW.modulo_codigo,
    CASE WHEN NEW.habilitado THEN 'HABILITAR' ELSE 'DESABILITAR' END,
    NEW.autorizado_por,
    coalesce(nullif(current_setting('jinlong.modulo_motivo', true), ''), 'SEM_MOTIVO_REGISTRADO'),
    coalesce(nullif(current_setting('jinlong.modulo_origem', true), ''), 'ESCRITA_DIRETA')
  );
  RETURN NEW;
END
$function$

;

CREATE OR REPLACE FUNCTION public.fp_divergencias_vinculos_legados()
 RETURNS TABLE(usuario_id uuid, motivo text, detalhe text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- GERENTE/OPERADOR legados: precisam de vínculo ativo para (empresa da loja, papel, loja)
  SELECT u.id, 'VINCULO_AUSENTE'::text, u.perfil || ' loja ' || u.loja_id::text
    FROM public.usuarios u
    LEFT JOIN public.lojas l ON l.id = u.loja_id
   WHERE u.perfil IN ('GERENTE', 'OPERADOR')
     AND NOT EXISTS (
       SELECT 1 FROM public.usuario_vinculos v
        WHERE v.usuario_id = u.id AND v.loja_id = u.loja_id AND v.papel = u.perfil
          AND v.empresa_id = l.empresa_id AND v.ativo)
  UNION ALL
  -- DONO legado: precisa de vínculo DONO ativo na empresa da loja legada
  SELECT u.id, 'VINCULO_DONO_AUSENTE', 'loja ' || u.loja_id::text
    FROM public.usuarios u
    LEFT JOIN public.lojas l ON l.id = u.loja_id
   WHERE u.perfil = 'DONO'
     AND NOT EXISTS (
       SELECT 1 FROM public.usuario_vinculos v
        WHERE v.usuario_id = u.id AND v.papel = 'DONO' AND v.loja_id IS NULL
          AND v.empresa_id = l.empresa_id AND v.ativo)
  UNION ALL
  -- ADMIN legado não tem vínculo (D9): se tiver, é divergência
  SELECT v.usuario_id, 'ADMIN_COM_VINCULO', v.papel
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE u.perfil = 'ADMIN'
  UNION ALL
  -- vínculo sem origem legada correspondente (usuário não existe mais ou papel diverge)
  SELECT v.usuario_id, 'VINCULO_SEM_ORIGEM_LEGADA', v.papel
    FROM public.usuario_vinculos v
    LEFT JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE v.ativo AND (u.id IS NULL
         OR NOT (
           (u.perfil = 'DONO' AND v.papel = 'DONO')
           OR (u.perfil IN ('GERENTE', 'OPERADOR') AND v.papel = u.perfil AND v.loja_id = u.loja_id)))
$function$

;

CREATE OR REPLACE FUNCTION public.m1_backfill_empresa_legada()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_empresa      uuid;
  v_corte        timestamptz;
  v_empresa_nova int := 0;
  v_lojas        int := 0;
  v_vinculos     int := 0;
  v_excecoes     int := 0;
  v_n            int;
  r              record;
BEGIN
  -- Corte: gravado na primeira execução e reutilizado nas seguintes (idempotência).
  SELECT valor INTO v_corte FROM public.m1_backfill_controle WHERE chave = 'corte_lojas';
  IF v_corte IS NULL THEN
    v_corte := now();
    INSERT INTO public.m1_backfill_controle (chave, valor) VALUES ('corte_lojas', v_corte);
  END IF;

  -- 1. Empresa legada única (sem CNPJ).
  SELECT id INTO v_empresa FROM public.empresas WHERE origem = 'LEGADA_M1';
  IF v_empresa IS NULL THEN
    INSERT INTO public.empresas (nome, origem, status)
    VALUES ('Empresa legada (migrada na M1)', 'LEGADA_M1', 'ATIVA')
    RETURNING id INTO v_empresa;
    v_empresa_nova := 1;
  END IF;

  -- 2. Lojas existentes no corte, ainda sem empresa.
  UPDATE public.lojas l
     SET empresa_id = v_empresa
   WHERE l.empresa_id IS NULL
     AND l.created_at <= v_corte;
  GET DIAGNOSTICS v_lojas = ROW_COUNT;

  -- 3. Vínculos derivados da fonte legada (usuarios). Sem duplicar.
  -- 3. DONO, GERENTE e OPERADOR: a empresa do vínculo é a empresa da loja legada do
  -- usuário (usuarios.loja_id). Nunca presumida: se a loja não tem empresa, é exceção.
  FOR r IN
    SELECT u.id AS usuario_id, u.perfil, u.loja_id, u.ativo, l.id AS loja_existe, l.empresa_id
      FROM public.usuarios u
      LEFT JOIN public.lojas l ON l.id = u.loja_id
     WHERE u.perfil IN ('DONO', 'GERENTE', 'OPERADOR')
  LOOP
    IF r.loja_existe IS NULL THEN
      INSERT INTO public.m1_backfill_excecoes (usuario_id, loja_id, motivo, detalhe)
      VALUES (r.usuario_id, r.loja_id, 'LOJA_INEXISTENTE', r.perfil)
      ON CONFLICT (usuario_id, loja_id, motivo) DO NOTHING;
      CONTINUE;
    END IF;
    IF r.empresa_id IS NULL THEN
      INSERT INTO public.m1_backfill_excecoes (usuario_id, loja_id, motivo, detalhe)
      VALUES (r.usuario_id, r.loja_id, 'LOJA_SEM_EMPRESA_POS_CORTE', r.perfil)
      ON CONFLICT (usuario_id, loja_id, motivo) DO NOTHING;
      CONTINUE;
    END IF;
    -- DONO: vínculo de empresa inteira (loja NULL); GERENTE/OPERADOR: vínculo de loja
    IF NOT EXISTS (
      SELECT 1 FROM public.usuario_vinculos v
       WHERE v.usuario_id = r.usuario_id AND v.empresa_id = r.empresa_id
         AND v.papel = r.perfil
         AND v.loja_id IS NOT DISTINCT FROM (CASE WHEN r.perfil = 'DONO' THEN NULL ELSE r.loja_id END)) THEN
      INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo, created_by)
      VALUES (r.usuario_id, r.empresa_id, CASE WHEN r.perfil = 'DONO' THEN NULL ELSE r.loja_id END, r.perfil, r.ativo, NULL);
      v_vinculos := v_vinculos + 1;
    END IF;
  END LOOP;

  -- 4. ADMIN legado: sem vínculo (D9). Registrado como exceção explícita.
  INSERT INTO public.m1_backfill_excecoes (usuario_id, loja_id, motivo, detalhe)
  SELECT u.id, u.loja_id, 'ADMIN_SEM_VINCULO', 'ADMIN legado não recebe vínculo; promoção a plataforma depende de D9'
    FROM public.usuarios u
   WHERE u.perfil = 'ADMIN'
  ON CONFLICT (usuario_id, loja_id, motivo) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_excecoes := v_excecoes + v_n;

  RETURN jsonb_build_object(
    'empresa_legada_id', v_empresa,
    'empresa_criada', v_empresa_nova,
    'lojas_associadas', v_lojas,
    'vinculos_criados', v_vinculos,
    'excecoes_novas', v_excecoes,
    'corte_lojas', v_corte,
    'divergencias', (SELECT count(*) FROM public.fp_divergencias_vinculos_legados())
  );
END
$function$

;

CREATE OR REPLACE FUNCTION public.ops_definir_modulo_empresa(p_empresa uuid, p_modulo text, p_habilitado boolean, p_autorizado_por text, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_empresa IS NULL OR p_modulo IS NULL OR p_habilitado IS NULL THEN
    RAISE EXCEPTION 'MODULO_PARAMETRO_AUSENTE';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'MODULO_MOTIVO_OBRIGATORIO';
  END IF;
  IF p_habilitado AND length(btrim(coalesce(p_autorizado_por, ''))) = 0 THEN
    RAISE EXCEPTION 'MODULO_AUTORIZACAO_OBRIGATORIA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa) THEN
    RAISE EXCEPTION 'MODULO_EMPRESA_INEXISTENTE';
  END IF;

  PERFORM set_config('jinlong.modulo_motivo', p_motivo, true);
  PERFORM set_config('jinlong.modulo_origem', 'ops_definir_modulo_empresa', true);

  INSERT INTO public.empresa_modulos (empresa_id, modulo_codigo, habilitado, autorizado_por, alterado_em)
  VALUES (p_empresa, p_modulo, p_habilitado, CASE WHEN p_habilitado THEN p_autorizado_por END, now())
  ON CONFLICT (empresa_id, modulo_codigo) DO UPDATE
    SET habilitado = EXCLUDED.habilitado,
        autorizado_por = EXCLUDED.autorizado_por,
        alterado_em = EXCLUDED.alterado_em;
END
$function$

;

CREATE OR REPLACE FUNCTION public.obter_estoque_disponivel_transferencia(p_loja_id uuid, p_produto_id uuid)
 RETURNS TABLE(quantidade_disponivel numeric, unidade_medida text, limite_observacao numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'TRANSFERENCIA_AUTH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.usuarios u
     WHERE u.id = v_uid
       AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_PERFIL';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(e.quantidade_atual, 0)::numeric AS quantidade_disponivel,
    COALESCE(p.unidade_medida, 'UN')::text AS unidade_medida,
    COALESCE(p.limite_transferencia_sem_observacao, pc.limite_transferencia_obs, 50)::numeric AS limite_observacao
  FROM public.produtos p
  LEFT JOIN public.estoque e
    ON e.produto_id = p.id
   AND e.loja_id = p_loja_id
  CROSS JOIN public.pdv_config pc
  WHERE p.id = p_produto_id
  LIMIT 1;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.relatorio_consistencia_vendas_gerente(p_caixa_id uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT (now() - '7 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS TABLE(total_vendas bigint, vendas_consistentes bigint, vendas_com_anomalia bigint, taxa_consistencia_pct numeric, sem_itens bigint, sem_evento_ledger bigint, evento_duplicado bigint, sem_pagamento bigint, pagamentos_divergentes bigint, periodo_inicio timestamp with time zone, periodo_fim timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_loja_escopo uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
  FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_PERFIL';
  END IF;

  -- GERENTE só vê a própria loja. DONO/ADMIN (Padrão A, consolidado em
  -- 20260829120000/fase6) têm escopo global — sem filtro de loja.
  IF v_perfil = 'GERENTE' THEN
    v_loja_escopo := v_loja_usuario;
  END IF;

  -- Se um caixa específico foi pedido, GERENTE só pode consultar um caixa
  -- da própria loja — cross-loja nega antes de expor qualquer linha.
  IF p_caixa_id IS NOT NULL AND v_perfil = 'GERENTE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.caixas c WHERE c.id = p_caixa_id AND c.loja_id = v_loja_usuario
    ) THEN
      RAISE EXCEPTION 'RELATORIO_CONSISTENCIA_LOJA_INVALIDA';
    END IF;
  END IF;

  RETURN QUERY
  SELECT * FROM public.relatorio_consistencia_vendas(p_caixa_id, v_loja_escopo, p_from, p_to);
END;
$function$

;


-- Grants da assinatura original de ops_definir_modulo_empresa (M1)
REVOKE ALL ON FUNCTION public.ops_definir_modulo_empresa(uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_definir_modulo_empresa(uuid, text, boolean, text, text) TO service_role;

-- Agora que m1_backfill_empresa_legada voltou à versão M1, a função de sincronização pode sair.
DROP FUNCTION IF EXISTS public.m1_sincronizar_vinculo_usuario(uuid);
ALTER TABLE public.usuario_vinculos DROP COLUMN IF EXISTS origem;
DROP FUNCTION IF EXISTS public.trg_historico_imutavel();

COMMIT;
