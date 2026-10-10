-- ============================================================================
-- M1 — Fundação multiempresa (ESPEC_MULTIEMPRESA_V1 §2–§6, §4 e módulos).
--
-- ADITIVA E REVERSÍVEL. Expand-and-contract:
--   * não remove nem renomeia nenhuma coluna legada (usuarios.perfil, usuarios.loja_id);
--   * não altera nenhuma policy existente;
--   * não altera nenhuma RPC existente;
--   * não cria nenhuma linha de negócio (empresas e vínculos são preenchidos pelo
--     backfill, em migration separada e idempotente);
--   * lojas.empresa_id permanece ANULÁVEL: provisionamento (ensureLoja) e a tela de
--     configurações ainda criam lojas sem empresa. NOT NULL só depois da compatibilidade.
--
-- Helpers fp_* são introduzidos SEM uso por nenhuma policy ou RPC existente: não
-- ampliam permissões. O modo de compatibilidade de ADMIN (ESPEC §6) reproduz o ramo
-- global legado, sem promover ninguém a administrador de plataforma.
--
-- Rollback: ver docs/import-intelligence/12-M1-MULTIEMPRESA.md §Rollback.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. empresas (ESPEC §2)
-- CNPJ é opcional. Nada de CNPJ fictício: a empresa legada nasce sem CNPJ.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empresas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text        NOT NULL CHECK (length(btrim(nome)) > 0),
  razao_social     text,
  cnpj             text        CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
  origem           text        NOT NULL DEFAULT 'CADASTRO' CHECK (origem IN ('LEGADA_M1', 'CADASTRO')),
  status           text        NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'SUSPENSA', 'CANCELADA')),
  vigencia_inicio  date        NOT NULL DEFAULT current_date,
  vigencia_fim     date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_vigencia_check CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

COMMENT ON TABLE public.empresas IS
  'M1 (ESPEC §2). Cliente contratante do SaaS: uma empresa pode ter vários estabelecimentos (lojas). '
  'NÃO representa, por si só, um grupo de CNPJs independentes. Status e vigência são licença: não participam da autorização de escopo.';

CREATE UNIQUE INDEX IF NOT EXISTS empresas_cnpj_unique
  ON public.empresas (cnpj) WHERE cnpj IS NOT NULL;

-- Exatamente uma empresa legada (backfill). Garante idempotência do backfill.
CREATE UNIQUE INDEX IF NOT EXISTS empresas_unica_legada
  ON public.empresas ((origem)) WHERE origem = 'LEGADA_M1';

-- ----------------------------------------------------------------------------
-- 2. lojas.empresa_id (ESPEC §3) — ANULÁVEL nesta migration.
-- UNIQUE (id, empresa_id) permite FK composta a partir de usuario_vinculos.
-- ----------------------------------------------------------------------------
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id);

CREATE INDEX IF NOT EXISTS lojas_empresa_id_idx ON public.lojas (empresa_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lojas_id_empresa_key') THEN
    ALTER TABLE public.lojas ADD CONSTRAINT lojas_id_empresa_key UNIQUE (id, empresa_id);
  END IF;
END $$;

COMMENT ON COLUMN public.lojas.empresa_id IS
  'M1 (ESPEC §3). Anulável até todos os fluxos de criação de loja gravarem a empresa. Loja sem empresa é invisível aos helpers fp_* (fail closed).';

-- ----------------------------------------------------------------------------
-- 3. usuario_vinculos (ESPEC §4)
-- Papel e escopo: DONO = empresa inteira (loja_id NULL); GERENTE e OPERADOR = loja.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuario_vinculos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid        NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  empresa_id  uuid        NOT NULL REFERENCES public.empresas (id),
  loja_id     uuid,
  papel       text        NOT NULL CHECK (papel IN ('DONO', 'GERENTE', 'OPERADOR')),
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  -- a loja do vínculo precisa pertencer à empresa do vínculo
  CONSTRAINT usuario_vinculos_loja_empresa_fk
    FOREIGN KEY (loja_id, empresa_id) REFERENCES public.lojas (id, empresa_id),
  CONSTRAINT usuario_vinculos_papel_loja_check
    CHECK ((papel = 'DONO' AND loja_id IS NULL) OR (papel <> 'DONO' AND loja_id IS NOT NULL))
);

