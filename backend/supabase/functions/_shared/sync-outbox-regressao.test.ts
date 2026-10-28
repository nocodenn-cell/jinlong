// Registra no passo "Test Edge Functions (_shared)" do CI (que roda `deno test backend/supabase/functions/_shared/`)
// os testes de regressão do sync-outbox: escopo de tenant, modo legado (Empresa 1) e decisão da fila de revisão
// offline (20261028130000). Sem mudar workflow: o Deno registra os Deno.test dos módulos importados.
import "../sync-outbox/tenantScope.test.ts";
import "../sync-outbox/revisaoOffline.test.ts";
