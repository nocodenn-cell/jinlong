\set QUIET 1
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'
SET statement_timeout = '20s';
BEGIN; SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000004","role":"authenticated"}', true), set_config('request.jwt.claim.sub','f5100000-0000-4000-8000-000000000004', true);
SAVEPOINT a;
UPDATE public.caixas SET status='ABERTO' WHERE operador_id='f5100000-0000-4000-8000-000000000004';
ROLLBACK TO a;
ROLLBACK;
