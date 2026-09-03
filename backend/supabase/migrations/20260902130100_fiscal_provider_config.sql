-- Fase C / Onda C1 (prontidão Focus NFe) — resolução de credencial multiempresa.
--
-- Achado da Fase A (docs/audits/AUDITORIA_PRONTIDAO_FOCUS_NFE_FASE_A.md §1.6)
-- confirmado pela documentação oficial da Focus (colada pelo usuário nesta
-- missão): cada empresa/CNPJ tem SEU PRÓPRIO token na Focus — não existe
-- token único de conta para todas as lojas. Hoje o worker fiscal só conhece
-- `FISCAL_PROVIDER_TOKEN` (uma única variável global), o que não escala para
-- mais de uma loja/empresa.
--
-- Design (condição de aprovação do usuário para a Fase C):
--   * o token da Focus NUNCA é armazenado no Postgres, nunca em `lojas`,
--     nunca no frontend, nunca em log;
--   * esta tabela guarda somente METADADOS/REFERÊNCIA LÓGICA: qual o NOME
--     (não o valor) da variável de ambiente/secret que o fiscal-worker deve
--     ler via `Deno.env.get(token_env_var)` para obter o token real — mesmo
--     mecanismo de secrets já usado hoje para FISCAL_PROVIDER_TOKEN/SYNC_KEY
--     (Supabase Edge Function secrets). Não é um vault novo, é uma
--     convenção de nomes sobre o mecanismo que já existe;
--   * `ambiente` é explícito por linha (não implícito por URL), para que o
--     worker (Onda C2) possa recusar uma combinação loja/ambiente que não
--     bata com o `FISCAL_ENVIRONMENT` da implantação — importante porque
--     hoje existe um único projeto Supabase (não há isolamento físico entre
--     homologação e produção, docs/AMBIENTES_E_RELEASE.md linhas 19-22);
--   * modelada genericamente (`provider_type`, não colunas `focus_*`) para
--     não acoplar o schema ao vocabulário de um único fornecedor.
--
-- GATE DE SEGURANÇA (revisão adicional desta mesma missão) — "secret
-- selection": um `token_env_var text` livre (mesmo com CHECK de formato)
-- permitiria que uma linha desta tabela apontasse para QUALQUER env var da
-- implantação — incluindo `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_KEY` ou o
-- `FISCAL_PROVIDER_TOKEN` de outra loja — porque `Deno.env.get(nome)` não
-- distingue "secret fiscal" de "secret de outra função". Isso transformaria
-- uma linha editável (por DONO/ADMIN, ou por bug de aplicação) numa
-- primitiva de exfiltração de qualquer segredo da implantação.
--
-- Correção: `token_env_var` deixa de ser digitável — é `GENERATED ALWAYS ...
-- STORED`, calculada SOMENTE a partir de `provider_type`+`loja_id`+`ambiente`
-- da própria linha (`FISCAL_TOKEN_<PROVIDER>_<LOJA_ID sem hífen>_<AMBIENTE>`).
-- Nenhum INSERT/UPDATE (via app, painel ou PostgREST) pode escrever um valor
-- diferente do canônico — Postgres rejeita qualquer tentativa de atribuir a
-- uma coluna gerada. Consequências:
--   * Loja A nunca pode "apontar" para o secret de Loja B — o nome contém o
--     próprio loja_id, não é texto livre;
--   * o padrão `FISCAL_TOKEN_` nunca colide com secrets pré-existentes
--     (`SYNC_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FISCAL_PROVIDER_TOKEN`);
--   * provider_type é parte do nome — uma linha `mock` nunca deriva o mesmo
--     nome de env var que uma linha `focus` da mesma loja/ambiente.
-- Continua sem vault próprio — é só uma convenção de nomes, agora imposta
-- pelo banco em vez de apenas documentada.
--
-- Esta migration NÃO chama a Focus, não grava nenhum secret, não altera
-- nenhuma tabela existente.
--
-- ROLLBACK: DROP TABLE public.fiscal_provider_config (aditiva; sem dado de
-- produção — nenhuma linha é criada por esta migration).

