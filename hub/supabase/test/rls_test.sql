-- a = admin, b = autenticado comum. Cada bloco falha (raise) se a regra não valer.
insert into public.commercial_admins (user_id) values ('00000000-0000-0000-0000-00000000000a');

-- anon: insere lead (site) …
set role anon;
select set_config('request.jwt.claim.sub', '', false);
insert into public.commercial_leads (protocol, product, name, store, contact, channel, locale)
values ('JL-261020-ABCDEF', 'jinlong', 'Fictício', 'Loja Fictícia', '11912345678', 'whatsapp', 'pt-BR');
-- … mas não lê leads, eventos, clientes nem admins
do $$ begin
  begin perform 1 from public.commercial_leads; raise exception 'FALHA: anon leu leads';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.commercial_lead_events; raise exception 'FALHA: anon leu eventos';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.commercial_customers; raise exception 'FALHA: anon leu clientes';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.commercial_admins; raise exception 'FALHA: anon leu admins';
  exception when insufficient_privilege then null; end;
  begin update public.commercial_leads set status = 'contratado'; raise exception 'FALHA: anon alterou lead';
  exception when insufficient_privilege then null; end;
end $$;
-- anon não escolhe status ao inserir
do $$ begin
  begin
    insert into public.commercial_leads (protocol, product, name, store, contact, channel, locale, status)
    values ('JL-261020-ABCDEG', 'jinlong', 'X', 'Loja', '11912345678', 'whatsapp', 'pt-BR', 'contratado');
    raise exception 'FALHA: anon definiu status';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- autenticado sem papel admin: não vê nada nem altera
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ declare n int; begin
  select count(*) into n from public.commercial_leads; if n <> 0 then raise exception 'FALHA: não-admin viu % leads', n; end if;
  select count(*) into n from public.commercial_customers; if n <> 0 then raise exception 'FALHA: não-admin viu clientes'; end if;
  update public.commercial_leads set status = 'perdido'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: não-admin alterou lead'; end if;
  if public.is_commercial_admin() then raise exception 'FALHA: não-admin reconhecido como admin'; end if;
  begin
    insert into public.commercial_lead_events (lead_id, kind, body) select id, 'nota', 'x' from public.commercial_leads;
    insert into public.commercial_customers (product, store_name) values ('jinlong', 'Invasor');
    raise exception 'FALHA: não-admin inseriu cliente';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.commercial_admins; raise exception 'FALHA: não-admin leu admins';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- admin: lê, muda status, registra histórico e cliente
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare n int; lid uuid; begin
  select count(*) into n from public.commercial_leads; if n <> 1 then raise exception 'FALHA: admin viu % leads', n; end if;
  select id into lid from public.commercial_leads limit 1;
  update public.commercial_leads set status = 'contratado', updated_at = now() where id = lid;
  insert into public.commercial_lead_events (lead_id, kind, from_status, to_status) values (lid, 'status', 'novo', 'contratado');
  insert into public.commercial_customers (lead_id, product, store_name) values (lid, 'jinlong', 'Loja Fictícia');
  select count(*) into n from public.commercial_lead_events where author = auth.uid(); if n <> 1 then raise exception 'FALHA: autor'; end if;
  begin delete from public.commercial_leads; raise exception 'FALHA: admin apagou lead (sem grant de delete)';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
