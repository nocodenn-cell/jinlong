-- ============================================================================
-- Multiempresa — Fase 1 (ADITIVA). Especificação: docs/architecture/ESPEC_MULTIEMPRESA_V1.md
--
-- O que faz:
--   * cria `empresas`, `usuario_vinculos`, `plataforma_admins`;
--   * adiciona `lojas.empresa_id` (ANULÁVEL nesta fase) + UNIQUE (id, empresa_id)
--     + UNIQUE (empresa_id, codigo).
--
-- O que NÃO faz (D17):
--   * não altera nenhuma policy, RPC, view ou trigger existente;
--   * não remove nem altera `usuarios.perfil` / `usuarios.loja_id`;
--   * não troca a fonte de verdade operacional (continua `usuarios`);
--   * não faz backfill (scripts separados em backend/supabase/scripts/multiempresa_fase1/);
--   * não remove `lojas_codigo_key` (UNIQUE global) — ver D11;
--   * não torna `lojas.empresa_id` NOT NULL (provisionamento ainda cria loja sem empresa).
--
-- Exposição: as 3 tabelas novas ficam com RLS habilitada, SEM policies e sem
-- privilégios para anon/authenticated (o default ACL do schema concederia).
-- Só service_role/postgres acessam até a Fase 2 (helpers fp_*).
--
-- Reversão: backend/supabase/scripts/multiempresa_fase1/90_rollback_migration.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) empresas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empresas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text        NOT NULL CHECK (length(btrim(nome)) > 0),
  razao_social     text        NULL,
  cnpj             text        NULL CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
  plano            text        NOT NULL DEFAULT 'PADRAO' CHECK (length(btrim(plano)) > 0),
  status           text        NOT NULL DEFAULT 'ATIVA'
                               CHECK (status IN ('ATIVA', 'SUSPENSA', 'CANCELADA')),
  vigencia_inicio  date        NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim     date        NULL,
  max_lojas        integer     NULL CHECK (max_lojas IS NULL OR max_lojas > 0),
  max_usuarios     integer     NULL CHECK (max_usuarios IS NULL OR max_usuarios > 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_vigencia_chk CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_cnpj
  ON public.empresas (cnpj) WHERE cnpj IS NOT NULL;

DROP TRIGGER IF EXISTS empresas_updated_at ON public.empresas;
CREATE TRIGGER empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.empresas IS
  'Tenant (cliente) do Jinlong. Licença (plano/status/vigência/limites) NÃO participa da autorização de escopo. Fase 1 multiempresa.';

-- ---------------------------------------------------------------------------
-- 2) lojas.empresa_id (anulável nesta fase)
-- ---------------------------------------------------------------------------
ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS empresa_id uuid NULL REFERENCES public.empresas (id);

CREATE INDEX IF NOT EXISTS idx_lojas_empresa_id ON public.lojas (empresa_id);

-- Alvo de FK composta: garante que a loja de um vínculo pertence à empresa do vínculo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.lojas'::regclass AND conname = 'lojas_id_empresa_key') THEN
    ALTER TABLE public.lojas ADD CONSTRAINT lojas_id_empresa_key UNIQUE (id, empresa_id);
  END IF;
  -- D11: código único dentro da empresa. A UNIQUE global `lojas_codigo_key`
  -- continua existindo até `provisionamento` filtrar por empresa.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.lojas'::regclass AND conname = 'lojas_empresa_codigo_key') THEN
    ALTER TABLE public.lojas ADD CONSTRAINT lojas_empresa_codigo_key UNIQUE (empresa_id, codigo);
  END IF;
END
$$;

COMMENT ON COLUMN public.lojas.empresa_id IS
  'Empresa dona da loja. Anulável só durante a transição (Fase 1); NOT NULL quando a criação de loja gravar a empresa.';

-- ---------------------------------------------------------------------------
-- 3) usuario_vinculos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuario_vinculos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid        NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  empresa_id  uuid        NOT NULL REFERENCES public.empresas (id),
  loja_id     uuid        NULL,
  papel       text        NOT NULL CHECK (papel IN ('DONO', 'GERENTE', 'OPERADOR')),
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        NULL,
  CONSTRAINT usuario_vinculos_loja_da_empresa_fkey
    FOREIGN KEY (loja_id, empresa_id) REFERENCES public.lojas (id, empresa_id),
  CONSTRAINT usuario_vinculos_escopo_papel_chk CHECK (
    (papel = 'DONO' AND loja_id IS NULL) OR (papel <> 'DONO' AND loja_id IS NOT NULL)
  )
);

-- Mesmo vínculo não se repete (DONO tem loja_id NULL: NULLS NOT DISTINCT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_vinculos_unico
  ON public.usuario_vinculos (usuario_id, empresa_id, papel, loja_id) NULLS NOT DISTINCT;

-- OPERADOR: no máximo 1 loja ativa por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_vinculos_operador_uma_loja
  ON public.usuario_vinculos (usuario_id, empresa_id)
  WHERE papel = 'OPERADOR' AND ativo;

CREATE INDEX IF NOT EXISTS idx_usuario_vinculos_usuario_ativo
  ON public.usuario_vinculos (usuario_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_usuario_vinculos_loja_ativo
  ON public.usuario_vinculos (loja_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_usuario_vinculos_empresa
  ON public.usuario_vinculos (empresa_id);

COMMENT ON TABLE public.usuario_vinculos IS
  'Autorização: usuário → empresa/loja → papel. DONO: loja_id NULL (empresa toda). GERENTE: 1+ linhas. OPERADOR: 1 loja ativa por empresa. ADMIN não tem vínculo (plataforma_admins). Fase 1: não é lido por nenhuma policy/RPC.';

-- ---------------------------------------------------------------------------
-- 4) plataforma_admins (criada vazia — D9: ADMIN legado não é promovido)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plataforma_admins (
  usuario_id  uuid        PRIMARY KEY REFERENCES public.usuarios (id) ON DELETE CASCADE,
  ativo       boolean     NOT NULL DEFAULT true,
  motivo      text        NOT NULL CHECK (length(btrim(motivo)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        NULL
);

COMMENT ON TABLE public.plataforma_admins IS
  'Equipe da plataforma Jinlong. NÃO concede acesso a dados de clientes via RLS. Criada vazia na Fase 1.';

-- ---------------------------------------------------------------------------
-- 5) Exposição: RLS ligada, nenhuma policy, sem grants para a API pública
-- ---------------------------------------------------------------------------
ALTER TABLE public.empresas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_vinculos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plataforma_admins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.empresas, public.usuario_vinculos, public.plataforma_admins
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.empresas, public.usuario_vinculos, public.plataforma_admins
  TO service_role;

COMMIT;
