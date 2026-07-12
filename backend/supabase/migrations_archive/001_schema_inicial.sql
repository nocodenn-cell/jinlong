-- PDV Importados — Schema inicial
-- Supabase / PostgreSQL
-- Executar via: npx supabase db push

-- ============================================================
-- EXTENSÕES
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- USUARIOS (extends Supabase auth.users)
-- ============================================================
create table public.usuarios (
  id uuid primary key references auth.users on delete cascade,
  nome text not null,
  perfil text not null check (perfil in ('OPERADOR', 'GERENTE', 'DONO')),
  idioma_preferido text not null default 'pt' check (idioma_preferido in ('pt', 'zh')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.usuarios enable row level security;

create policy "usuario_select_own"
  on public.usuarios for select
  using (auth.uid() = id);

create policy "dono_select_all"
  on public.usuarios for select
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.perfil = 'DONO'
    )
  );

-- ============================================================
-- CATEGORIAS
-- ============================================================
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria_pai_id uuid references public.categorias(id),
  created_at timestamptz not null default now()
);

alter table public.categorias enable row level security;

create policy "categorias_leitura"
  on public.categorias for select
  using (auth.role() = 'authenticated');

create policy "categorias_escrita"
  on public.categorias for all
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.perfil in ('GERENTE', 'DONO')
    )
  );

-- ============================================================
-- PRODUTOS
-- ============================================================
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  codigo_barras text unique,
  nome text not null,
  categoria_id uuid references public.categorias(id),
  preco_varejo numeric(10,2) not null check (preco_varejo >= 0),
  preco_custo numeric(10,2) check (preco_custo >= 0),
  unidade_medida text not null default 'UN',
  origem text not null check (origem in ('china_manual', 'brasil_nf', 'brasil_sem_nf')),
  tem_nf boolean not null default false,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_produtos_codigo_barras on public.produtos(codigo_barras);
create index idx_produtos_nome on public.produtos using gin(to_tsvector('portuguese', nome));
create index idx_produtos_categoria on public.produtos(categoria_id);

alter table public.produtos enable row level security;

create policy "produtos_leitura"
  on public.produtos for select
  using (auth.role() = 'authenticated');

create policy "produtos_escrita"
  on public.produtos for all
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.perfil in ('GERENTE', 'DONO')
    )
  );

-- Trigger: atualizar updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger produtos_updated_at
  before update on public.produtos
  for each row execute function public.set_updated_at();

-- ============================================================
-- ESTOQUE
-- ============================================================
create table public.estoque (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid unique not null references public.produtos(id),
  quantidade_atual numeric(10,3) not null default 0,
  estoque_minimo numeric(10,3) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.estoque enable row level security;

create policy "estoque_leitura"
  on public.estoque for select
  using (auth.role() = 'authenticated');

create policy "estoque_escrita"
  on public.estoque for all
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.perfil in ('GERENTE', 'DONO')
    )
  );

-- ============================================================
-- REGRAS DE PREÇO
-- ============================================================
create table public.regras_preco (
  id uuid primary key default gen_random_uuid(),
  tipo_regra text not null check (tipo_regra in ('PRODUTO', 'CATEGORIA')),
  produto_id uuid references public.produtos(id),
  categoria_id uuid references public.categorias(id),
  quantidade_minima numeric(10,3) not null check (quantidade_minima > 0),
  quantidade_maxima numeric(10,3) check (quantidade_maxima > quantidade_minima),
  tipo_desconto text not null check (tipo_desconto in ('PERCENTUAL', 'VALOR_FIXO')),
  valor_desconto numeric(10,4) not null check (valor_desconto > 0),
  data_validade timestamptz,
  ativo boolean not null default true,
  created_by uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  -- garantir que ou produto_id ou categoria_id está preenchido
  constraint regra_tem_alvo check (
    (produto_id is not null and categoria_id is null) or
    (produto_id is null and categoria_id is not null)
  )
);

create index idx_regras_produto on public.regras_preco(produto_id) where ativo = true;
create index idx_regras_categoria on public.regras_preco(categoria_id) where ativo = true;

alter table public.regras_preco enable row level security;

create policy "regras_leitura"
  on public.regras_preco for select
  using (auth.role() = 'authenticated');

create policy "regras_escrita"
  on public.regras_preco for all
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.perfil in ('GERENTE', 'DONO')
    )
  );

-- ============================================================
-- CAIXAS
-- ============================================================
create table public.caixas (
  id uuid primary key default gen_random_uuid(),
  operador_id uuid not null references public.usuarios(id),
  data_abertura timestamptz not null default now(),
  valor_inicial numeric(10,2) not null default 0,
  data_fechamento timestamptz,
  valor_fechamento numeric(10,2),
  status text not null default 'ABERTO' check (status in ('ABERTO', 'FECHADO'))
);

alter table public.caixas enable row level security;

