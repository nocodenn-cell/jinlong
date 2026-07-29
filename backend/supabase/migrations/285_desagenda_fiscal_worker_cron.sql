-- 285 — Desagenda o cron do worker fiscal (P0-5, Opção A)
--
-- CONTEXTO
-- O job `fiscal-worker-every-minute` (jobid 1, schedule '* * * * *') chamava
-- internal.fiscal_worker_invoke() 1.440 vezes por dia. A função lê os segredos
-- `fiscal_worker_url` e `fiscal_worker_key` do Vault e, quando ausentes, emite
-- `raise warning` e retorna normalmente. O Vault está VAZIO desde sempre, então:
--
--   - vault.secrets                      = 0 linhas
--   - net._http_response                 = 0 linhas (nenhum HTTP jamais saiu)
--   - cron.job_run_details (24h)         = 1.440 'succeeded', 0 'failed'
--
-- Ou seja: o job nunca fez nada e reportou sucesso 1.440x/dia. Qualquer
-- monitoramento baseado em cron.job_run_details mostrava verde.
--
-- JUSTIFICATIVA DE DESLIGAR (em vez de corrigir)
-- 1. O módulo fiscal não está em uso: 2 documentos em documentos_fiscais_pendentes
--    em 4 meses (1 EMITIDO em 08/04, 1 PENDENTE travado desde 12/06), contra 56
--    vendas registradas. A enfileiração automática não está ativa em produção.
-- 2. Não há provider fiscal real configurado. O fiscal-worker usa
--    FISCAL_PROVIDER_TYPE ?? 'mock', e o MockProvider fabrica chave
--    'NFE-MOCK-<venda>-<rand>'. Ligar o worker sem provider real faria o sistema
--    tentar marcar vendas como emitidas com chave inventada.
-- 3. A constraint `documentos_fiscais_chave_formato` (migration 280) rejeita esse
--    formato — verificado empiricamente: UPDATE com 'NFE-MOCK-...' levanta
--    check_violation mesmo com a constraint NOT VALID. O hardening da Fase 1
--    contém o risco, mas o resultado seria todo documento falhando em loop.
-- 4. Não faz sentido manter um agendador ativo para um módulo que não entra no
--    piloto. Desligado e explícito é melhor que ligado e mentindo.
--
-- IMPACTO
-- Nenhum impacto funcional: o job já não produzia efeito algum. Deixa de gerar
-- 1.440 registros falsos de sucesso por dia em cron.job_run_details.
-- Não altera schema, dados, permissões ou qualquer RPC. Os 2 documentos
-- existentes permanecem intactos.
--
-- ROLLBACK
--   select cron.schedule(
--     'fiscal-worker-every-minute',
--     '* * * * *',
--     'select internal.fiscal_worker_invoke()'
--   );
-- Antes de reagendar, popular o Vault e definir FISCAL_PROVIDER_TYPE
-- explicitamente na Edge Function — ver docs/REMEDIACAO_FASE_B_FISCAL.md.
--
-- VALIDAÇÃO
--   select count(*) from cron.job where jobname = 'fiscal-worker-every-minute';
--   -- esperado: 0
--
-- Idempotente: não falha se o job já não existir (ex.: ambiente novo/staging).

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
    from cron.job
   where jobname = 'fiscal-worker-every-minute';

  if v_jobid is null then
    raise notice '285: job fiscal-worker-every-minute nao existe — nada a fazer';
    return;
  end if;

  perform cron.unschedule(v_jobid);
  raise notice '285: job % (fiscal-worker-every-minute) desagendado', v_jobid;
end $$;