-- um vínculo por (usuário, empresa, papel, loja); NULL conta como valor (DONO)
CREATE UNIQUE INDEX IF NOT EXISTS usuario_vinculos_unico
  ON public.usuario_vinculos (usuario_id, empresa_id, papel, loja_id) NULLS NOT DISTINCT;

-- OPERADOR: uma loja por empresa (ESPEC §4)
CREATE UNIQUE INDEX IF NOT EXISTS usuario_vinculos_operador_unico
  ON public.usuario_vinculos (usuario_id, empresa_id) WHERE papel = 'OPERADOR' AND ativo;

CREATE INDEX IF NOT EXISTS usuario_vinculos_usuario_ativo_idx
  ON public.usuario_vinculos (usuario_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS usuario_vinculos_loja_ativo_idx
  ON public.usuario_vinculos (loja_id) WHERE ativo;

COMMENT ON TABLE public.usuario_vinculos IS
  'M1 (ESPEC §4). Fonte de autorização nova. Até o corte (ESPEC etapa 4/11), usuarios.perfil e usuarios.loja_id continuam sendo a fonte legada: esta tabela é preenchida pelo backfill e verificada por fp_divergencias_vinculos_legados().';

-- ----------------------------------------------------------------------------
-- 4. plataforma_admins (ESPEC §4, §5). Criada VAZIA (D9). Nenhum usuário é promovido.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plataforma_admins (
  usuario_id  uuid        PRIMARY KEY REFERENCES public.usuarios (id) ON DELETE CASCADE,
  ativo       boolean     NOT NULL DEFAULT false,
  motivo      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);

COMMENT ON TABLE public.plataforma_admins IS
  'M1 (ESPEC §4, D9). Vazia. Sem grant para authenticated/anon: nenhuma leitura ou escrita direta. ADMIN legado NÃO é promovido.';

-- ----------------------------------------------------------------------------
-- 5. Helpers fp_* (ESPEC §6). Todos: STABLE, SECURITY DEFINER, search_path fixo.
-- Contexto ausente (auth.uid() nulo) ⇒ false / conjunto vazio, nunca fallback.
-- ----------------------------------------------------------------------------

-- Identidade: usuário da sessão existe e está ativo.
CREATE OR REPLACE FUNCTION public.fp_usuario_ativo()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT u.ativo FROM public.usuarios u WHERE u.id = auth.uid()), false)
$$;

-- Ramo de compatibilidade legado (ESPEC §6): ADMIN global enquanto o corte não ocorre.
-- Não é plataforma: não concede nenhuma função de empresa além do que o ADMIN legado já tinha.
CREATE OR REPLACE FUNCTION public.fp_legado_admin_global()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT u.perfil = 'ADMIN' AND u.ativo FROM public.usuarios u WHERE u.id = auth.uid()), false)
$$;

-- Plataforma (D9): só quem está em plataforma_admins ativo. Hoje: ninguém.
CREATE OR REPLACE FUNCTION public.fp_eh_plataforma()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.fp_usuario_ativo() AND EXISTS (
    SELECT 1 FROM public.plataforma_admins p WHERE p.usuario_id = auth.uid() AND p.ativo
  )
$$;

-- Empresas com vínculo ativo do usuário (sem exigir licença).
CREATE OR REPLACE FUNCTION public.fp_empresas_do_usuario()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT v.empresa_id
    FROM public.usuario_vinculos v
   WHERE v.usuario_id = auth.uid() AND v.ativo AND public.fp_usuario_ativo()
$$;

-- Lojas autorizadas. DONO → todas as lojas da empresa do vínculo.
-- GERENTE/OPERADOR → loja do vínculo. p_papeis filtra papéis; NULL = todos.
CREATE OR REPLACE FUNCTION public.fp_lojas_permitidas(p_papeis text[] DEFAULT NULL)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT l.id
    FROM public.usuario_vinculos v
    JOIN public.lojas l ON l.empresa_id = v.empresa_id
   WHERE v.usuario_id = auth.uid() AND v.ativo AND v.papel = 'DONO'
     AND public.fp_usuario_ativo()
     AND (p_papeis IS NULL OR 'DONO' = ANY (p_papeis))
  UNION
  SELECT v.loja_id
    FROM public.usuario_vinculos v
    JOIN public.lojas l ON l.id = v.loja_id AND l.empresa_id = v.empresa_id
   WHERE v.usuario_id = auth.uid() AND v.ativo AND v.papel <> 'DONO'
     AND public.fp_usuario_ativo()
     AND (p_papeis IS NULL OR v.papel = ANY (p_papeis))