create policy "caixas_operador"
  on public.caixas for all
  using (operador_id = auth.uid());

create policy "caixas_gerente"
  on public.caixas for select
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.perfil in ('GERENTE', 'DONO')
    )
  );

-- ============================================================
-- MOVIMENTOS DE CAIXA
-- ============================================================
create table public.movimentos_caixa (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references public.caixas(id),
  tipo text not null check (tipo in ('VENDA', 'SANGRIA', 'SUPRIMENTO', 'DESCONTO_MANUAL')),
  valor numeric(10,2) not null,
  referencia_id uuid,
  observacao text,
  created_at timestamptz not null default now()
);

alter table public.movimentos_caixa enable row level security;

create policy "movimentos_gerente"
  on public.movimentos_caixa for select
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.perfil in ('GERENTE', 'DONO')
    )
  );

create policy "movimentos_insert"
  on public.movimentos_caixa for insert
  with check (auth.role() = 'authenticated');

-- ============================================================
-- VENDAS
-- ============================================================
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references public.caixas(id),
  operador_id uuid not null references public.usuarios(id),
  data timestamptz not null default now(),
  total_bruto numeric(10,2) not null check (total_bruto >= 0),
  total_desconto numeric(10,2) not null default 0 check (total_desconto >= 0),
  total_liquido numeric(10,2) not null check (total_liquido >= 0),
  forma_pagamento text not null check (
    forma_pagamento in ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO')
  ),
  tipo_venda text not null default 'SEM_NF' check (tipo_venda in ('SEM_NF', 'COM_NF')),
  numero_nf text,
  chave_nf text check (chave_nf is null or length(chave_nf) = 44),
  status text not null default 'CONCLUIDA' check (status in ('CONCLUIDA', 'CANCELADA')),
  created_at timestamptz not null default now()
);

create index idx_vendas_data on public.vendas(data);
create index idx_vendas_caixa on public.vendas(caixa_id);
create index idx_vendas_operador on public.vendas(operador_id);

alter table public.vendas enable row level security;

create policy "vendas_operador"
  on public.vendas for insert
  with check (operador_id = auth.uid());

create policy "vendas_gerente"
  on public.vendas for all
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.perfil in ('GERENTE', 'DONO')
    )
  );

-- ============================================================
-- ITENS DA VENDA
-- ============================================================
create table public.itens_venda (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id),
  produto_id uuid not null references public.produtos(id),
  quantidade numeric(10,3) not null check (quantidade > 0),
  preco_unitario_original numeric(10,2) not null,
  preco_unitario numeric(10,2) not null,
  desconto_unitario numeric(10,2) not null default 0,
  tipo_preco text not null check (tipo_preco in ('VAREJO', 'ATACADO', 'MANUAL'))
);

create index idx_itens_venda on public.itens_venda(venda_id);
create index idx_itens_produto on public.itens_venda(produto_id);

alter table public.itens_venda enable row level security;

create policy "itens_insert"
  on public.itens_venda for insert
  with check (auth.role() = 'authenticated');

create policy "itens_gerente"
  on public.itens_venda for select
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.perfil in ('GERENTE', 'DONO')
    )
  );

-- ============================================================
-- VIEWS ÚTEIS
-- ============================================================

-- Produtos com estoque baixo
create or replace view public.v_estoque_baixo as
  select
    p.id,
    p.nome,
    p.codigo_barras,
    p.origem,
    e.quantidade_atual,
    e.estoque_minimo,
    (e.estoque_minimo - e.quantidade_atual) as deficit
  from public.produtos p
  join public.estoque e on e.produto_id = p.id
  where p.ativo = true
    and e.quantidade_atual <= e.estoque_minimo
  order by deficit desc;

-- Resumo de vendas por dia
create or replace view public.v_vendas_dia as
  select
    date_trunc('day', v.data) as dia,
    count(*) as num_vendas,
    sum(v.total_liquido) as total_liquido,
    avg(v.total_liquido) as ticket_medio,
    sum(v.total_desconto) as total_desconto
  from public.vendas v
  where v.status = 'CONCLUIDA'
  group by date_trunc('day', v.data)
  order by dia desc;

-- Top produtos vendidos
create or replace view public.v_top_produtos as
  select
    p.id,
    p.nome,
    p.origem,
    sum(iv.quantidade) as total_quantidade,
    sum(iv.quantidade * iv.preco_unitario) as total_valor,
    count(distinct iv.venda_id) as num_vendas,
    sum(case when iv.tipo_preco = 'ATACADO' then iv.quantidade else 0 end) as qtde_atacado,
    sum(case when iv.tipo_preco = 'VAREJO' then iv.quantidade else 0 end) as qtde_varejo
  from public.itens_venda iv
  join public.produtos p on p.id = iv.produto_id
  join public.vendas v on v.id = iv.venda_id
  where v.status = 'CONCLUIDA'
  group by p.id, p.nome, p.origem
  order by total_valor desc;