BEGIN;

-- Chave composta (loja_id, ambiente): permite manter as duas configurações
-- (homologação e produção) da mesma loja cadastradas ao mesmo tempo — o
-- worker filtra pela ambiente da implantação corrente (Onda C2). Evita ter
-- que apagar/recriar a linha em cada corte homolog→produção.
CREATE TABLE IF NOT EXISTS public.fiscal_provider_config (
  loja_id uuid NOT NULL REFERENCES public.lojas(id) ON DELETE CASCADE,
  provider_type text NOT NULL DEFAULT 'focus'
    CHECK (provider_type IN ('mock', 'http', 'focus', 'bling')),
  ambiente text NOT NULL
    CHECK (ambiente IN ('homologacao', 'producao')),
  -- GERADA — nunca digitável. Nome (não valor) da env var/secret Supabase
  -- Edge Function que contém o token real desta loja+ambiente+provider.
  -- Deno.env.get(token_env_var) no fiscal-worker resolve o valor real.
  token_env_var text GENERATED ALWAYS AS (
    'FISCAL_TOKEN_' || upper(provider_type) || '_' || replace(loja_id::text, '-', '') || '_' || upper(ambiente)
  ) STORED,
  habilitado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, ambiente)
);

COMMENT ON TABLE public.fiscal_provider_config IS
  'Metadados de resolução de credencial fiscal por loja/ambiente (multiempresa). '
  'Nunca contém segredo — token_env_var é GERADA (não digitável) a partir de '
  'provider_type+loja_id+ambiente; é só o NOME da env var a ler via Deno.env.get() '
  'no fiscal-worker. Onda C1 (2026-09-02, prontidão Focus NFe).';
COMMENT ON COLUMN public.fiscal_provider_config.token_env_var IS
  'GERADA (GENERATED ALWAYS, não aceita INSERT/UPDATE direto). Nome — nunca valor — da env var '
  'Supabase Edge Function com o token real. Derivada só de provider_type+loja_id+ambiente da própria '
  'linha: nenhuma configuração pode apontar para o secret de outra loja/provider/ambiente.';
COMMENT ON COLUMN public.fiscal_provider_config.ambiente IS
  'homologacao|producao — explícito por linha para permitir a guarda anti-mistura no worker (Onda C2).';

ALTER TABLE public.fiscal_provider_config ENABLE ROW LEVEL SECURITY;

-- Leitura: GERENTE/DONO/ADMIN. GERENTE só a própria loja; DONO/ADMIN visão global
-- (mesmo padrão de visão macro já usado em documentos_fiscais_pendentes/lojas).
DROP POLICY IF EXISTS "fiscal_provider_config_select" ON public.fiscal_provider_config;
CREATE POLICY "fiscal_provider_config_select"
  ON public.fiscal_provider_config FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil = ANY(ARRAY['GERENTE', 'DONO', 'ADMIN'])
        AND (u.perfil IN ('DONO', 'ADMIN') OR u.loja_id = fiscal_provider_config.loja_id)
    )
  );

