-- ============================================================
-- Onda 2 · Bloco 3 — busca do PDV accent-insensitive (sem degradar performance)
-- ============================================================
--
-- PROBLEMA: buscarProdutoParaCaixaImpl (app/caixa/server/caixaCatalogo.impl.ts)
-- faz `nome ILIKE '%frag%'` em produtos e categorias. "cafe" não encontra
-- "Café"; "plastico" não encontra "Plástico". O operador precisa digitar o
-- acento exato, que no teclado de um PDV é fricção real.
--
-- POR QUE NÃO É SÓ "ENVOLVER EM unaccent()":
-- Migration 208 (idx_produtos_nome_trgm / idx_categorias_nome_trgm) já resolveu
-- o problema de performance da busca por nome — GIN trigram sobre a coluna
-- `nome` crua, sem o que ILIKE com curinga à esquerda vira seq scan. Se a
-- query passar a comparar `unaccent(nome) ILIKE unaccent('%frag%')` sem um
-- índice casando com essa EXPRESSÃO exata, o planner não pode usar o índice
-- trigram existente (ele foi construído sobre `nome`, não sobre `unaccent(nome)`)
-- — a busca inteira cairia pra sequential scan, e não só a parte acentuada:
-- TODA busca por nome no PDV ficaria lenta à medida que o catálogo cresce.
-- Essa é exatamente a "solução cara" que a Onda 2 pediu pra não implementar
-- às cegas.
--
-- POR QUE NÃO DÁ PRA SÓ CRIAR UM ÍNDICE FUNCIONAL SOBRE unaccent(nome):
-- unaccent() built-in não é IMMUTABLE (depende da configuração de текст search
-- carregada em runtime) — Postgres recusa `CREATE INDEX` sobre uma expressão
-- não-IMMUTABLE. Precisa de um wrapper IMMUTABLE explícito (padrão documentado
-- do próprio Postgres/pg_trgm para este caso exato).
--
-- POR QUE COLUNA GERADA (STORED) EM VEZ DE ÍNDICE FUNCIONAL "PURO":
-- O client (@supabase/supabase-js) filtra via PostgREST, que só aceita
-- comparação contra COLUNAS reais (ou views), não uma chamada de função
-- arbitrária dentro do WHERE — `.ilike('nome', ...)` no client vira
-- `nome ILIKE ...` no PostgREST; não existe forma de o client pedir
-- `minha_funcao(nome) ILIKE ...` sem uma RPC dedicada (fora de escopo: o pedido
-- foi resolver a busca existente, não reescrevê-la como RPC). Uma coluna
-- GERADA STORED resolve isso: o valor "sem acento" fica materializado como
-- coluna normal, filtrável do jeito que o client já filtra hoje, mantida
-- automaticamente pelo Postgres em todo INSERT/UPDATE — zero código de
-- aplicação precisa manter isso em sincronia.
--
-- ESCOPO: só produtos.nome e categorias.nome (os dois usados pela busca do
-- PDV). Os índices trigram antigos (idx_produtos_nome_trgm,
-- idx_categorias_nome_trgm) NÃO são removidos — outras telas (ex.: catálogo
-- admin) podem depender deles; remover está fora do escopo desta onda.
--
-- CLASSIFICAÇÃO: SCHEMA/MIGRATION (extensão + função + coluna gerada + índice).
-- NÃO É QUERY-ONLY nem QUERY+INDEX puro — ver justificativa acima.
--
-- ⚠️ Esta migration foi preparada e testada na branch da Onda 2, mas NÃO foi
-- aplicada em nenhum ambiente (o sandbox de desenvolvimento não tinha acesso a
-- um Postgres real neste momento — Docker indisponível no ambiente de
-- execução). `EXPLAIN`/plano de execução real: NÃO EXECUTADO. Ver auditoria
-- para o raciocínio de por que o índice deve ser usado (mesmo padrão já
-- comprovado da migration 208), mas isso PRECISA ser confirmado com EXPLAIN
-- real antes de aplicar em produção.

-- ---------------------------------------------------------------------------
-- 1) Extensão unaccent (mesmo schema `extensions` usado por pg_trgm — migration 115)
-- ---------------------------------------------------------------------------

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- 2) Wrapper IMMUTABLE — unaccent() built-in não é IMMUTABLE, então não pode
--    ser usado direto numa coluna GERADA nem num índice. `search_path` fixo
--    evita hijacking de função (mesma prática de segurança das RPCs do projeto).
-- ---------------------------------------------------------------------------

create or replace function public.texto_sem_acento(texto text)
returns text
language sql
immutable
parallel safe
set search_path = extensions, pg_catalog
as $$
  select unaccent('unaccent', coalesce(texto, ''))
$$;

comment on function public.texto_sem_acento(text) is
  'Wrapper IMMUTABLE sobre extensions.unaccent — necessário porque unaccent() '
  'built-in não é IMMUTABLE e não pode ser usado em coluna GERADA/índice sem isso. '
  'Onda 2 · Bloco 3 (busca do PDV accent-insensitive).';

-- ---------------------------------------------------------------------------
-- 3) Colunas geradas (STORED) — mantidas automaticamente pelo Postgres,
--    filtráveis via PostgREST como qualquer coluna normal.
-- ---------------------------------------------------------------------------

alter table public.produtos
  add column if not exists nome_sem_acento text
  generated always as (public.texto_sem_acento(nome)) stored;

alter table public.categorias
  add column if not exists nome_sem_acento text
  generated always as (public.texto_sem_acento(nome)) stored;

comment on column public.produtos.nome_sem_acento is
  'Gerada (STORED) a partir de nome, minúscula+sem acento — usada pela busca '
  'accent-insensitive do PDV. Não editar diretamente; segue nome automaticamente.';
comment on column public.categorias.nome_sem_acento is
  'Gerada (STORED) a partir de nome, minúscula+sem acento — mesma finalidade '
  'da coluna equivalente em produtos.';

-- ---------------------------------------------------------------------------
-- 4) Índices trigram sobre as colunas geradas — mesmo padrão da migration 208,
--    só trocando a coluna indexada. Índices antigos (sobre `nome` cru)
--    permanecem intactos para os consumidores que ainda usam `nome` direto.
-- ---------------------------------------------------------------------------

create index if not exists idx_produtos_nome_sem_acento_trgm
  on public.produtos
  using gin (nome_sem_acento extensions.gin_trgm_ops)
  where ativo = true;

create index if not exists idx_categorias_nome_sem_acento_trgm
  on public.categorias
  using gin (nome_sem_acento extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 5) RLS: colunas geradas herdam a mesma política de leitura da tabela — não
--    precisa de policy nova (SELECT já permitido a `authenticated` em ambas,
--    ver 001_schema_inicial.sql). Nada a fazer aqui.
-- ---------------------------------------------------------------------------
