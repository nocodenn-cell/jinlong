-- CRM-001 · regressão da revisão (PR #688): vendedor lê o catálogo; data futura bloqueada; nome de membro fora
-- da auditoria; duplicado por e-mail na conversão. Transação revertida (não deixa dado no banco).
BEGIN;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'gestor-ref@exemplo.test'), ('00000000-0000-0000-0000-00000000000c', 'vend-c@exemplo.test'), ('00000000-0000-0000-0000-00000000000d', 'vend-d@exemplo.test') on conflict do nothing;
insert into public.commercial_admins (user_id, papel, nome) values ('00000000-0000-0000-0000-00000000000a', 'gestor', 'Gestor ref'), ('00000000-0000-0000-0000-00000000000c', 'vendedor', 'Vend C'), ('00000000-0000-0000-0000-00000000000d', 'vendedor', 'Vend D') on conflict do nothing;

create or replace function public.t_erro(p_sql text, p_esperado text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm not like '%' || p_esperado || '%' and sqlstate <> p_esperado then
      raise exception 'FALHA: esperado % em [%], veio % (%)', p_esperado, p_sql, sqlerrm, sqlstate;
    end if;
    return;
  end;
  raise exception 'FALHA: esperado erro % em [%], mas passou', p_esperado, p_sql;
end $$;
grant execute on function public.t_erro(text, text) to anon, authenticated;
create or replace function public.t_como(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p_user, false) $$;
grant execute on function public.t_como(text) to anon, authenticated;

create temp table t_ids (k text primary key, id uuid);
grant select, insert on t_ids to authenticated;

set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000a');
insert into t_ids values ('H', public.commercial_lead_criar('jinlong', 'Dono Oculto', 'Loja Oculta', '11 91111-2222', 'whatsapp', 'outro'));
select public.commercial_lead_atribuir((select id from t_ids where k='H'), '00000000-0000-0000-0000-00000000000d');
reset role;

-- vendedor lê o catálogo; commercial_planos segue só para gestor
select public.t_como('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if jsonb_array_length(public.commercial_catalogo_planos()) < 4 then raise exception 'FALHA: catálogo vazio para vendedor'; end if;
end $$;
select public.t_erro($$select public.commercial_planos()$$, 'COMMERCIAL_ACESSO_NEGADO');
-- vendedor cadastra telefone de lead oculto sem ser bloqueado (não revela a existência)
insert into t_ids values ('C', public.commercial_lead_criar('jinlong', 'Vend Novo', 'Loja Nova C', '(11) 91111-2222', 'whatsapp', 'prospeccao'));
-- data de contato controlada pelo servidor: futuro bloqueado; agora passa
select public.t_erro($$insert into public.commercial_lead_events (lead_id, kind, body, created_at) values ((select id from t_ids where k='C'), 'contato', 'futuro', now() + interval '30 days')$$, 'row-level security');
insert into public.commercial_lead_events (lead_id, kind, body) values ((select id from t_ids where k='C'), 'contato', 'Contato hoje');
reset role;

-- nome de membro fica fora da auditoria (LGPD)
set role authenticated;
select public.t_como('00000000-0000-0000-0000-00000000000a');
select public.commercial_equipe_salvar('vendedor.c@exemplo.test', 'Nome Sigiloso Teste', 'vendedor', true);
do $$ begin
  if exists (select 1 from public.commercial_audit where tabela='commercial_admins' and (antes::text like '%Nome Sigiloso%' or depois::text like '%Nome Sigiloso%')) then
    raise exception 'FALHA: nome vazou para auditoria';
  end if;
end $$;
-- e-mail igual em outra loja não converte cliente duplicado
insert into t_ids values ('E1', public.commercial_lead_criar('jinlong', 'Contato E1', 'Loja Email A', 'cliente@exemplo.test', 'email', 'outro'));
insert into t_ids values ('P1', public.commercial_proposta_criar((select id from t_ids where k='E1'), null, '{}', null, null, 15000, null, current_date + 5));
select public.commercial_proposta_status((select id from t_ids where k='P1'), 'enviada');
select public.commercial_lead_converter((select id from t_ids where k='E1'), (select id from t_ids where k='P1'), 'Aceite por e-mail confirmado');
insert into t_ids values ('E2', public.commercial_lead_criar('jinlong', 'Contato E2', 'Loja Email B', 'CLIENTE@exemplo.test', 'email', 'outro', p_forcar => true));
insert into t_ids values ('P2', public.commercial_proposta_criar((select id from t_ids where k='E2'), null, '{}', null, null, 15000, null, current_date + 5));
select public.commercial_proposta_status((select id from t_ids where k='P2'), 'enviada');
select public.t_erro($$select public.commercial_lead_converter((select id from t_ids where k='E2'), (select id from t_ids where k='P2'), 'Duplicado por e-mail')$$, 'COMMERCIAL_CLIENTE_DUPLICADO');
reset role;

select 'CRM REVISAO OK' as resultado;
ROLLBACK;