$$;

-- Pode agir sobre a loja, com papel informado. Inclui o ramo legado de ADMIN (ESPEC §6).
CREATE OR REPLACE FUNCTION public.fp_pode_loja(p_loja uuid, p_papeis text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND p_loja IS NOT NULL AND (
    p_loja IN (SELECT public.fp_lojas_permitidas(p_papeis))
    OR (public.fp_legado_admin_global() AND EXISTS (SELECT 1 FROM public.lojas l WHERE l.id = p_loja))
  )
$$;

-- Empresa de uma loja (NULL se a loja não tem empresa).
CREATE OR REPLACE FUNCTION public.fp_empresa_da_loja(p_loja uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT l.empresa_id FROM public.lojas l WHERE l.id = p_loja
$$;

-- Duas lojas na mesma empresa, com empresa não nula.
CREATE OR REPLACE FUNCTION public.fp_mesma_empresa(p_loja_a uuid, p_loja_b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.fp_empresa_da_loja(p_loja_a) IS NOT NULL
     AND public.fp_empresa_da_loja(p_loja_a) = public.fp_empresa_da_loja(p_loja_b)
$$;

-- Estado operacional da empresa (licença). Separado do escopo de autorização (ESPEC §2, §6).
CREATE OR REPLACE FUNCTION public.fp_empresa_operacional(p_empresa uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresas e
     WHERE e.id = p_empresa AND e.status = 'ATIVA'
       AND e.vigencia_inicio <= current_date
       AND (e.vigencia_fim IS NULL OR e.vigencia_fim >= current_date)
  )
$$;

-- DONO ativo da empresa.
CREATE OR REPLACE FUNCTION public.fp_eh_dono_da_empresa(p_empresa uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.fp_usuario_ativo() AND EXISTS (
    SELECT 1 FROM public.usuario_vinculos v
     WHERE v.usuario_id = auth.uid() AND v.empresa_id = p_empresa
       AND v.papel = 'DONO' AND v.ativo
  )
$$;

-- Operação protegida sobre uma loja: autorização + empresa operacional.
-- É a porta de ESCRITA recomendada para os caminhos novos (ESPEC §6, "estado operacional").
-- Leitura de histórico não é bloqueada por suspensão.
CREATE OR REPLACE FUNCTION public.fp_pode_operar_loja(p_loja uuid, p_papeis text[] DEFAULT ARRAY['DONO', 'GERENTE', 'OPERADOR'])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.fp_pode_loja(p_loja, p_papeis)
     AND public.fp_empresa_operacional(public.fp_empresa_da_loja(p_loja))
$$;

-- Verificação de equivalência: divergências entre a fonte legada (usuarios) e os vínculos.
-- Uso: backfill, testes e monitoramento. Restrito a service_role (ver grants).
CREATE OR REPLACE FUNCTION public.fp_divergencias_vinculos_legados()
RETURNS TABLE (usuario_id uuid, motivo text, detalhe text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

-- ----------------------------------------------------------------------------
-- 6. Grants e RLS das tabelas e funções novas
-- ----------------------------------------------------------------------------
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plataforma_admins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.empresas, public.usuario_vinculos, public.plataforma_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.empresas, public.usuario_vinculos TO authenticated;
GRANT ALL ON public.empresas, public.usuario_vinculos, public.plataforma_admins TO service_role;
-- plataforma_admins: sem grant para authenticated (nenhuma leitura direta)

DROP POLICY IF EXISTS empresas_leitura_vinculo ON public.empresas;
CREATE POLICY empresas_leitura_vinculo ON public.empresas
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.fp_empresas_do_usuario()));

DROP POLICY IF EXISTS usuario_vinculos_leitura ON public.usuario_vinculos;
CREATE POLICY usuario_vinculos_leitura ON public.usuario_vinculos
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.fp_eh_dono_da_empresa(empresa_id));

-- Helpers: execução para authenticated e service_role; nunca para anon/PUBLIC.
REVOKE ALL ON FUNCTION
  public.fp_usuario_ativo(), public.fp_legado_admin_global(), public.fp_eh_plataforma(),
  public.fp_empresas_do_usuario(), public.fp_lojas_permitidas(text[]), public.fp_pode_loja(uuid, text[]),
  public.fp_empresa_da_loja(uuid), public.fp_mesma_empresa(uuid, uuid), public.fp_empresa_operacional(uuid),
  public.fp_eh_dono_da_empresa(uuid), public.fp_pode_operar_loja(uuid, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fp_usuario_ativo(), public.fp_legado_admin_global(), public.fp_eh_plataforma(),
  public.fp_empresas_do_usuario(), public.fp_lojas_permitidas(text[]), public.fp_pode_loja(uuid, text[]),
  public.fp_empresa_da_loja(uuid), public.fp_mesma_empresa(uuid, uuid), public.fp_empresa_operacional(uuid),
  public.fp_eh_dono_da_empresa(uuid), public.fp_pode_operar_loja(uuid, text[])
  TO authenticated, service_role;

-- Oráculos entre tenants: revelam empresa de uma loja, status de licença de uma empresa,
-- igualdade de empresas e módulos de qualquer empresa. Não podem ser chamados diretamente por
-- authenticated. Continuam para service_role e para os helpers que os usam internamente (owner).
REVOKE EXECUTE ON FUNCTION
  public.fp_empresa_da_loja(uuid), public.fp_mesma_empresa(uuid, uuid), public.fp_empresa_operacional(uuid)
  FROM authenticated;

-- Verificação de divergência: somente service_role (contém dados de todos os usuários).
REVOKE ALL ON FUNCTION public.fp_divergencias_vinculos_legados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fp_divergencias_vinculos_legados() TO service_role;

-- ----------------------------------------------------------------------------
-- 7. Módulo opcional IMPORT_INTELLIGENCE (ETAPA 4 — cadastro mínimo, sem cobrança)
-- Padrão: AUSÊNCIA de linha = desabilitado. Habilitar exige autorização registrada.
-- Não usa feature_flags. Escrita só por service_role (função ops_*).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modulos_catalogo (
  codigo     text        PRIMARY KEY CHECK (codigo ~ '^[A-Z][A-Z_]*$'),
  descricao  text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.modulos_catalogo (codigo, descricao)
VALUES ('IMPORT_INTELLIGENCE', 'Import Intelligence — módulo premium opcional, habilitado por cliente contratante')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.empresa_modulos (
  empresa_id      uuid        NOT NULL REFERENCES public.empresas (id),
  modulo_codigo   text        NOT NULL REFERENCES public.modulos_catalogo (codigo),
  habilitado      boolean     NOT NULL DEFAULT false,
  autorizado_por  text,
  alterado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, modulo_codigo),
  CONSTRAINT empresa_modulos_autorizacao_check
    CHECK (NOT habilitado OR (autorizado_por IS NOT NULL AND length(btrim(autorizado_por)) > 0))
);

CREATE TABLE IF NOT EXISTS public.empresa_modulos_historico (
  id             bigserial   PRIMARY KEY,
  empresa_id     uuid        NOT NULL REFERENCES public.empresas (id),
  modulo_codigo  text        NOT NULL REFERENCES public.modulos_catalogo (codigo),
  acao           text        NOT NULL CHECK (acao IN ('HABILITAR', 'DESABILITAR')),
  autorizado_por text,
  motivo         text        NOT NULL,
  origem         text        NOT NULL,
  registrado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS empresa_modulos_historico_empresa_idx
  ON public.empresa_modulos_historico (empresa_id, modulo_codigo, registrado_em);

-- Histórico é append-only: UPDATE e DELETE são bloqueados (inclusive para service_role).
CREATE OR REPLACE FUNCTION public.trg_empresa_modulos_historico_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'MODULO_HISTORICO_IMUTAVEL: histórico de habilitação é append-only';
END
$$;

DROP TRIGGER IF EXISTS empresa_modulos_historico_imutavel ON public.empresa_modulos_historico;
CREATE TRIGGER empresa_modulos_historico_imutavel
  BEFORE UPDATE OR DELETE ON public.empresa_modulos_historico
  FOR EACH ROW EXECUTE FUNCTION public.trg_empresa_modulos_historico_imutavel();

-- Toda mudança em empresa_modulos gera uma linha de histórico, inclusive escrita direta.
CREATE OR REPLACE FUNCTION public.trg_empresa_modulos_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS empresa_modulos_historico_trg ON public.empresa_modulos;
CREATE TRIGGER empresa_modulos_historico_trg
  AFTER INSERT OR UPDATE ON public.empresa_modulos
  FOR EACH ROW EXECUTE FUNCTION public.trg_empresa_modulos_historico();

-- Habilitado e desabilitado para uma empresa (default: desabilitado).
CREATE OR REPLACE FUNCTION public.fp_modulo_ativo(p_empresa uuid, p_modulo text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.empresa_modulos m
     WHERE m.empresa_id = p_empresa AND m.modulo_codigo = p_modulo AND m.habilitado
  ) AND public.fp_empresa_operacional(p_empresa)
$$;

-- Acesso ao módulo por USUÁRIO: módulo habilitado + vínculo ativo com papel permitido.
-- Sem identidade ⇒ false. Padrão: somente DONO.
CREATE OR REPLACE FUNCTION public.fp_pode_modulo(p_empresa uuid, p_modulo text, p_papeis text[] DEFAULT ARRAY['DONO'])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.fp_usuario_ativo()
     AND EXISTS (
       SELECT 1 FROM public.usuario_vinculos v
        WHERE v.usuario_id = auth.uid() AND v.empresa_id = p_empresa AND v.ativo
          AND v.papel = ANY (p_papeis))
     AND public.fp_modulo_ativo(p_empresa, p_modulo)
$$;

-- Escrita de habilitação: SOMENTE service_role, com autorização comercial registrada.
-- Não há caminho de autoatendimento nem de plataforma (D9 pendente).
CREATE OR REPLACE FUNCTION public.ops_definir_modulo_empresa(
  p_empresa uuid,
  p_modulo text,
  p_habilitado boolean,
  p_autorizado_por text,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.ops_definir_modulo_empresa(uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_definir_modulo_empresa(uuid, text, boolean, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.fp_modulo_ativo(uuid, text), public.fp_pode_modulo(uuid, text, text[]) FROM PUBLIC, anon;
-- fp_modulo_ativo é oráculo de licença de qualquer empresa: só service_role e helpers internos
GRANT EXECUTE ON FUNCTION public.fp_pode_modulo(uuid, text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fp_modulo_ativo(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fp_modulo_ativo(uuid, text) FROM authenticated;

ALTER TABLE public.modulos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_modulos_historico ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.modulos_catalogo, public.empresa_modulos, public.empresa_modulos_historico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.modulos_catalogo TO authenticated;
GRANT SELECT ON public.empresa_modulos, public.empresa_modulos_historico TO authenticated;
GRANT ALL ON public.modulos_catalogo, public.empresa_modulos, public.empresa_modulos_historico TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.empresa_modulos_historico_id_seq TO service_role;

DROP POLICY IF EXISTS modulos_catalogo_leitura ON public.modulos_catalogo;
CREATE POLICY modulos_catalogo_leitura ON public.modulos_catalogo
  FOR SELECT TO authenticated USING (true);

-- Status do módulo visível somente para DONO da empresa.
DROP POLICY IF EXISTS empresa_modulos_leitura_dono ON public.empresa_modulos;
CREATE POLICY empresa_modulos_leitura_dono ON public.empresa_modulos
  FOR SELECT TO authenticated USING (public.fp_eh_dono_da_empresa(empresa_id));

DROP POLICY IF EXISTS empresa_modulos_historico_leitura_dono ON public.empresa_modulos_historico;
CREATE POLICY empresa_modulos_historico_leitura_dono ON public.empresa_modulos_historico
  FOR SELECT TO authenticated USING (public.fp_eh_dono_da_empresa(empresa_id));

COMMIT;
