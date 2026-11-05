\set QUIET 1
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'
\echo == 1 anon INSERT direto (esperado: permission denied)
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT a; INSERT INTO public.commercial_leads (protocol,product,name,store,contact,channel,locale,status) VALUES ('JL-261104-ABCDEF','jinlong','Teste','Loja Teste','5511999999999','whatsapp','pt-BR','novo'); ROLLBACK TO a;
ROLLBACK;
\echo == 2 anon SELECT direto (esperado: permission denied)
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT b; select 'select', count(*) from public.commercial_leads; ROLLBACK TO b;
ROLLBACK;
\echo == 3 anon RPC valida (esperado: ok, 1 linha inserida)
BEGIN; SET LOCAL ROLE anon;
select public.registrar_lead_comercial('JL-261104-ABCDEF','Maria Teste','Loja Teste','5511999999999','whatsapp','pt-BR','Sao Paulo','importados',NULL,'google','cpc','pedido-demo');
select 'linhas_apos_rpc', count(*) from public.commercial_leads;
ROLLBACK;
\echo == 4 invalidos (esperado: erro LEAD_*)
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT c1; select public.registrar_lead_comercial('XX-1','Maria','Loja','5511999999999','whatsapp','pt-BR'); ROLLBACK TO c1;
SAVEPOINT c2; select public.registrar_lead_comercial('JL-261104-ABCDEF','M','Loja','5511999999999','whatsapp','pt-BR'); ROLLBACK TO c2;
SAVEPOINT c3; select public.registrar_lead_comercial('JL-261104-ABCDEF','Maria','Loja','5511999999999','email','pt-BR'); ROLLBACK TO c3;
SAVEPOINT c4; select public.registrar_lead_comercial('JL-261104-ABCDEF','Maria<script>','Loja','5511999999999','whatsapp','pt-BR'); ROLLBACK TO c4;
SAVEPOINT c5; select public.registrar_lead_comercial('JL-261104-ABCDEF','Maria','Loja','5511999999999','whatsapp','pt-BR','x','importados',NULL,NULL,NULL,NULL); ROLLBACK TO c5;
SAVEPOINT c6; select public.registrar_lead_comercial('JL-261104-ABCDEF','Maria','Loja','5511999999999','whatsapp','pt-BR',NULL,'hackers'); ROLLBACK TO c6;
SAVEPOINT c7; select public.registrar_lead_comercial('JL-261104-ABCDEF','Maria','Loja','5511999999999','whatsapp','pt-BR',NULL,NULL,'ab c'); ROLLBACK TO c7;
ROLLBACK;
\echo == 5 authenticated sem JWT nao lista leads de outros (tabela sem grant ou RLS)
BEGIN; SET LOCAL ROLE authenticated;
SAVEPOINT d; select 'auth_select_leads', count(*) from public.commercial_leads; ROLLBACK TO d;
ROLLBACK;
