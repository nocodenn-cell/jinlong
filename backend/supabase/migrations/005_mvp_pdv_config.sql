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

-- Seed com valores compatíveis com o pdv-local atual (fallback).
-- Senha default do pdv-local: "1234"
insert into public.pdv_config (id, gerente_id, gerente_senha_sha256, max_desconto_gerente_percentual)
values (
  1,
  'gerente-local-1',
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  30
)
on conflict (id) do update
set
  gerente_id = excluded.gerente_id,
  gerente_senha_sha256 = excluded.gerente_senha_sha256,
  max_desconto_gerente_percentual = excluded.max_desconto_gerente_percentual;

