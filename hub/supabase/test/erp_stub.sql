-- Stub mínimo do ERP (só o que a Central de Conversão lê/escreve), para teste local descartável.
-- Colunas e funções copiadas das migrations reais (001, 032, multiempresa 20261019*, cobrança 20261020100000).
create schema if not exists saas;
create schema if not exists internal;

create table public.empresas (
  id uuid primary key default gen_random_uuid(), nome text not null, cnpj text, plano text not null default 'PILOTO',
  status text not null default 'ATIVA', max_lojas int, updated_at timestamptz not null default now());
create table public.lojas (
  id uuid primary key default gen_random_uuid(), empresa_id uuid references public.empresas(id), nome text,
  ativo boolean not null default true, created_at timestamptz not null default now());
create table public.usuarios (
  id uuid primary key references auth.users(id), nome text not null, idioma_preferido text not null default 'pt',
  ativo boolean not null default true);
create table public.usuario_vinculos (
  id uuid primary key default gen_random_uuid(), usuario_id uuid not null references public.usuarios(id),
  empresa_id uuid not null references public.empresas(id), loja_id uuid, papel text not null,
  ativo boolean not null default true, created_at timestamptz not null default now());
create table public.produtos (id uuid primary key default gen_random_uuid(), loja_id uuid references public.lojas(id), observacao text);
create table public.caixas (id uuid primary key default gen_random_uuid(), loja_id uuid not null references public.lojas(id));
create table public.vendas (
  id uuid primary key default gen_random_uuid(), caixa_id uuid not null references public.caixas(id),
  data timestamptz not null default now(), status text not null default 'CONCLUIDA');
create table public.configuracoes_gerais (
  empresa_id uuid, chave text, valor text, tipo_dado text, descricao text, primary key (empresa_id, chave));

create or replace function public.fp_empresa_contexto(p_loja uuid default null)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select empresa_id from public.usuario_vinculos where usuario_id = auth.uid() and ativo order by created_at limit 1
$$;

create table saas.planos (
  codigo text primary key, nome text not null, tipo text not null default 'PLANO', ordem int not null default 0,
  recursos text[] not null default '{}', preco_loja_centavos int not null, preco_caixa_adicional_centavos int not null default 0,
  caixas_inclusos_por_loja int not null default 1, max_lojas int, preco_placeholder boolean not null default true,
  ativo boolean not null default true);
insert into saas.planos (codigo, nome, tipo, ordem, preco_loja_centavos, preco_caixa_adicional_centavos, max_lojas) values
  ('BASICO', 'Básico', 'PLANO', 1, 9900, 3900, 1), ('ATACADO', 'Atacado', 'PLANO', 2, 17900, 3900, 1),
  ('REDE', 'Rede', 'PLANO', 3, 24900, 3900, null), ('FISCAL', 'Fiscal', 'ADDON', 9, 5900, 0, null);
update saas.planos set caixas_inclusos_por_loja = 0 where codigo = 'FISCAL';

create table saas.assinaturas (
  id uuid primary key default gen_random_uuid(), empresa_id uuid not null unique references public.empresas(id),
  plano_codigo text not null references saas.planos(codigo), addons text[] not null default '{}',
  status text not null default 'TRIAL' check (status in ('TRIAL', 'ATIVA', 'INADIMPLENTE', 'SUSPENSA', 'CANCELADA')),
  motivo_status text, trial_fim timestamptz, carencia_dias int not null default 5, qtd_lojas int not null default 1,
  qtd_caixas int not null default 1,
  forma_pagamento text not null default 'PIX' check (forma_pagamento in ('PIX', 'BOLETO', 'CARTAO', 'UNDEFINED')),
  valor_mensal_centavos int, asaas_customer_id text, asaas_subscription_id text unique, proximo_vencimento date,
  inadimplente_desde timestamptz, acesso_ate timestamptz, suspensao_aplicada boolean not null default false,
  vendas_suspensas_antes text, motivo_suspensao_antes text, cancelada_em timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table saas.assinaturas enable row level security;
revoke all on all tables in schema saas from public, anon, authenticated;
revoke all on schema saas from public, anon, authenticated;

create table saas.assinatura_auditoria (
  id bigserial primary key, empresa_id uuid not null, operacao text not null, antes jsonb, depois jsonb not null,
  ator uuid, origem text, created_at timestamptz not null default now());
create or replace function saas.tg_auditar_assinatura()
returns trigger language plpgsql security definer set search_path = saas, pg_temp as $$
begin
  insert into saas.assinatura_auditoria (empresa_id, operacao, antes, depois, ator, origem)
  values (new.empresa_id, tg_op, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new),
          nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
          coalesce(nullif(current_setting('fp.cobranca_origem', true), ''), 'sistema'));
  return new;
