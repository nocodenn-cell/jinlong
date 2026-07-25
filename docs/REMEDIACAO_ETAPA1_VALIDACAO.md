# Remediação — ETAPA 1: Validação das hipóteses

**Data:** 2026-07-25 · **Status:** ⛔ **Implementação interrompida.** Duas divergências e um bloqueio exigem decisão antes da ETAPA 2.
**Nenhum workflow, código ou configuração foi alterado nesta etapa.**

---

## 1. Fiscal Worker

### 1.1 Header esperado pela Edge Function — ✅ CONFIRMADO

Verificado no **código deployado** (não só no repositório): função `fiscal-worker`, **versão 35**, `status: ACTIVE`, `verify_jwt: false`, atualizada em 2026-07-15.

```ts
const workerKey = Deno.env.get("FISCAL_WORKER_KEY");
const gotKey = req.headers.get("X-FISCAL-WORKER-KEY")?.trim();   // ← único header lido
const authOk = workerKeyPresent && gotKeyPresent && await timingSafeEqualSecret(workerKey!, gotKey!);
if (!authOk) {
  log("auth_fail", { …, reason: … "header X-FISCAL-WORKER-KEY ausente na requisição" … });
  return json(401, { ok: false, error: "UNAUTHORIZED" });
}
```

Não há nenhuma leitura de `apikey` no corpo da função. O caminho é determinístico: sem `X-FISCAL-WORKER-KEY` ⇒ `gotKeyPresent = false` ⇒ 401.

> **Nota:** a versão deployada está **à frente do repositório** — contém logging estruturado (`log()`, eventos `auth_fail`/`claim_ok`/`doc_emitted`/`run_complete`) que não existe em `backend/supabase/functions/fiscal-worker/index.ts`. Drift código↔deploy a registrar separadamente.

### 1.2 Header enviado pelo cron — ✅ CONFIRMADO

`.github/workflows/fiscal-cron.yml:17-20`:

```yaml
curl -X POST "$URL" \
  -H "apikey: $KEY" \                    # ← único header de auth enviado
  -H "Content-Type: application/json" \
  -d '{"action": "processPending"}'
```

Contrato correto comprovado pelo consumidor que funciona — `pdv-importados/app/gerente/financeiro/actions.ts:175`:
```ts
headers: { 'Content-Type': 'application/json', 'X-FISCAL-WORKER-KEY': key }
```

**Mismatch confirmado.** (Observação menor: `{"action":"processPending"}` também é ignorado — a função só lê `body.limit`.)

### 1.3 Existe realmente resposta HTTP 401? — ⚠️ **DIVERGÊNCIA (inferido, não observado)**

**Não consegui comprovar empiricamente.** Duas tentativas falharam por restrição de ambiente:

- **Teste ao vivo:** bloqueado pelo proxy da sessão. `curl` para `https://kbabmewnahysfvlybiak.supabase.co/functions/v1/fiscal-worker` → `exit 56`, `HTTP=000` (*CONNECT tunnel failed, response 403*). Não é comportamento da função — é a política de rede desta sessão.
- **Log de execução real:** **não existe nenhum.** O histórico retido do `fiscal-cron` são 736 runs, e o mais antigo é de **2026-05-22** — já dentro do apagão de runners. **Todos os 736 falharam sem runner alocado**, portanto o `curl` nunca chegou a ser executado uma única vez no histórico disponível.

**Correção da auditoria:** o relatório anterior afirmou que o job "reportaria sucesso no 401". Isso é uma **previsão correta de leitura de código**, mas foi apresentada como comportamento observado. **Nunca foi observada.** O que está provado é o mismatch de header (§1.1 + §1.2) e a ausência total de processamento (§1.4) — não o 401 em si.

### 1.4 O cron nunca executou com sucesso? — ✅ CONFIRMADO (evidência independente do 401)

Evidência de banco, que não depende de nenhuma inferência sobre HTTP:

