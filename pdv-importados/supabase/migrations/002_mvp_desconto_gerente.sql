-- PDV Importados — MVP: sincronizar desconto especial do gerente
-- Executar via: npx supabase db push

-- Para permitir o PDV local (que ainda não envia caixa_id/operador_id) no MVP,
-- removemos NOT NULL desses campos.
alter table public.vendas
  alter column caixa_id drop not null,
  alter column operador_id drop not null;

-- Desconto especial aplicado pelo gerente (além do atacado automático).
-- MVP: gerente_id como TEXT (o PDV local ainda pode enviar um ID local).
create table if not exists public.descontos_venda (
  venda_id uuid primary key references public.vendas(id) on delete cascade,
  gerente_id text,
  desconto_percentual numeric(10,4),
  desconto_valor numeric(10,2)
);

