\set QUIET 1
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'
\echo == pg_stat_statements (anon)
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT a; select 'pg_stat_statements linhas', count(*) from extensions.pg_stat_statements; ROLLBACK TO a;
ROLLBACK;
\echo == net (anon): enfileira requisicao HTTP
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT b; select 'net.http_get enfileirado (id)', net.http_get('https://example.invalid/probe') is not null; ROLLBACK TO b;
ROLLBACK;
\echo == graphql (anon)
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT c; select 'graphql.resolve', left(graphql.resolve('{ __typename }')::text, 80); ROLLBACK TO c;
ROLLBACK;
\echo == realtime.messages (anon): INSERT sem policy
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT d; insert into realtime.messages (topic, extension, payload, event, private) values ('probe','broadcast','{}'::jsonb,'e',false); select 'realtime insert anon ok'; ROLLBACK TO d;
ROLLBACK;
\echo == storage.objects (anon): INSERT sem policy
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT e; insert into storage.objects (bucket_id, name) values ('produto-imagens','probe/x.jpg'); select 'storage insert anon ok'; ROLLBACK TO e;
ROLLBACK;
\echo == storage.buckets (anon): UPDATE do bucket publico
BEGIN; SET LOCAL ROLE anon;
SAVEPOINT f; with u as (update storage.buckets set public = public where id='produto-imagens' returning 1) select 'storage bucket update anon linhas', count(*) from u; ROLLBACK TO f;
ROLLBACK;