-- Escrita: só DONO/ADMIN (é o fio que decide qual credencial é usada por
-- loja — mais restrito que a edição de dados cadastrais de `lojas`).
DROP POLICY IF EXISTS "fiscal_provider_config_write" ON public.fiscal_provider_config;
CREATE POLICY "fiscal_provider_config_write"
  ON public.fiscal_provider_config FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('DONO', 'ADMIN')
    )
  );

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_col_is_generated text;
  v_loja_id uuid;
  v_esperado text;
  v_obtido text;
  v_prova_criada boolean := false;
  v_secret_selection_bloqueado boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fiscal_provider_config'
  ) THEN
    RAISE EXCEPTION 'FISCAL_PROVIDER_CONFIG_TABELA_AUSENTE';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.fiscal_provider_config'::regclass) THEN
    RAISE EXCEPTION 'FISCAL_PROVIDER_CONFIG_RLS_DESATIVADA';
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'fiscal_provider_config') <> 2 THEN
    RAISE EXCEPTION 'FISCAL_PROVIDER_CONFIG_POLICIES_INESPERADAS';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.fiscal_provider_config', 'SELECT') THEN
    RAISE EXCEPTION 'FISCAL_PROVIDER_CONFIG_SERVICE_ROLE_SEM_SELECT';
  END IF;

  -- Gate de segurança: token_env_var precisa ser GENERATED (não digitável).
  SELECT attgenerated INTO v_col_is_generated
  FROM pg_attribute
  WHERE attrelid = 'public.fiscal_provider_config'::regclass AND attname = 'token_env_var';
  IF v_col_is_generated IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION 'FISCAL_PROVIDER_CONFIG_TOKEN_ENV_VAR_NAO_GERADA';
  END IF;

  -- Prova viva (quando houver loja disponível): (a) o valor gerado bate com
  -- a convenção documentada; (b) tentar escrever um token_env_var explícito
  -- é rejeitado pelo Postgres (coluna gerada não aceita INSERT/UPDATE direto).
  SELECT id INTO v_loja_id FROM public.lojas LIMIT 1;
  IF v_loja_id IS NULL THEN
    RAISE NOTICE 'FISCAL_PROVIDER_CONFIG: sem lojas para prova viva; verificação estrutural OK';
  ELSE
    -- Só apaga a linha de prova se foi ESTA execução que a criou (RETURNING
    -- confirma inserção real) — nunca uma linha real pré-existente.
    INSERT INTO public.fiscal_provider_config (loja_id, provider_type, ambiente, habilitado)
    VALUES (v_loja_id, 'focus', 'homologacao', false)
    ON CONFLICT (loja_id, ambiente) DO NOTHING
    RETURNING true INTO v_prova_criada;

    SELECT token_env_var INTO v_obtido
    FROM public.fiscal_provider_config
    WHERE loja_id = v_loja_id AND ambiente = 'homologacao';

    v_esperado := 'FISCAL_TOKEN_FOCUS_' || replace(v_loja_id::text, '-', '') || '_HOMOLOGACAO';
    IF v_obtido IS DISTINCT FROM v_esperado THEN
      RAISE EXCEPTION 'FISCAL_PROVIDER_CONFIG_NOME_GERADO_INESPERADO: esperado=% obtido=%', v_esperado, v_obtido;
    END IF;

    -- Tentativa deliberada de burlar a coluna gerada com o nome de um
    -- secret real e sensível — precisa ser rejeitada pelo Postgres.
    BEGIN
      EXECUTE format(
        'INSERT INTO public.fiscal_provider_config (loja_id, provider_type, ambiente, token_env_var, habilitado) '
        'VALUES (%L, %L, %L, %L, false)',
        v_loja_id, 'focus', 'producao', 'SUPABASE_SERVICE_ROLE_KEY'
      );
    EXCEPTION WHEN OTHERS THEN
      v_secret_selection_bloqueado := true;
    END;
    IF NOT v_secret_selection_bloqueado THEN
      RAISE EXCEPTION 'FISCAL_PROVIDER_CONFIG_SECRET_SELECTION_NAO_BLOQUEADO';
    END IF;
    -- A tentativa acima, se por algum motivo tivesse sido aceita, teria
    -- criado uma linha 'producao' — garante que não sobra nada dela também.
    DELETE FROM public.fiscal_provider_config WHERE loja_id = v_loja_id AND ambiente = 'producao'
      AND token_env_var = 'SUPABASE_SERVICE_ROLE_KEY';

    IF v_prova_criada THEN
      DELETE FROM public.fiscal_provider_config WHERE loja_id = v_loja_id AND ambiente = 'homologacao';
    END IF;
  END IF;
END
$verify$;

COMMIT;