```sql
select id, tipo_doc, status, tentativas, ultima_tentativa_em, created_at
from public.documentos_fiscais_pendentes;
```
| tipo_doc | status | tentativas | ultima_tentativa_em | created_at |
|---|---|---:|---|---|
| NFCE | EMITIDO | 1 | **NULL** | 2026-04-08 |
| NFC_E_STUB | PENDENTE | **0** | **NULL** | 2026-06-12 |

`fiscal_claim_documentos` grava `ultima_tentativa_em = now()` **no ato do claim**. Os dois documentos têm `ultima_tentativa_em = NULL` ⇒ **o worker nunca reivindicou nenhum documento**. O `PENDENTE` está parado há 6 semanas com `tentativas = 0`.

### 1.5 Veredito Fiscal

**Hipótese central confirmada:** o cron está incorreto e nunca processou nada. A correção proposta (corrigir header + `--fail`, ou migrar para `pg_cron`) é válida e segura independentemente de o 401 ter sido observado ou não.

**Confiança:** Alta para o mismatch e para o não-processamento. **Média** para o mecanismo exato da falha silenciosa (previsão de código, não medição).

---

## 2. Deploy

### 2.1 A Vercel continua fazendo todos os deploys? — ✅ CONFIRMADO

20 deployments mais recentes: 16 `READY`, 4 `CANCELED`, 0 `ERROR`. Todos com `meta.githubDeployment: "1"` e `source: "git"` — criados pela integração nativa via webhook.

### 2.2 O job `amondnet/vercel-action` nunca é utilizado? — ✅ CONFIRMADO, **e mais grave que o descrito**

Evidência decisiva no **último run com runner real** (`25646949660`, `main`, 2026-05-11, `runner_id: 1000000162`):

| Job | Conclusão |
|---|---|
| `build-and-test` | **failure** — no step *"Lint, typecheck e unit tests"* |
| `deploy` | **skipped** |
| `E2E crítico (gate)` | skipped |
| `smoke-test` | skipped |
| `e2e-playwright` | skipped |

**Achado novo:** em 11/05 o `build-and-test` executou de verdade e **falhou por erro real de lint/typecheck/teste** — não por falta de runner. Ou seja, **o `deploy` já estava sendo pulado antes do apagão de runners começar**, por outro motivo.

Consequência: não existe registro de o job `deploy` ter executado em nenhum momento do histórico retido. E o pipeline não produz um `main` verde desde **pelo menos 11/05**.

*(Nota: os nomes de job mudaram desde então — `E2E crítico (gate)` e `smoke-test` viraram `E2E crítico (sistema de risco)` e `validate-production (SSRA)`.)*

### 2.3 Onde ocorre hoje o upload de sourcemaps? — ⚠️ **DIVERGÊNCIA (risco menor que o auditado)**

A auditoria afirmou que remover o job `deploy` "perde sourcemaps e release do Sentry". **Isso está impreciso em dois pontos.**

**(a) Já existe upload no build, independente do CI.** `pdv-importados/next.config.js`:

```js
const { withSentryConfig } = require('@sentry/nextjs');   // linha 2
…
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
```

Com `@sentry/nextjs@^10.49.0`, o plugin faz upload de sourcemaps e cria release **durante o `next build`** — inclusive no build da Vercel — desde que `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` estejam no ambiente. Os steps `getsentry/action-sourcemaps` e `getsentry/action-release` do job `deploy` são **redundantes** com isso; subiam sourcemaps de um *segundo* build feito no runner.

**(b) Como o job `deploy` nunca executa, nada está sendo enviado por ele hoje.** Remover um job que está 100% `skipped` **não pode causar regressão de comportamento atual**. O risco levantado na auditoria só existiria no cenário contrafactual de os runners voltarem.

**Conclusão revisada:** a Fase A é **substancialmente mais segura** do que a auditoria indicou. Não há perda de observabilidade ao remover o job.

**Ressalva que permanece:** não consigo ler as variáveis de ambiente do projeto na Vercel (a API/MCP disponível não expõe env vars). **Se `SENTRY_AUTH_TOKEN` não estiver configurado na Vercel, então hoje já não há upload de sourcemaps nenhum** — o que seria um problema pré-existente, não causado pela remoção. Precisa ser verificado manualmente.

