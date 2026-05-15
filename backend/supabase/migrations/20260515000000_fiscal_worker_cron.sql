-- Agendamento automático do fiscal-worker via pg_cron + pg_net
--
-- Pré-requisitos (executar uma vez manualmente no projeto Supabase):
--
--   insert into vault.secrets (name, secret)
--   values
--     ('fiscal_worker_url',  'https://<PROJECT_REF>.supabase.co/functions/v1/fiscal-worker'),
--     ('fiscal_worker_key',  '<FISCAL_WORKER_KEY>');
--
-- Após isso, o cron job dispara automaticamente a cada minuto.

-- ============================================================
-- EXTENSÕES
-- ============================================================
create extension if not exists pg_net    with schema extensions;
create extension if not exists pg_cron   with schema extensions;

-- ============================================================
-- FUNÇÃO INVOCADORA
-- ============================================================
create schema if not exists internal;

create or replace function internal.fiscal_worker_invoke()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url  text;
  v_key  text;
  v_req  bigint;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'fiscal_worker_url'
  limit 1;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'fiscal_worker_key'
  limit 1;

  if v_url is null or v_key is null then
    raise warning 'fiscal_worker_invoke: segredos vault ausentes (fiscal_worker_url / fiscal_worker_key)';
    return;
  end if;

  select extensions.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',        'application/json',
                 'X-FISCAL-WORKER-KEY', v_key
               ),
    body    := '{"limit":20}'::jsonb
  ) into v_req;
end;
$$;

-- Apenas postgres/service_role pode executar
revoke all on function internal.fiscal_worker_invoke() from public;

-- ============================================================
-- CRON JOB — a cada minuto
-- ============================================================
select cron.schedule(
  'fiscal-worker-every-minute',
  '* * * * *',
  'select internal.fiscal_worker_invoke()'
);
