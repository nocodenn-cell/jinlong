-- Migration 100: Tabela categorias_financeiras
-- Categorias para o plano de contas / DRE (Receita, Despesa, Ambos)

create type public.categoria_financeira_tipo as enum ('RECEITA', 'DESPESA', 'AMBOS');

create table if not exists public.categorias_financeiras (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(nome) between 2 and 120),
  tipo        public.categoria_financeira_tipo not null default 'AMBOS',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Índices
create index if not exists idx_cat_fin_tipo   on public.categorias_financeiras(tipo);
create index if not exists idx_cat_fin_ativo  on public.categorias_financeiras(ativo);
create index if not exists idx_cat_fin_nome   on public.categorias_financeiras(lower(nome));

-- RLS
alter table public.categorias_financeiras enable row level security;

-- Dono: acesso total
create policy "dono_all_cat_fin" on public.categorias_financeiras
  for all
  using  (auth.jwt() ->> 'role' = 'dono')
  with check (auth.jwt() ->> 'role' = 'dono');

-- Gerente: leitura + escrita (sem delete)
create policy "gerente_select_cat_fin" on public.categorias_financeiras
  for select
  using (auth.jwt() ->> 'role' = 'gerente');

create policy "gerente_insert_cat_fin" on public.categorias_financeiras
  for insert
  with check (auth.jwt() ->> 'role' = 'gerente');

create policy "gerente_update_cat_fin" on public.categorias_financeiras
  for update
  using  (auth.jwt() ->> 'role' = 'gerente')
  with check (auth.jwt() ->> 'role' = 'gerente');

-- Seed: algumas categorias padrão
insert into public.categorias_financeiras (nome, tipo) values
  ('Vendas de Produtos',   'RECEITA'),
  ('Outras Receitas',      'RECEITA'),
  ('Custo de Mercadoria',  'DESPESA'),
  ('Aluguel',              'DESPESA'),
  ('Salários',             'DESPESA'),
  ('Energia / Água',       'DESPESA'),
  ('Marketing',            'DESPESA'),
  ('Impostos e Taxas',     'DESPESA'),
  ('Geral',                'AMBOS')
on conflict do nothing;
