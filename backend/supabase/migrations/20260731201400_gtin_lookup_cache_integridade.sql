-- Migration 281: DB-16 — integridade de dados em gtin_lookup_cache
-- Data: 2026-07-29
--
-- CONCLUSÃO DA AUDITORIA: as policies "always-true" NÃO são defeito
-- ----------------------------------------------------------------
-- O advisor do Supabase sinaliza `rls_policy_always_true` em
-- gtin_lookup_cache_upsert_auth (INSERT) e _update_auth (UPDATE). A
-- investigação mostrou que, neste caso, o alerta é genérico e não procede
-- como falha de isolamento:
--
--   1. A tabela NÃO tem `loja_id`. É cache global de consulta a registro
--      externo de GTIN — e GTIN é identificador universal, não por loja.
--      Não há isolamento multi-loja a ser violado.
--   2. As três policies são escopadas `TO authenticated`. `anon` não é
--      alcançado por policy nenhuma e, além disso, não tem grant algum:
--      SELECT/INSERT/UPDATE/DELETE = false.
--   3. A escrita por `authenticated` é o funcionamento pretendido da feature:
--      pdv-importados/app/gerente/produtos/sugestaoCadastroActions.ts usa
--      createClient() (sessão do usuário) → sugerirDadosCadastro →
--      writeGtinCache. O app busca no OpenFoodFacts e cacheia sob a sessão.
--      Restringir a escrita a service_role ou a perfil gerencial QUEBRARIA o
--      cadastro de produto por GTIN.
--
-- RESÍDUO REAL, E POR QUE NÃO É CORRIGIDO AQUI
-- --------------------------------------------
-- Sobra o envenenamento de cache por insider autenticado: um usuário com
-- sessão válida pode chamar PostgREST direto e gravar `nome`/`marca`/`ncm`
-- arbitrários para qualquer GTIN. Impacto: pré-preenchimento errado na tela de
-- cadastro de produto (revisado por humano antes de salvar), com peso fiscal
-- no caso do NCM.
--
-- Mitigar isso exigiria restringir QUEM cadastra produto — decisão de negócio
-- (a migration 20260718135138_criar_produto_permite_operador_pdv indica que
-- operador de PDV pode criar produto). Fora do escopo de hardening. Registrado
-- em docs/AUDITORIA_HARDENING_PRE_BASELINE.md como pendência de produto.
--
-- O QUE ESTA MIGRATION FAZ
-- ------------------------
-- Não muda QUEM escreve — muda O QUE pode ser escrito. Puro hardening de
-- forma de dado, sem alterar regra de negócio nem quebrar o fluxo atual.
--
--   1. `gtin` passa a exigir 8 a 14 dígitos numéricos (GTIN-8/12/13/14).
--      Hoje a PK aceita qualquer texto. O app já normaliza via
--      normalizeGtinDigits(), então escritas legítimas não são afetadas.
--      Alinhado ao DB-09, onde 50% do catálogo tem código fora de formato GTIN.
--
--   2. `expires_at > fetched_at` — impede TTL invertido, que faria
--      readGtinCache() descartar a entrada imediatamente (linha 30 do
--      repositório compara expires_at com now()).
--
-- VERIFICAÇÃO PRÉVIA (produção)
-- -----------------------------
--   total de linhas .......... 1
--   gtin '7891000100103' ..... 13 dígitos, formato_ok = true
--   fonte .................... 'openfoodfacts' (já coberto por CHECK existente)
--   fetched_at < expires_at .. true
--   → 0 violações; ambas as constraints entram VALIDADAS.
--
-- CONSTRAINTS PREEXISTENTES (mantidas, não tocadas)
-- -------------------------------------------------
--   gtin_lookup_cache_pkey ......... PRIMARY KEY (gtin)
--   gtin_lookup_cache_fonte_check .. fonte IN ('openfoodfacts','interno','manual')
--   gtin_lookup_cache_expires_idx .. índice em expires_at
--
-- ROLLBACK
-- --------
--   ALTER TABLE public.gtin_lookup_cache DROP CONSTRAINT gtin_lookup_cache_gtin_formato;
--   ALTER TABLE public.gtin_lookup_cache DROP CONSTRAINT gtin_lookup_cache_ttl_coerente;

BEGIN;

ALTER TABLE public.gtin_lookup_cache
  ADD CONSTRAINT gtin_lookup_cache_gtin_formato
  CHECK (gtin ~ '^[0-9]{8,14}$') NOT VALID;
ALTER TABLE public.gtin_lookup_cache VALIDATE CONSTRAINT gtin_lookup_cache_gtin_formato;

ALTER TABLE public.gtin_lookup_cache
  ADD CONSTRAINT gtin_lookup_cache_ttl_coerente
  CHECK (expires_at > fetched_at) NOT VALID;
ALTER TABLE public.gtin_lookup_cache VALIDATE CONSTRAINT gtin_lookup_cache_ttl_coerente;

COMMENT ON TABLE public.gtin_lookup_cache IS
  'Cache global de consulta externa de GTIN (OpenFoodFacts e afins). Global por '
  'design: não possui loja_id, pois GTIN é identificador universal. Policies '
  'always-true escopadas TO authenticated são intencionais — a escrita ocorre sob '
  'a sessão do usuário no fluxo de cadastro de produto por código de barras. '
  '`anon` não tem grant algum. Migration 281 acrescenta guarda de FORMA do dado '
  '(GTIN 8-14 dígitos, TTL coerente) sem alterar quem pode escrever.';

COMMIT;
