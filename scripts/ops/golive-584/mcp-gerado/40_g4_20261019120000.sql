-- golive-final-584 :: 20261019120000 multiempresa_fase1_base :: sha256 39ff6ed0bc296e43b45cd742b8674185eac3409c5a10662f9c77f8798f97658d
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261019120000') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261019120000'; END IF; END $g$;
-- 20261019120000_multiempresa_fase1_base.sql
-- Multiempresa Fase 1 (docs/architecture/ESPEC_MULTIEMPRESA_V1.md, etapas 1–4 + protótipo da etapa 7 + D6).
--
-- ADITIVA E REVERSÍVEL. Rollback: backend/supabase/rollback/20261019120000_multiempresa_fase1_base.rollback.sql
--   * cria empresas / usuario_vinculos / plataforma_admins (vazia, D9);
--   * lojas.empresa_id ANULÁVEL (D11/§3) + UNIQUE(id, empresa_id) + UNIQUE(empresa_id, codigo) (global mantida);
--   * backfill Empresa 1 (cliente atual) e vínculos derivados de usuarios (ADMIN sem vínculo, D9);
--   * helpers fp_* (modo compatibilidade ADMIN legado, §6);
--   * trigger usuarios → usuario_vinculos (etapa 4);
--   * guarda RESTRICTIVE só nas 3 tabelas do protótipo (D16): fornecedores, contas_receber, itens_venda;
--   * dispositivos PDV + códigos de ativação (fecha pré-requisitos de D6 para o sync-outbox);
--   * RPC de provisionamento atômico (plataforma, service_role apenas).
-- NÃO altera policies existentes, NÃO remove usuarios.perfil/loja_id, NÃO troca a fonte de verdade (D17).
-- Cliente 1: todas as lojas → Empresa 1; DONO vê todas as lojas da E1 = todas → comportamento equivalente (D10).


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DDL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(btrim(nome)) >= 2),
  razao_social text NULL,
  cnpj text NULL CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
  plano text NOT NULL DEFAULT 'PILOTO',
  status text NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'SUSPENSA', 'CANCELADA')),
  vigencia_inicio date NOT NULL DEFAULT current_date,
  vigencia_fim date NULL,
  max_lojas int NULL CHECK (max_lojas IS NULL OR max_lojas > 0),
  max_usuarios int NULL CHECK (max_usuarios IS NULL OR max_usuarios > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS empresas_cnpj_uniq ON public.empresas (cnpj) WHERE cnpj IS NOT NULL;

ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS empresa_id uuid NULL REFERENCES public.empresas(id);
CREATE INDEX IF NOT EXISTS lojas_empresa_id_idx ON public.lojas (empresa_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lojas_id_empresa_uniq') THEN
    ALTER TABLE public.lojas ADD CONSTRAINT lojas_id_empresa_uniq UNIQUE (id, empresa_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lojas_empresa_codigo_uniq') THEN
    ALTER TABLE public.lojas ADD CONSTRAINT lojas_empresa_codigo_uniq UNIQUE (empresa_id, codigo);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.usuario_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  loja_id uuid NULL,
  papel text NOT NULL CHECK (papel IN ('DONO', 'GERENTE', 'OPERADOR')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CONSTRAINT usuario_vinculos_loja_da_empresa_fk
    FOREIGN KEY (loja_id, empresa_id) REFERENCES public.lojas(id, empresa_id),
  CONSTRAINT usuario_vinculos_papel_loja_ck
    CHECK ((papel = 'DONO' AND loja_id IS NULL) OR (papel <> 'DONO' AND loja_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_vinculos_uniq
  ON public.usuario_vinculos (usuario_id, empresa_id, papel, COALESCE(loja_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE UNIQUE INDEX IF NOT EXISTS usuario_vinculos_operador_uma_loja
  ON public.usuario_vinculos (usuario_id, empresa_id) WHERE papel = 'OPERADOR' AND ativo;
CREATE INDEX IF NOT EXISTS usuario_vinculos_usuario_ativo_idx ON public.usuario_vinculos (usuario_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS usuario_vinculos_loja_ativo_idx ON public.usuario_vinculos (loja_id) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.plataforma_admins (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  motivo text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill (Empresa 1 = cliente atual). UUID fixo para rastreabilidade.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.empresas (id, nome, plano, status, vigencia_inicio)
SELECT 'e0000001-0000-4000-8000-000000000001'::uuid, 'Empresa 1 (cliente piloto)', 'PILOTO', 'ATIVA', current_date
WHERE EXISTS (SELECT 1 FROM public.lojas)
ON CONFLICT (id) DO NOTHING;

UPDATE public.lojas
   SET empresa_id = 'e0000001-0000-4000-8000-000000000001'::uuid
 WHERE empresa_id IS NULL
   AND EXISTS (SELECT 1 FROM public.empresas WHERE id = 'e0000001-0000-4000-8000-000000000001'::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Helpers fp_* (§6). Contexto ausente ⇒ false / vazio. Nunca MATRIZ.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fp_usuario_ativo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT u.ativo FROM public.usuarios u WHERE u.id = (SELECT auth.uid())), false);
$$;

CREATE OR REPLACE FUNCTION public.fp_eh_plataforma()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plataforma_admins p
    JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE p.usuario_id = (SELECT auth.uid()) AND p.ativo AND u.ativo
  );
$$;

CREATE OR REPLACE FUNCTION public.fp_empresas_do_usuario()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT v.empresa_id
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE v.usuario_id = (SELECT auth.uid()) AND v.ativo AND u.ativo;
$$;

-- usada na policy de usuario_vinculos (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.fp_empresas_do_usuario_como_dono()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT v.empresa_id
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE v.usuario_id = (SELECT auth.uid()) AND v.ativo AND u.ativo AND v.papel = 'DONO';
$$;

CREATE OR REPLACE FUNCTION public.fp_lojas_permitidas(p_papeis text[] DEFAULT NULL)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.id
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id AND u.ativo
    JOIN public.lojas l ON l.empresa_id = v.empresa_id AND (v.papel = 'DONO' OR l.id = v.loja_id)
   WHERE v.usuario_id = (SELECT auth.uid())
     AND v.ativo
     AND (p_papeis IS NULL OR v.papel = ANY (p_papeis));
$$;

-- Modo compatibilidade (Fases 1–5): ADMIN legado (usuarios.perfil = 'ADMIN', ativo) mantém escopo global.
-- Remoção = um CREATE OR REPLACE na Fase "Corte ADMIN" (§6).
CREATE OR REPLACE FUNCTION public.fp_pode_loja(p_loja uuid, p_papeis text[] DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_loja IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.fp_lojas_permitidas(p_papeis) x WHERE x = p_loja)
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = (SELECT auth.uid()) AND u.ativo AND u.perfil = 'ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION public.fp_empresa_da_loja(p_loja uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.empresa_id FROM public.lojas l WHERE l.id = p_loja;
$$;

CREATE OR REPLACE FUNCTION public.fp_mesma_empresa(p_loja_a uuid, p_loja_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((
    SELECT a.empresa_id IS NOT NULL AND a.empresa_id = b.empresa_id
      FROM public.lojas a, public.lojas b
     WHERE a.id = p_loja_a AND b.id = p_loja_b
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.fp_empresa_operacional(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((
    SELECT e.status = 'ATIVA'
       AND e.vigencia_inicio <= current_date
       AND (e.vigencia_fim IS NULL OR e.vigencia_fim >= current_date)
      FROM public.empresas e WHERE e.id = p_empresa
  ), false);
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.fp_usuario_ativo()', 'public.fp_eh_plataforma()', 'public.fp_empresas_do_usuario()',
    'public.fp_empresas_do_usuario_como_dono()',
    'public.fp_lojas_permitidas(text[])', 'public.fp_pode_loja(uuid, text[])',
    'public.fp_empresa_da_loja(uuid)', 'public.fp_mesma_empresa(uuid, uuid)',
    'public.fp_empresa_operacional(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Vínculos a partir de usuarios + trigger de sincronização legada (etapa 4)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.fp_sync_vinculo_legado(p_usuario uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u record;
  v_empresa uuid;
BEGIN
  SELECT id, perfil, loja_id INTO u FROM public.usuarios WHERE id = p_usuario;
  IF NOT FOUND OR u.perfil NOT IN ('DONO', 'GERENTE', 'OPERADOR') OR u.loja_id IS NULL THEN
    RETURN; -- ADMIN e usuários sem loja: sem vínculo (D9 / fail closed)
  END IF;
  SELECT empresa_id INTO v_empresa FROM public.lojas WHERE id = u.loja_id;
  IF v_empresa IS NULL THEN
    RETURN; -- loja sem empresa: fail closed (D18)
  END IF;
  -- vínculo "principal" derivado; vínculos extras (GERENTE multi-loja) criados por RPC não são tocados.
  IF u.perfil = 'OPERADOR' THEN
    UPDATE public.usuario_vinculos SET ativo = false
     WHERE usuario_id = u.id AND empresa_id = v_empresa AND papel = 'OPERADOR' AND loja_id <> u.loja_id AND ativo;
  END IF;
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
  VALUES (u.id, v_empresa, CASE WHEN u.perfil = 'DONO' THEN NULL ELSE u.loja_id END, u.perfil, true)
  ON CONFLICT (usuario_id, empresa_id, papel, COALESCE(loja_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET ativo = true;
END $$;
REVOKE ALL ON FUNCTION internal.fp_sync_vinculo_legado(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION internal.tg_usuarios_sync_vinculo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.perfil IS DISTINCT FROM OLD.perfil
     OR NEW.loja_id IS DISTINCT FROM OLD.loja_id THEN
    IF TG_OP = 'UPDATE' AND NEW.perfil IS DISTINCT FROM OLD.perfil THEN
      -- papel mudou: o vínculo derivado do papel antigo deixa de valer.
      UPDATE public.usuario_vinculos SET ativo = false
       WHERE usuario_id = NEW.id AND papel = OLD.perfil AND ativo;
    END IF;
    PERFORM internal.fp_sync_vinculo_legado(NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_usuarios_sync_vinculo() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_usuarios_sync_vinculo ON public.usuarios;
CREATE TRIGGER trg_usuarios_sync_vinculo
  AFTER INSERT OR UPDATE OF perfil, loja_id ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION internal.tg_usuarios_sync_vinculo();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.usuarios LOOP
    PERFORM internal.fp_sync_vinculo_legado(r.id);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS das tabelas novas (leitura: próprio + DONO da empresa; escrita só servidor)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plataforma_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.empresas, public.usuario_vinculos, public.plataforma_admins FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.empresas, public.usuario_vinculos, public.plataforma_admins FROM authenticated;
GRANT SELECT ON public.empresas, public.usuario_vinculos TO authenticated;

DROP POLICY IF EXISTS empresas_select_vinculo ON public.empresas;
CREATE POLICY empresas_select_vinculo ON public.empresas FOR SELECT TO authenticated
  USING (id IN (SELECT public.fp_empresas_do_usuario()));

DROP POLICY IF EXISTS usuario_vinculos_select ON public.usuario_vinculos;
CREATE POLICY usuario_vinculos_select ON public.usuario_vinculos FOR SELECT TO authenticated
  USING (
    usuario_id = (SELECT auth.uid())
    OR empresa_id IN (SELECT public.fp_empresas_do_usuario_como_dono())
  );
-- plataforma_admins: sem policy para authenticated (somente service_role).

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Guarda RESTRICTIVE — protótipo D16 (3 tabelas). Reversível: DROP POLICY tenant_guard.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_guard ON public.fornecedores;
CREATE POLICY tenant_guard ON public.fornecedores AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.fp_pode_loja(loja_id, NULL)))
  WITH CHECK ((SELECT public.fp_pode_loja(loja_id, NULL)));

DROP POLICY IF EXISTS tenant_guard ON public.contas_receber;
CREATE POLICY tenant_guard ON public.contas_receber AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.fp_pode_loja(loja_id, NULL)))
  WITH CHECK ((SELECT public.fp_pode_loja(loja_id, NULL)));

DROP POLICY IF EXISTS tenant_guard ON public.itens_venda;
CREATE POLICY tenant_guard ON public.itens_venda AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
     WHERE v.id = itens_venda.venda_id AND public.fp_pode_loja(c.loja_id, NULL)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
     WHERE v.id = itens_venda.venda_id AND public.fp_pode_loja(c.loja_id, NULL)));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Dispositivos PDV (desktop) + códigos de ativação. Somente service_role.
--    Código canônico = só [A-Z0-9] maiúsculo (hífens/espaços ignorados); banco guarda sha256 hex.
--    Substitui a SYNC_KEY global do .env do cliente por segredo POR DISPOSITIVO,
--    amarrado a UMA loja no servidor (pré-requisito D6 / §11).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pdv_dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  loja_id uuid NOT NULL,
  device_fingerprint text NOT NULL CHECK (length(device_fingerprint) BETWEEN 3 AND 200),
  sync_secret text NOT NULL CHECK (length(sync_secret) >= 48),
  nome text NULL,
  ativo boolean NOT NULL DEFAULT true,
  ativado_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz NULL,
  ultimo_sync_em timestamptz NULL,
  CONSTRAINT pdv_dispositivos_loja_empresa_fk FOREIGN KEY (loja_id, empresa_id) REFERENCES public.lojas(id, empresa_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pdv_dispositivos_fingerprint_ativo
  ON public.pdv_dispositivos (device_fingerprint) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.pdv_codigos_ativacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_hash text NOT NULL UNIQUE CHECK (codigo_hash ~ '^[0-9a-f]{64}$'),
  empresa_id uuid NOT NULL,
  loja_id uuid NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz NULL,
  dispositivo_id uuid NULL REFERENCES public.pdv_dispositivos(id),
  criado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_codigos_loja_empresa_fk FOREIGN KEY (loja_id, empresa_id) REFERENCES public.lojas(id, empresa_id)
);

ALTER TABLE public.pdv_dispositivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_codigos_ativacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_dispositivos, public.pdv_codigos_ativacao FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pdv_dispositivos, public.pdv_codigos_ativacao TO service_role;

CREATE OR REPLACE FUNCTION public.plataforma_registrar_codigo_ativacao_pdv(
  p_loja_id uuid, p_codigo_hash text, p_validade_horas int DEFAULT 24, p_criado_por uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_empresa uuid; v_id uuid; v_exp timestamptz;
BEGIN
  SELECT empresa_id INTO v_empresa FROM public.lojas WHERE id = p_loja_id AND ativo;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'ATIVACAO_PDV_LOJA_INVALIDA'; END IF;
  IF NOT public.fp_empresa_operacional(v_empresa) THEN RAISE EXCEPTION 'EMPRESA_NAO_OPERACIONAL'; END IF;
  IF p_validade_horas IS NULL OR p_validade_horas < 1 OR p_validade_horas > 168 THEN
    RAISE EXCEPTION 'ATIVACAO_PDV_VALIDADE_INVALIDA';
  END IF;
  v_exp := now() + make_interval(hours => p_validade_horas);
  INSERT INTO public.pdv_codigos_ativacao (codigo_hash, empresa_id, loja_id, expira_em, criado_por)
  VALUES (lower(p_codigo_hash), v_empresa, p_loja_id, v_exp, p_criado_por)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'loja_id', p_loja_id, 'empresa_id', v_empresa, 'expira_em', v_exp);
END $$;

CREATE OR REPLACE FUNCTION public.ativar_dispositivo_pdv(p_codigo text, p_device_fingerprint text, p_nome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c record;
  v_fp text := lower(btrim(coalesce(p_device_fingerprint, '')));
  v_secret text;
  v_dev uuid;
BEGIN
  IF length(v_fp) < 3 OR length(v_fp) > 200 THEN RAISE EXCEPTION 'ATIVACAO_PDV_FINGERPRINT_INVALIDO'; END IF;
  SELECT * INTO c FROM public.pdv_codigos_ativacao
   WHERE codigo_hash = encode(sha256(convert_to(regexp_replace(upper(coalesce(p_codigo, '')), '[^A-Z0-9]', '', 'g'), 'UTF8')), 'hex')
   FOR UPDATE;
  IF NOT FOUND OR c.usado_em IS NOT NULL OR c.expira_em < now() THEN
    RAISE EXCEPTION 'ATIVACAO_PDV_CODIGO_INVALIDO'; -- mesma resposta para inexistente/usado/expirado
  END IF;
  IF NOT public.fp_empresa_operacional(c.empresa_id) THEN RAISE EXCEPTION 'EMPRESA_NAO_OPERACIONAL'; END IF;
  -- reativação do mesmo computador revoga o segredo anterior
  UPDATE public.pdv_dispositivos SET ativo = false, revogado_em = now()
   WHERE device_fingerprint = v_fp AND ativo;
  v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.pdv_dispositivos (empresa_id, loja_id, device_fingerprint, sync_secret, nome)
  VALUES (c.empresa_id, c.loja_id, v_fp, v_secret, nullif(btrim(p_nome), ''))
  RETURNING id INTO v_dev;
  UPDATE public.pdv_codigos_ativacao SET usado_em = now(), dispositivo_id = v_dev WHERE id = c.id;
  RETURN jsonb_build_object('dispositivo_id', v_dev, 'loja_id', c.loja_id, 'empresa_id', c.empresa_id,
                            'device_fingerprint', v_fp, 'sync_key', v_secret);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Provisionamento atômico (plataforma). Usuários do Auth são criados pelo
--    servidor ANTES (Admin API) e enviados por id; tudo o mais numa transação.
-- p := {
--   "empresa": {"nome","razao_social?","cnpj?","plano?","max_lojas?","max_usuarios?"},
--   "lojas":   [{"chave":"L1","nome","codigo?"}],
--   "usuarios":[{"id","nome","idioma?","papel":"DONO|GERENTE|OPERADOR","lojas":["L1",...]}]
-- }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plataforma_provisionar_empresa(p jsonb, p_ator uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_emp uuid;
  v_loja jsonb; v_usr jsonb; v_chave text;
  v_lojas jsonb := '{}'::jsonb;
  v_loja_id uuid; v_codigo text; v_papel text; v_primeira uuid;
  v_max_lojas int; v_max_usuarios int; n int;
  v_donos int := 0;
BEGIN
  IF p IS NULL OR jsonb_typeof(p->'empresa') <> 'object' OR jsonb_typeof(p->'lojas') <> 'array'
     OR jsonb_typeof(p->'usuarios') <> 'array' THEN
    RAISE EXCEPTION 'PROVISIONAR_PAYLOAD_INVALIDO';
  END IF;
  n := jsonb_array_length(p->'lojas');
  IF n < 1 THEN RAISE EXCEPTION 'PROVISIONAR_SEM_LOJA'; END IF;
  v_max_lojas := nullif(p->'empresa'->>'max_lojas', '')::int;
  v_max_usuarios := nullif(p->'empresa'->>'max_usuarios', '')::int;
  IF v_max_lojas IS NOT NULL AND n > v_max_lojas THEN RAISE EXCEPTION 'PROVISIONAR_LIMITE_LOJAS'; END IF;
  IF v_max_usuarios IS NOT NULL AND jsonb_array_length(p->'usuarios') > v_max_usuarios THEN
    RAISE EXCEPTION 'PROVISIONAR_LIMITE_USUARIOS';
  END IF;

  INSERT INTO public.empresas (nome, razao_social, cnpj, plano, max_lojas, max_usuarios)
  VALUES (btrim(p->'empresa'->>'nome'), nullif(btrim(p->'empresa'->>'razao_social'), ''),
          nullif(regexp_replace(coalesce(p->'empresa'->>'cnpj', ''), '[^0-9]', '', 'g'), ''),
          coalesce(nullif(p->'empresa'->>'plano', ''), 'PILOTO'), v_max_lojas, v_max_usuarios)
  RETURNING id INTO v_emp;

  FOR v_loja IN SELECT * FROM jsonb_array_elements(p->'lojas') LOOP
    v_chave := coalesce(nullif(v_loja->>'chave', ''), v_loja->>'nome');
    IF v_lojas ? v_chave THEN RAISE EXCEPTION 'PROVISIONAR_LOJA_DUPLICADA'; END IF;
    v_codigo := upper(nullif(btrim(v_loja->>'codigo'), ''));
    -- código global ainda é UNIQUE (D11): prefixa com o início do id da empresa em caso de colisão.
    IF v_codigo IS NOT NULL AND EXISTS (SELECT 1 FROM public.lojas WHERE codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || upper(left(replace(v_emp::text, '-', ''), 6));
    END IF;
    INSERT INTO public.lojas (nome, codigo, ativo, empresa_id)
    VALUES (btrim(v_loja->>'nome'), v_codigo, true, v_emp)
    RETURNING id INTO v_loja_id;
    v_lojas := v_lojas || jsonb_build_object(v_chave, v_loja_id);
  END LOOP;

  FOR v_usr IN SELECT * FROM jsonb_array_elements(p->'usuarios') LOOP
    v_papel := v_usr->>'papel';
    IF v_papel NOT IN ('DONO', 'GERENTE', 'OPERADOR') THEN RAISE EXCEPTION 'PROVISIONAR_PAPEL_INVALIDO'; END IF;
    IF v_papel = 'DONO' THEN
      v_donos := v_donos + 1;
      -- legado: usuarios.loja_id do DONO = primeira loja da empresa
      v_primeira := (v_lojas->>coalesce(nullif(p->'lojas'->0->>'chave', ''), p->'lojas'->0->>'nome'))::uuid;
    ELSE
      IF jsonb_typeof(v_usr->'lojas') <> 'array' OR jsonb_array_length(v_usr->'lojas') < 1 THEN
        RAISE EXCEPTION 'PROVISIONAR_USUARIO_SEM_LOJA';
      END IF;
      IF v_papel = 'OPERADOR' AND jsonb_array_length(v_usr->'lojas') > 1 THEN
        RAISE EXCEPTION 'PROVISIONAR_OPERADOR_UMA_LOJA';
      END IF;
      v_primeira := (v_lojas->>(v_usr->'lojas'->>0))::uuid;
      IF v_primeira IS NULL THEN RAISE EXCEPTION 'PROVISIONAR_LOJA_DESCONHECIDA'; END IF;
    END IF;

    -- usuário já vinculado a outra empresa ⇒ recusa (sessão é de uma empresa, §4/§9)
    IF EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = (v_usr->>'id')::uuid AND ativo AND empresa_id <> v_emp)
       OR EXISTS (SELECT 1 FROM public.usuarios WHERE id = (v_usr->>'id')::uuid AND perfil = 'ADMIN') THEN
      RAISE EXCEPTION 'PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA';
    END IF;

    INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, loja_id, ativo)
    VALUES ((v_usr->>'id')::uuid, btrim(v_usr->>'nome'), v_papel, coalesce(nullif(v_usr->>'idioma', ''), 'pt'), v_primeira, true)
    ON CONFLICT (id) DO UPDATE
      SET nome = EXCLUDED.nome, perfil = EXCLUDED.perfil, idioma_preferido = EXCLUDED.idioma_preferido,
          loja_id = EXCLUDED.loja_id, ativo = true;
    -- trigger criou o vínculo principal; GERENTE multi-loja recebe os demais aqui.
    IF v_papel = 'GERENTE' THEN
      FOR v_chave IN SELECT jsonb_array_elements_text(v_usr->'lojas') LOOP
        v_loja_id := (v_lojas->>v_chave)::uuid;
        IF v_loja_id IS NULL THEN RAISE EXCEPTION 'PROVISIONAR_LOJA_DESCONHECIDA'; END IF;
        INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, created_by)
        VALUES ((v_usr->>'id')::uuid, v_emp, v_loja_id, 'GERENTE', p_ator)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  IF v_donos < 1 THEN RAISE EXCEPTION 'PROVISIONAR_SEM_DONO'; END IF;

  RETURN jsonb_build_object('empresa_id', v_emp, 'lojas', v_lojas);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.plataforma_registrar_codigo_ativacao_pdv(uuid, text, int, uuid)',
    'public.ativar_dispositivo_pdv(text, text, text)',
    'public.plataforma_provisionar_empresa(jsonb, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261019120000', 'multiempresa_fase1_base', ARRAY[$golive_stmt_39ff6ed0bc29$-- 20261019120000_multiempresa_fase1_base.sql
-- Multiempresa Fase 1 (docs/architecture/ESPEC_MULTIEMPRESA_V1.md, etapas 1–4 + protótipo da etapa 7 + D6).
--
-- ADITIVA E REVERSÍVEL. Rollback: backend/supabase/rollback/20261019120000_multiempresa_fase1_base.rollback.sql
--   * cria empresas / usuario_vinculos / plataforma_admins (vazia, D9);
--   * lojas.empresa_id ANULÁVEL (D11/§3) + UNIQUE(id, empresa_id) + UNIQUE(empresa_id, codigo) (global mantida);
--   * backfill Empresa 1 (cliente atual) e vínculos derivados de usuarios (ADMIN sem vínculo, D9);
--   * helpers fp_* (modo compatibilidade ADMIN legado, §6);
--   * trigger usuarios → usuario_vinculos (etapa 4);
--   * guarda RESTRICTIVE só nas 3 tabelas do protótipo (D16): fornecedores, contas_receber, itens_venda;
--   * dispositivos PDV + códigos de ativação (fecha pré-requisitos de D6 para o sync-outbox);
--   * RPC de provisionamento atômico (plataforma, service_role apenas).
-- NÃO altera policies existentes, NÃO remove usuarios.perfil/loja_id, NÃO troca a fonte de verdade (D17).
-- Cliente 1: todas as lojas → Empresa 1; DONO vê todas as lojas da E1 = todas → comportamento equivalente (D10).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DDL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(btrim(nome)) >= 2),
  razao_social text NULL,
  cnpj text NULL CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
  plano text NOT NULL DEFAULT 'PILOTO',
  status text NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'SUSPENSA', 'CANCELADA')),
  vigencia_inicio date NOT NULL DEFAULT current_date,
  vigencia_fim date NULL,
  max_lojas int NULL CHECK (max_lojas IS NULL OR max_lojas > 0),
  max_usuarios int NULL CHECK (max_usuarios IS NULL OR max_usuarios > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS empresas_cnpj_uniq ON public.empresas (cnpj) WHERE cnpj IS NOT NULL;

ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS empresa_id uuid NULL REFERENCES public.empresas(id);
CREATE INDEX IF NOT EXISTS lojas_empresa_id_idx ON public.lojas (empresa_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lojas_id_empresa_uniq') THEN
    ALTER TABLE public.lojas ADD CONSTRAINT lojas_id_empresa_uniq UNIQUE (id, empresa_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lojas_empresa_codigo_uniq') THEN
    ALTER TABLE public.lojas ADD CONSTRAINT lojas_empresa_codigo_uniq UNIQUE (empresa_id, codigo);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.usuario_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  loja_id uuid NULL,
  papel text NOT NULL CHECK (papel IN ('DONO', 'GERENTE', 'OPERADOR')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CONSTRAINT usuario_vinculos_loja_da_empresa_fk
    FOREIGN KEY (loja_id, empresa_id) REFERENCES public.lojas(id, empresa_id),
  CONSTRAINT usuario_vinculos_papel_loja_ck
    CHECK ((papel = 'DONO' AND loja_id IS NULL) OR (papel <> 'DONO' AND loja_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_vinculos_uniq
  ON public.usuario_vinculos (usuario_id, empresa_id, papel, COALESCE(loja_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE UNIQUE INDEX IF NOT EXISTS usuario_vinculos_operador_uma_loja
  ON public.usuario_vinculos (usuario_id, empresa_id) WHERE papel = 'OPERADOR' AND ativo;
CREATE INDEX IF NOT EXISTS usuario_vinculos_usuario_ativo_idx ON public.usuario_vinculos (usuario_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS usuario_vinculos_loja_ativo_idx ON public.usuario_vinculos (loja_id) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.plataforma_admins (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  motivo text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill (Empresa 1 = cliente atual). UUID fixo para rastreabilidade.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.empresas (id, nome, plano, status, vigencia_inicio)
SELECT 'e0000001-0000-4000-8000-000000000001'::uuid, 'Empresa 1 (cliente piloto)', 'PILOTO', 'ATIVA', current_date
WHERE EXISTS (SELECT 1 FROM public.lojas)
ON CONFLICT (id) DO NOTHING;

UPDATE public.lojas
   SET empresa_id = 'e0000001-0000-4000-8000-000000000001'::uuid
 WHERE empresa_id IS NULL
   AND EXISTS (SELECT 1 FROM public.empresas WHERE id = 'e0000001-0000-4000-8000-000000000001'::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Helpers fp_* (§6). Contexto ausente ⇒ false / vazio. Nunca MATRIZ.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fp_usuario_ativo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT u.ativo FROM public.usuarios u WHERE u.id = (SELECT auth.uid())), false);
$$;

CREATE OR REPLACE FUNCTION public.fp_eh_plataforma()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plataforma_admins p
    JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE p.usuario_id = (SELECT auth.uid()) AND p.ativo AND u.ativo
  );
$$;

CREATE OR REPLACE FUNCTION public.fp_empresas_do_usuario()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT v.empresa_id
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE v.usuario_id = (SELECT auth.uid()) AND v.ativo AND u.ativo;
$$;

-- usada na policy de usuario_vinculos (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.fp_empresas_do_usuario_como_dono()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT v.empresa_id
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE v.usuario_id = (SELECT auth.uid()) AND v.ativo AND u.ativo AND v.papel = 'DONO';
$$;

CREATE OR REPLACE FUNCTION public.fp_lojas_permitidas(p_papeis text[] DEFAULT NULL)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.id
    FROM public.usuario_vinculos v
    JOIN public.usuarios u ON u.id = v.usuario_id AND u.ativo
    JOIN public.lojas l ON l.empresa_id = v.empresa_id AND (v.papel = 'DONO' OR l.id = v.loja_id)
   WHERE v.usuario_id = (SELECT auth.uid())
     AND v.ativo
     AND (p_papeis IS NULL OR v.papel = ANY (p_papeis));
$$;

-- Modo compatibilidade (Fases 1–5): ADMIN legado (usuarios.perfil = 'ADMIN', ativo) mantém escopo global.
-- Remoção = um CREATE OR REPLACE na Fase "Corte ADMIN" (§6).
CREATE OR REPLACE FUNCTION public.fp_pode_loja(p_loja uuid, p_papeis text[] DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_loja IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.fp_lojas_permitidas(p_papeis) x WHERE x = p_loja)
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = (SELECT auth.uid()) AND u.ativo AND u.perfil = 'ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION public.fp_empresa_da_loja(p_loja uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.empresa_id FROM public.lojas l WHERE l.id = p_loja;
$$;

CREATE OR REPLACE FUNCTION public.fp_mesma_empresa(p_loja_a uuid, p_loja_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((
    SELECT a.empresa_id IS NOT NULL AND a.empresa_id = b.empresa_id
      FROM public.lojas a, public.lojas b
     WHERE a.id = p_loja_a AND b.id = p_loja_b
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.fp_empresa_operacional(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((
    SELECT e.status = 'ATIVA'
       AND e.vigencia_inicio <= current_date
       AND (e.vigencia_fim IS NULL OR e.vigencia_fim >= current_date)
      FROM public.empresas e WHERE e.id = p_empresa
  ), false);
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.fp_usuario_ativo()', 'public.fp_eh_plataforma()', 'public.fp_empresas_do_usuario()',
    'public.fp_empresas_do_usuario_como_dono()',
    'public.fp_lojas_permitidas(text[])', 'public.fp_pode_loja(uuid, text[])',
    'public.fp_empresa_da_loja(uuid)', 'public.fp_mesma_empresa(uuid, uuid)',
    'public.fp_empresa_operacional(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Vínculos a partir de usuarios + trigger de sincronização legada (etapa 4)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION internal.fp_sync_vinculo_legado(p_usuario uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u record;
  v_empresa uuid;
BEGIN
  SELECT id, perfil, loja_id INTO u FROM public.usuarios WHERE id = p_usuario;
  IF NOT FOUND OR u.perfil NOT IN ('DONO', 'GERENTE', 'OPERADOR') OR u.loja_id IS NULL THEN
    RETURN; -- ADMIN e usuários sem loja: sem vínculo (D9 / fail closed)
  END IF;
  SELECT empresa_id INTO v_empresa FROM public.lojas WHERE id = u.loja_id;
  IF v_empresa IS NULL THEN
    RETURN; -- loja sem empresa: fail closed (D18)
  END IF;
  -- vínculo "principal" derivado; vínculos extras (GERENTE multi-loja) criados por RPC não são tocados.
  IF u.perfil = 'OPERADOR' THEN
    UPDATE public.usuario_vinculos SET ativo = false
     WHERE usuario_id = u.id AND empresa_id = v_empresa AND papel = 'OPERADOR' AND loja_id <> u.loja_id AND ativo;
  END IF;
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
  VALUES (u.id, v_empresa, CASE WHEN u.perfil = 'DONO' THEN NULL ELSE u.loja_id END, u.perfil, true)
  ON CONFLICT (usuario_id, empresa_id, papel, COALESCE(loja_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET ativo = true;
END $$;
REVOKE ALL ON FUNCTION internal.fp_sync_vinculo_legado(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION internal.tg_usuarios_sync_vinculo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.perfil IS DISTINCT FROM OLD.perfil
     OR NEW.loja_id IS DISTINCT FROM OLD.loja_id THEN
    IF TG_OP = 'UPDATE' AND NEW.perfil IS DISTINCT FROM OLD.perfil THEN
      -- papel mudou: o vínculo derivado do papel antigo deixa de valer.
      UPDATE public.usuario_vinculos SET ativo = false
       WHERE usuario_id = NEW.id AND papel = OLD.perfil AND ativo;
    END IF;
    PERFORM internal.fp_sync_vinculo_legado(NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal.tg_usuarios_sync_vinculo() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_usuarios_sync_vinculo ON public.usuarios;
CREATE TRIGGER trg_usuarios_sync_vinculo
  AFTER INSERT OR UPDATE OF perfil, loja_id ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION internal.tg_usuarios_sync_vinculo();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.usuarios LOOP
    PERFORM internal.fp_sync_vinculo_legado(r.id);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS das tabelas novas (leitura: próprio + DONO da empresa; escrita só servidor)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plataforma_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.empresas, public.usuario_vinculos, public.plataforma_admins FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.empresas, public.usuario_vinculos, public.plataforma_admins FROM authenticated;
GRANT SELECT ON public.empresas, public.usuario_vinculos TO authenticated;

DROP POLICY IF EXISTS empresas_select_vinculo ON public.empresas;
CREATE POLICY empresas_select_vinculo ON public.empresas FOR SELECT TO authenticated
  USING (id IN (SELECT public.fp_empresas_do_usuario()));

DROP POLICY IF EXISTS usuario_vinculos_select ON public.usuario_vinculos;
CREATE POLICY usuario_vinculos_select ON public.usuario_vinculos FOR SELECT TO authenticated
  USING (
    usuario_id = (SELECT auth.uid())
    OR empresa_id IN (SELECT public.fp_empresas_do_usuario_como_dono())
  );
-- plataforma_admins: sem policy para authenticated (somente service_role).

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Guarda RESTRICTIVE — protótipo D16 (3 tabelas). Reversível: DROP POLICY tenant_guard.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_guard ON public.fornecedores;
CREATE POLICY tenant_guard ON public.fornecedores AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.fp_pode_loja(loja_id, NULL)))
  WITH CHECK ((SELECT public.fp_pode_loja(loja_id, NULL)));

DROP POLICY IF EXISTS tenant_guard ON public.contas_receber;
CREATE POLICY tenant_guard ON public.contas_receber AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.fp_pode_loja(loja_id, NULL)))
  WITH CHECK ((SELECT public.fp_pode_loja(loja_id, NULL)));

DROP POLICY IF EXISTS tenant_guard ON public.itens_venda;
CREATE POLICY tenant_guard ON public.itens_venda AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
     WHERE v.id = itens_venda.venda_id AND public.fp_pode_loja(c.loja_id, NULL)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id
     WHERE v.id = itens_venda.venda_id AND public.fp_pode_loja(c.loja_id, NULL)));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Dispositivos PDV (desktop) + códigos de ativação. Somente service_role.
--    Código canônico = só [A-Z0-9] maiúsculo (hífens/espaços ignorados); banco guarda sha256 hex.
--    Substitui a SYNC_KEY global do .env do cliente por segredo POR DISPOSITIVO,
--    amarrado a UMA loja no servidor (pré-requisito D6 / §11).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pdv_dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  loja_id uuid NOT NULL,
  device_fingerprint text NOT NULL CHECK (length(device_fingerprint) BETWEEN 3 AND 200),
  sync_secret text NOT NULL CHECK (length(sync_secret) >= 48),
  nome text NULL,
  ativo boolean NOT NULL DEFAULT true,
  ativado_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz NULL,
  ultimo_sync_em timestamptz NULL,
  CONSTRAINT pdv_dispositivos_loja_empresa_fk FOREIGN KEY (loja_id, empresa_id) REFERENCES public.lojas(id, empresa_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pdv_dispositivos_fingerprint_ativo
  ON public.pdv_dispositivos (device_fingerprint) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.pdv_codigos_ativacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_hash text NOT NULL UNIQUE CHECK (codigo_hash ~ '^[0-9a-f]{64}$'),
  empresa_id uuid NOT NULL,
  loja_id uuid NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz NULL,
  dispositivo_id uuid NULL REFERENCES public.pdv_dispositivos(id),
  criado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_codigos_loja_empresa_fk FOREIGN KEY (loja_id, empresa_id) REFERENCES public.lojas(id, empresa_id)
);

ALTER TABLE public.pdv_dispositivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_codigos_ativacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_dispositivos, public.pdv_codigos_ativacao FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pdv_dispositivos, public.pdv_codigos_ativacao TO service_role;

CREATE OR REPLACE FUNCTION public.plataforma_registrar_codigo_ativacao_pdv(
  p_loja_id uuid, p_codigo_hash text, p_validade_horas int DEFAULT 24, p_criado_por uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_empresa uuid; v_id uuid; v_exp timestamptz;
BEGIN
  SELECT empresa_id INTO v_empresa FROM public.lojas WHERE id = p_loja_id AND ativo;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'ATIVACAO_PDV_LOJA_INVALIDA'; END IF;
  IF NOT public.fp_empresa_operacional(v_empresa) THEN RAISE EXCEPTION 'EMPRESA_NAO_OPERACIONAL'; END IF;
  IF p_validade_horas IS NULL OR p_validade_horas < 1 OR p_validade_horas > 168 THEN
    RAISE EXCEPTION 'ATIVACAO_PDV_VALIDADE_INVALIDA';
  END IF;
  v_exp := now() + make_interval(hours => p_validade_horas);
  INSERT INTO public.pdv_codigos_ativacao (codigo_hash, empresa_id, loja_id, expira_em, criado_por)
  VALUES (lower(p_codigo_hash), v_empresa, p_loja_id, v_exp, p_criado_por)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'loja_id', p_loja_id, 'empresa_id', v_empresa, 'expira_em', v_exp);
END $$;

CREATE OR REPLACE FUNCTION public.ativar_dispositivo_pdv(p_codigo text, p_device_fingerprint text, p_nome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c record;
  v_fp text := lower(btrim(coalesce(p_device_fingerprint, '')));
  v_secret text;
  v_dev uuid;
BEGIN
  IF length(v_fp) < 3 OR length(v_fp) > 200 THEN RAISE EXCEPTION 'ATIVACAO_PDV_FINGERPRINT_INVALIDO'; END IF;
  SELECT * INTO c FROM public.pdv_codigos_ativacao
   WHERE codigo_hash = encode(sha256(convert_to(regexp_replace(upper(coalesce(p_codigo, '')), '[^A-Z0-9]', '', 'g'), 'UTF8')), 'hex')
   FOR UPDATE;
  IF NOT FOUND OR c.usado_em IS NOT NULL OR c.expira_em < now() THEN
    RAISE EXCEPTION 'ATIVACAO_PDV_CODIGO_INVALIDO'; -- mesma resposta para inexistente/usado/expirado
  END IF;
  IF NOT public.fp_empresa_operacional(c.empresa_id) THEN RAISE EXCEPTION 'EMPRESA_NAO_OPERACIONAL'; END IF;
  -- reativação do mesmo computador revoga o segredo anterior
  UPDATE public.pdv_dispositivos SET ativo = false, revogado_em = now()
   WHERE device_fingerprint = v_fp AND ativo;
  v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.pdv_dispositivos (empresa_id, loja_id, device_fingerprint, sync_secret, nome)
  VALUES (c.empresa_id, c.loja_id, v_fp, v_secret, nullif(btrim(p_nome), ''))
  RETURNING id INTO v_dev;
  UPDATE public.pdv_codigos_ativacao SET usado_em = now(), dispositivo_id = v_dev WHERE id = c.id;
  RETURN jsonb_build_object('dispositivo_id', v_dev, 'loja_id', c.loja_id, 'empresa_id', c.empresa_id,
                            'device_fingerprint', v_fp, 'sync_key', v_secret);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Provisionamento atômico (plataforma). Usuários do Auth são criados pelo
--    servidor ANTES (Admin API) e enviados por id; tudo o mais numa transação.
-- p := {
--   "empresa": {"nome","razao_social?","cnpj?","plano?","max_lojas?","max_usuarios?"},
--   "lojas":   [{"chave":"L1","nome","codigo?"}],
--   "usuarios":[{"id","nome","idioma?","papel":"DONO|GERENTE|OPERADOR","lojas":["L1",...]}]
-- }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plataforma_provisionar_empresa(p jsonb, p_ator uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_emp uuid;
  v_loja jsonb; v_usr jsonb; v_chave text;
  v_lojas jsonb := '{}'::jsonb;
  v_loja_id uuid; v_codigo text; v_papel text; v_primeira uuid;
  v_max_lojas int; v_max_usuarios int; n int;
  v_donos int := 0;
BEGIN
  IF p IS NULL OR jsonb_typeof(p->'empresa') <> 'object' OR jsonb_typeof(p->'lojas') <> 'array'
     OR jsonb_typeof(p->'usuarios') <> 'array' THEN
    RAISE EXCEPTION 'PROVISIONAR_PAYLOAD_INVALIDO';
  END IF;
  n := jsonb_array_length(p->'lojas');
  IF n < 1 THEN RAISE EXCEPTION 'PROVISIONAR_SEM_LOJA'; END IF;
  v_max_lojas := nullif(p->'empresa'->>'max_lojas', '')::int;
  v_max_usuarios := nullif(p->'empresa'->>'max_usuarios', '')::int;
  IF v_max_lojas IS NOT NULL AND n > v_max_lojas THEN RAISE EXCEPTION 'PROVISIONAR_LIMITE_LOJAS'; END IF;
  IF v_max_usuarios IS NOT NULL AND jsonb_array_length(p->'usuarios') > v_max_usuarios THEN
    RAISE EXCEPTION 'PROVISIONAR_LIMITE_USUARIOS';
  END IF;

  INSERT INTO public.empresas (nome, razao_social, cnpj, plano, max_lojas, max_usuarios)
  VALUES (btrim(p->'empresa'->>'nome'), nullif(btrim(p->'empresa'->>'razao_social'), ''),
          nullif(regexp_replace(coalesce(p->'empresa'->>'cnpj', ''), '[^0-9]', '', 'g'), ''),
          coalesce(nullif(p->'empresa'->>'plano', ''), 'PILOTO'), v_max_lojas, v_max_usuarios)
  RETURNING id INTO v_emp;

  FOR v_loja IN SELECT * FROM jsonb_array_elements(p->'lojas') LOOP
    v_chave := coalesce(nullif(v_loja->>'chave', ''), v_loja->>'nome');
    IF v_lojas ? v_chave THEN RAISE EXCEPTION 'PROVISIONAR_LOJA_DUPLICADA'; END IF;
    v_codigo := upper(nullif(btrim(v_loja->>'codigo'), ''));
    -- código global ainda é UNIQUE (D11): prefixa com o início do id da empresa em caso de colisão.
    IF v_codigo IS NOT NULL AND EXISTS (SELECT 1 FROM public.lojas WHERE codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || upper(left(replace(v_emp::text, '-', ''), 6));
    END IF;
    INSERT INTO public.lojas (nome, codigo, ativo, empresa_id)
    VALUES (btrim(v_loja->>'nome'), v_codigo, true, v_emp)
    RETURNING id INTO v_loja_id;
    v_lojas := v_lojas || jsonb_build_object(v_chave, v_loja_id);
  END LOOP;

  FOR v_usr IN SELECT * FROM jsonb_array_elements(p->'usuarios') LOOP
    v_papel := v_usr->>'papel';
    IF v_papel NOT IN ('DONO', 'GERENTE', 'OPERADOR') THEN RAISE EXCEPTION 'PROVISIONAR_PAPEL_INVALIDO'; END IF;
    IF v_papel = 'DONO' THEN
      v_donos := v_donos + 1;
      -- legado: usuarios.loja_id do DONO = primeira loja da empresa
      v_primeira := (v_lojas->>coalesce(nullif(p->'lojas'->0->>'chave', ''), p->'lojas'->0->>'nome'))::uuid;
    ELSE
      IF jsonb_typeof(v_usr->'lojas') <> 'array' OR jsonb_array_length(v_usr->'lojas') < 1 THEN
        RAISE EXCEPTION 'PROVISIONAR_USUARIO_SEM_LOJA';
      END IF;
      IF v_papel = 'OPERADOR' AND jsonb_array_length(v_usr->'lojas') > 1 THEN
        RAISE EXCEPTION 'PROVISIONAR_OPERADOR_UMA_LOJA';
      END IF;
      v_primeira := (v_lojas->>(v_usr->'lojas'->>0))::uuid;
      IF v_primeira IS NULL THEN RAISE EXCEPTION 'PROVISIONAR_LOJA_DESCONHECIDA'; END IF;
    END IF;

    -- usuário já vinculado a outra empresa ⇒ recusa (sessão é de uma empresa, §4/§9)
    IF EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = (v_usr->>'id')::uuid AND ativo AND empresa_id <> v_emp)
       OR EXISTS (SELECT 1 FROM public.usuarios WHERE id = (v_usr->>'id')::uuid AND perfil = 'ADMIN') THEN
      RAISE EXCEPTION 'PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA';
    END IF;

    INSERT INTO public.usuarios (id, nome, perfil, idioma_preferido, loja_id, ativo)
    VALUES ((v_usr->>'id')::uuid, btrim(v_usr->>'nome'), v_papel, coalesce(nullif(v_usr->>'idioma', ''), 'pt'), v_primeira, true)
    ON CONFLICT (id) DO UPDATE
      SET nome = EXCLUDED.nome, perfil = EXCLUDED.perfil, idioma_preferido = EXCLUDED.idioma_preferido,
          loja_id = EXCLUDED.loja_id, ativo = true;
    -- trigger criou o vínculo principal; GERENTE multi-loja recebe os demais aqui.
    IF v_papel = 'GERENTE' THEN
      FOR v_chave IN SELECT jsonb_array_elements_text(v_usr->'lojas') LOOP
        v_loja_id := (v_lojas->>v_chave)::uuid;
        IF v_loja_id IS NULL THEN RAISE EXCEPTION 'PROVISIONAR_LOJA_DESCONHECIDA'; END IF;
        INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, created_by)
        VALUES ((v_usr->>'id')::uuid, v_emp, v_loja_id, 'GERENTE', p_ator)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  IF v_donos < 1 THEN RAISE EXCEPTION 'PROVISIONAR_SEM_DONO'; END IF;

  RETURN jsonb_build_object('empresa_id', v_emp, 'lojas', v_lojas);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.plataforma_registrar_codigo_ativacao_pdv(uuid, text, int, uuid)',
    'public.ativar_dispositivo_pdv(text, text, text)',
    'public.plataforma_provisionar_empresa(jsonb, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;
$golive_stmt_39ff6ed0bc29$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:268:d91380e73abcf09a1086cba6e9aa094eitens_venda:266:db402eee5f6d7957110757600882edccvendas_pagamentos:201:3432d6d312e6f6f24ea9612a7257e235caixas:58:1b639b4221cdfaf9bfcc3ebf5660fbedmovimentacoes_caixa:0:-estoque:158:061c9e8da8142a531eb8d0728e3b4b15produtos:161:8fba5ff547239f94467b7a2126222120usuarios:13:2acdeaaf217d2571a434f8e8ff767aa2clientes:0:-lojas:4:812269b5692f7006f88ec49b088e9c36formas_pagamento:16:c1bbdbff97007016877776ad56afcccccontas_financeiras:0:-contas_pagar:2:2567d13b490befeaf7cc8bf48d01cfe1contas_receber:0:-pdv_config:1:899f43bdba711cfddea47afd00c8b21adocumentos_fiscais_pendentes:0:-totais:528f99d0e010f11ef321f548d3a7b51c|0|0|0|0|20.000;7ab49c7a91a109170b7e57fef3243a59|2|100.00|0|100.00|0.000;86641fb0d5893caebab1d0b38f0ef759|0|0|0|0|0;b5381bb6313900060b277d41cd1d490c|266|49013.80|38569.80|6500.00|284546.000$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261019120000: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261019120000', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261019120000' AND name='multiempresa_fase1_base') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261019120000'; END IF;
END $chk$;
COMMIT;