### 2.4 Migração para a integração nativa Vercel↔Sentry

Não é necessária uma "migração" — o mecanismo já está no código. O que é preciso é **garantir a configuração**:

| Variável | Onde | Status |
|---|---|---|
| `SENTRY_AUTH_TOKEN` | Vercel → Project → Environment Variables (Production + Preview) | ❓ **não verificável nesta sessão** |
| `SENTRY_ORG` | idem | ❓ não verificável |
| `SENTRY_PROJECT` | idem | ❓ não verificável |

Alternativa mais robusta: instalar a **integração oficial Sentry↔Vercel**, que injeta essas variáveis automaticamente e associa releases a deployments.

---

## 3. Branch Protection — ⛔ **BLOQUEIO**

**Instrução recebida:** *"Verifique se a remoção dos jobs não quebrará os Required Checks. Caso exista qualquer risco de bloquear merges, pare e documente."*

**Não é possível verificar.** Todos os canais estão fechados nesta sessão:

```
GET /repos/nocodenn-cell/fastproduct/branches/main/protection
  → "GitHub access is not enabled for this session..."
GET /repos/nocodenn-cell/fastproduct/rulesets          → idem
GET /repos/nocodenn-cell/fastproduct/environments      → "not permitted through this proxy"
pull_request_read(get_status)                          → 403 Resource not accessible by integration
```
Não há tool de branch protection no MCP disponível.

**O risco é real e não pode ser descartado.** As mudanças planejadas alteram nomes/existência de contextos de check:

| Mudança planejada | Contexto afetado | Se for Required Check |
|---|---|---|
| Remover job `deploy` | `deploy` | 🔴 PRs travam para sempre aguardando status |
| Remover `e2e-playwright-only.yml` | `e2e-critical` | 🔴 idem (já é deadlock hoje: 0 runs) |
| Mover `rust-tauri-checks` para semanal | `rust-tauri-checks` | 🔴 idem |
| Renomear `build-and-test` (colisão) | `build-and-test` | 🔴 idem |
| CI só em `pull_request` | vários | 🟡 depende de "require branches up to date" |

**Evidência indireta de que talvez não haja Required Checks:** PR #232 foi mergeado em 2026-07-24T20:48:34Z por `nocodenn-cell` com **todos** os checks em `failure`. Isso sugere ausência de required checks **ou** bypass de owner. Mas "sugere" não é "confirma" — e a diferença entre as duas hipóteses muda o resultado da remediação.

**Desbloqueio necessário (1 minuto):** print ou colagem de **Settings → Branches → `main`** (ou Settings → Rules → Rulesets), mostrando a lista de *Required status checks*.

---

## 4. Resumo para decisão

| # | Hipótese da auditoria | Veredito |
|---|---|---|
| 1 | Header do fiscal-cron está errado | ✅ Confirmado (código deployado v35 + workflow) |
| 2 | Cron nunca processou nada | ✅ Confirmado (banco: `ultima_tentativa_em` NULL) |
| 3 | Cron retorna 401 e reporta verde | ⚠️ **Inferido, nunca observado** — sem runner em todo o histórico retido; teste ao vivo bloqueado pelo proxy |
| 4 | Vercel faz todos os deploys | ✅ Confirmado |
| 5 | Job `deploy` nunca executa | ✅ Confirmado — **e já era pulado antes do apagão**, por falha real de lint/teste em 11/05 |
| 6 | Remover `deploy` perde sourcemaps | ⚠️ **Impreciso** — `withSentryConfig` já sobe no build; job skipped não envia nada. Risco bem menor |
| 7 | Required Checks podem quebrar | ⛔ **Não verificável** — bloqueio |

### O que muda no plano