end $$;
create trigger tg_auditar_assinatura after insert or update on saas.assinaturas
  for each row execute function saas.tg_auditar_assinatura();

create or replace function internal.cobranca_reativar(p_empresa uuid)
returns void language plpgsql security definer set search_path = public, saas, pg_temp as $$
declare a saas.assinaturas;
begin
  select * into a from saas.assinaturas where empresa_id = p_empresa for update;
  if not found or not a.suspensao_aplicada then return; end if;
  update public.configuracoes_gerais set valor = coalesce(a.vendas_suspensas_antes, 'false')
   where empresa_id = p_empresa and chave = 'vendas_suspensas';
  update saas.assinaturas set suspensao_aplicada = false, vendas_suspensas_antes = null,
    motivo_suspensao_antes = null, updated_at = now() where empresa_id = p_empresa;
end $$;

-- Dados FICTÍCIOS: 2 testes grátis (T1 ativo com uso, T2 expirado/suspenso) + 1 empresa paga sem trial (P).
insert into auth.users (id, email, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'dono1@exemplo.test', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000d2', 'dono2@exemplo.test', null),
  ('00000000-0000-0000-0000-0000000000d3', 'dono3@exemplo.test', now());
insert into public.usuarios (id, nome, idioma_preferido) values
  ('00000000-0000-0000-0000-0000000000d1', 'Dono Um', 'zh'), ('00000000-0000-0000-0000-0000000000d2', 'Dono Dois', 'pt'),
  ('00000000-0000-0000-0000-0000000000d3', 'Dono Três', 'pt');
insert into public.empresas (id, nome) values
  ('e0000000-0000-0000-0000-0000000000a1', 'Loja Teste Um'), ('e0000000-0000-0000-0000-0000000000a2', 'Loja Teste Dois'),
  ('e0000000-0000-0000-0000-0000000000a3', 'Loja Paga');
insert into public.lojas (id, empresa_id, nome) values
  ('10000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000a1', 'L1'),
  ('10000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-0000000000a2', 'L2'),
  ('10000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-0000000000a3', 'L3');
insert into public.usuario_vinculos (usuario_id, empresa_id, papel) values
  ('00000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000a1', 'DONO'),
  ('00000000-0000-0000-0000-0000000000d2', 'e0000000-0000-0000-0000-0000000000a2', 'DONO'),
  ('00000000-0000-0000-0000-0000000000d3', 'e0000000-0000-0000-0000-0000000000a3', 'DONO');
insert into public.produtos (loja_id, observacao) values
  ('10000000-0000-0000-0000-0000000000a1', 'DEMO_TRIAL'), ('10000000-0000-0000-0000-0000000000a1', null),
  ('10000000-0000-0000-0000-0000000000a1', 'importado');
insert into public.caixas (id, loja_id) values ('c0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1');
insert into public.vendas (caixa_id, data, status) values
  ('c0000000-0000-0000-0000-0000000000a1', now() - interval '1 day', 'CONCLUIDA'),
  ('c0000000-0000-0000-0000-0000000000a1', now() - interval '20 days', 'CONCLUIDA'),
  ('c0000000-0000-0000-0000-0000000000a1', now(), 'CANCELADA');
insert into public.configuracoes_gerais values
  ('e0000000-0000-0000-0000-0000000000a2', 'vendas_suspensas', 'true', 'text', 'Vendas suspensas');
insert into saas.assinaturas (empresa_id, plano_codigo, status, motivo_status, trial_fim, suspensao_aplicada, vendas_suspensas_antes) values
  ('e0000000-0000-0000-0000-0000000000a1', 'ATACADO', 'TRIAL', null, now() + interval '2 days', false, null),
  ('e0000000-0000-0000-0000-0000000000a2', 'ATACADO', 'SUSPENSA', 'TRIAL_EXPIRADO', now() - interval '1 day', true, 'false');
insert into saas.assinaturas (empresa_id, plano_codigo, status, trial_fim) values
  ('e0000000-0000-0000-0000-0000000000a3', 'BASICO', 'ATIVA', null);
