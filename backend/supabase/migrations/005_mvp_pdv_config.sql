-- PDV Importados — MVP: configuração do PDV no Supabase
-- Executar via: npx supabase db push

-- Por MVP, mantemos 1 linha (id=1) para simplificar por enquanto.
-- Futuro: separar por loja/tenant e/ou por usuário.
create table if not exists public.pdv_config (
  id integer primary key default 1,
  gerente_id text not null,
  gerente_senha_sha256 text not null,
  max_desconto_gerente_percentual numeric(10,4) not null default 30
);

-- Seed inicial: hash sentinela (sem senha humana pública). Alinhado a `PDV_CONFIG_GERENTE_HASH_SENTINEL` no pdv-local.
-- Defina senha real com UPDATE em `gerente_senha_sha256` antes do piloto em produção.
insert into public.pdv_config (id, gerente_id, gerente_senha_sha256, max_desconto_gerente_percentual)
values (
  1,
  'gerente-local-1',
  'b70ce4bad0e8696e32bf9742941625d2579a2fe1b4ec0883374b4268a6435ed1',
  30
)
on conflict (id) do update
set
  gerente_id = excluded.gerente_id,
  gerente_senha_sha256 = excluded.gerente_senha_sha256,
  max_desconto_gerente_percentual = excluded.max_desconto_gerente_percentual;