- **Fase A ficou mais segura** (achado 6) — remover o job `deploy` é no-op de comportamento.
- **Fase B continua justificada** (achados 1 e 2), com a ressalva do achado 3.
- **Fase C está bloqueada** pelo achado 7 até haver visibilidade dos Required Checks.
- **Achado novo fora do escopo:** `main` não produz CI verde desde ~11/05 por falha real de lint/typecheck/teste, anterior ao apagão. Quando os runners voltarem, `build-and-test` provavelmente **continuará vermelho** — o apagão está mascarando uma quebra real que ninguém corrigiu.

---

## 5. ADENDO (pós-desbloqueio) — Required Checks são contextos órfãos

O usuário informou que os Required Status Checks de `main` são: **`build`, `lint`, `test`, `typecheck`**.

**Divergência material: nenhum desses quatro contextos é publicado por coisa alguma neste repositório.**

### Evidência

Varredura de todos os `job_id` e `name:` dos 6 workflows:

| Workflow | Contextos publicados |
|---|---|
| `ci-backend-supabase.yml` | `Supabase local RLS smoke`, `Test RLS scope by profile`, `edge-functions-typecheck`, `outbox-contract`, `rls-rest-gate`, `migration-remote-drift`, `anti-replay-diagnostic-gate` |
| `ci-pdv-importados.yml` | `build-and-test`, `E2E crítico (sistema de risco)`, `deploy`, `validate-production (SSRA)`, `e2e-playwright` |
| `ci-pdv-local.yml` | `build-and-test`, `rust-tauri-checks` |
| `e2e-playwright-only.yml` | `e2e-critical` |
| `fiscal-cron.yml` | `call-worker` |
| `secret-scan.yml` | `gitleaks` |

```
grep -rnE "^\s+(name:\s*)?(build|lint|test|typecheck):\s*$" .github/workflows/
→ NENHUM job com esses nomes
```

Não há outro sistema de CI (`.circleci`, `.gitlab-ci.yml`, `Jenkinsfile`, etc. — nenhum existe). Os check-runs observados nos PRs #225, #229 e #233 confirmam: além dos jobs do Actions, só aparecem `Vercel Preview Comments` e `Supabase Preview`. **Nenhum `build`/`lint`/`test`/`typecheck`.**

### Consequências

1. **Os quatro Required Checks nunca podem ser satisfeitos.** Todo PR para `main` deveria ficar preso em *"Expected — Waiting for status to be reported"*. É a armadilha descrita na auditoria — só que pior: os contextos não estão path-filtered, estão simplesmente ausentes.
2. **Isso explica o merge do PR #232** com todos os checks vermelhos: só foi possível por bypass do owner.
3. **A governança de `main` é hoje decorativa** — existe uma regra que nada satisfaz, contornada manualmente.

### Efeito sobre as Fases A/B/C — libera, não bloqueia

A instrução *"preserve os quatro contexts, não altere nem remova"* fica automaticamente satisfeita: **nenhuma mudança planejada toca em `build`/`lint`/`test`/`typecheck`, porque eles não existem em lugar nenhum.** Remover `deploy`, remover `e2e-playwright-only`, mover `rust-tauri-checks` e desduplicar push/PR **não podem** piorar o estado dos required checks.

Já a instrução *"mantenha esses mesmos status sendo publicados"* **não pode ser cumprida literalmente**, porque eles nunca foram publicados. Fica registrada como recomendação para a Fase D.

### Verificação de referências antes de remover (exigida)

| Workflow a remover | Referências externas | Veredito |
|---|---|---|
| `e2e-playwright-only.yml` | Apenas `.cursor/skills/engineering-loop/references/monorepo.md:31` (lista documental) | ✅ Seguro — atualizar a doc junto |
| `fiscal-cron.yml` | Apenas `.cursor/skills/engineering-loop/references/monorepo.md:33` (lista documental) | ✅ Seguro — atualizar a doc junto |

Sem `workflow_call`, sem `workflow_run`, sem `uses: ./.github/workflows/...` — **não há acoplamento entre workflows**. E a branch `staging`, único gatilho de push do `e2e-playwright-only.yml`, **não existe** (nem local nem remota), o que confirma seus 0 runs.
