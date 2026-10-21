-- Nature Code · Hub comercial (leads de Jinlong e Venddi). PREPARADO, NÃO APLICADO.
-- Para aplicar (exige autorização): copiar para backend/supabase/migrations/ num PR com label
-- deploy-prod:aprovado, ou executar manualmente no SQL editor do projeto Supabase.
-- Impacto: só objetos novos com prefixo commercial_. Nenhuma tabela/função do ERP/PDV é lida ou alterada;
-- as políticas não referenciam dados operacionais de lojas.

create extension if not exists pgcrypto;

-- Administradores do hub (cadastro manual: insert into public.commercial_admins(user_id) values ('<uuid do auth.users>')).
create table if not exists public.commercial_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.commercial_admins enable row level security;
revoke all on public.commercial_admins from anon, authenticated;

create or replace function public.is_commercial_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.commercial_admins a where a.user_id = auth.uid())
$$;
revoke all on function public.is_commercial_admin() from public, anon;
grant execute on function public.is_commercial_admin() to authenticated;

-- Leads (pedidos de demonstração) — mesma tabela para os dois produtos.
create table if not exists public.commercial_leads (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique check (protocol ~ '^(JL|VD)-[0-9]{6}-[A-Z2-9]{6}$'),
  product text not null check (product in ('jinlong', 'venddi')),
  name text not null check (char_length(name) between 2 and 80),
  store text not null check (char_length(store) between 2 and 120),
  contact text not null check (char_length(contact) between 3 and 60),
  channel text not null check (channel in ('whatsapp', 'wechat')),
  locale text not null check (locale in ('pt-BR', 'zh-CN')),
  status text not null default 'novo'
    check (status in ('novo', 'contatado', 'demonstracao', 'proposta', 'contratado', 'perdido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists commercial_leads_created_idx on public.commercial_leads (created_at desc);
create index if not exists commercial_leads_status_idx on public.commercial_leads (status, product);

alter table public.commercial_leads enable row level security;
revoke all on public.commercial_leads from anon, authenticated;
-- anon (site): só INSERT, só estas colunas; status/datas ficam no padrão. Nenhum SELECT.
grant insert (protocol, product, name, store, contact, channel, locale) on public.commercial_leads to anon;
grant select, update (status, updated_at) on public.commercial_leads to authenticated;

drop policy if exists commercial_leads_anon_insert on public.commercial_leads;
create policy commercial_leads_anon_insert on public.commercial_leads
  for insert to anon with check (status = 'novo');
drop policy if exists commercial_leads_admin_select on public.commercial_leads;
create policy commercial_leads_admin_select on public.commercial_leads
  for select to authenticated using (public.is_commercial_admin());
drop policy if exists commercial_leads_admin_update on public.commercial_leads;
create policy commercial_leads_admin_update on public.commercial_leads
  for update to authenticated using (public.is_commercial_admin()) with check (public.is_commercial_admin());

-- Histórico: notas, contatos realizados e mudanças de status.
create table if not exists public.commercial_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.commercial_leads (id) on delete cascade,
  kind text not null check (kind in ('nota', 'contato', 'status')),
  body text check (body is null or char_length(body) <= 2000),
  from_status text,
  to_status text,
  author uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists commercial_lead_events_lead_idx on public.commercial_lead_events (lead_id, created_at desc);
alter table public.commercial_lead_events enable row level security;
revoke all on public.commercial_lead_events from anon, authenticated;
grant select, insert on public.commercial_lead_events to authenticated;
drop policy if exists commercial_lead_events_admin on public.commercial_lead_events;
create policy commercial_lead_events_admin on public.commercial_lead_events
  for all to authenticated using (public.is_commercial_admin()) with check (public.is_commercial_admin());

-- Lojas contratadas (base para assinaturas futuras).
create table if not exists public.commercial_customers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid unique references public.commercial_leads (id) on delete set null,
  product text not null check (product in ('jinlong', 'venddi')),
  store_name text not null check (char_length(store_name) between 2 and 120),
  contact text check (contact is null or char_length(contact) <= 60),
  contracted_at date not null default current_date,
  plan text check (plan is null or char_length(plan) <= 60),
  monthly_value numeric(10, 2) check (monthly_value is null or monthly_value >= 0),
  subscription_status text not null default 'ativo' check (subscription_status in ('ativo', 'pausado', 'cancelado')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.commercial_customers enable row level security;
revoke all on public.commercial_customers from anon, authenticated;
grant select, insert, update on public.commercial_customers to authenticated;
drop policy if exists commercial_customers_admin on public.commercial_customers;
create policy commercial_customers_admin on public.commercial_customers
  for all to authenticated using (public.is_commercial_admin()) with check (public.is_commercial_admin());
