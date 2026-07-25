# Plano de Remediação — CI/CD, Deploy, SSRA e Fiscal

**Data:** 2026-07-25
**Natureza:** investigação e planejamento. **Nenhuma alteração de código, workflow, schema ou configuração foi executada. Nenhum commit, nenhum PR.**
**Base:** `docs/AUDITORIA_CICD_DEPLOY_TRAVADO.md` (auditoria anterior) + investigação nova desta rodada.

---

## 0. Sumário executivo

A auditoria anterior concluiu que o problema era o esgotamento de runners do GitHub Actions. **Isso continua verdadeiro, mas esta rodada encontrou três problemas independentes e mais graves, que não seriam resolvidos pela correção de billing.**

| # | Achado novo | Severidade | Confiança |
|---|---|---|---|
| **N1** | **Produção está servindo código de 23/07.** `pdv-importados.vercel.app` responde com `dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU` / commit `a4edafbf`. O `main` está em `6781684b`, e o alias de produção nunca migrou. **Dois PRs mergeados (#231 e #232, todo o BL-1) não estão no ar.** | 🔴 **P0** | **Alto** |
| **N2** | **O gate SSRA não detectaria N1.** Ele compara "plataforma ↔ runtime" para o mesmo host — é um teste de *coerência*, não de *atualidade*. Hoje ele **passaria** com produção 2 dias defasada. | 🔴 **P0** | **Alto** |
| **N3** | **O `fiscal-cron` nunca funcionou** — nem antes do apagão de runners. Envia a chave no header `apikey`, mas a Edge Function exige `X-FISCAL-WORKER-KEY` → HTTP 401. E como o `curl` não usa `-f`, o job **sairia com código 0**, reportando sucesso. | 🔴 **P0** | **Muito alto** |

Achados secundários relevantes: migration `092` (máquina de estados fiscal) **não aplicada** no banco; overload quebrado e **sem autorização** de `fiscal_reprocessar_documento`; ausência total de *reaper* para documentos presos em `EM_PROCESSAMENTO`; colisão de nome de check `build-and-test` entre dois workflows.

> **Consequência de planejamento:** corrigir billing (item C1 da auditoria anterior) **não é mais o primeiro passo**. Ele é necessário, mas N1 é um incidente de produção ativo e independente.

---

## 1. Billing / GitHub Actions — pipeline simplificado

### 1.1 Diagnóstico de custo e redundância

**Evidências:**

- 6 workflows, ~13 jobs por push que casa todos os filtros.
- `fiscal-cron.yml` roda `*/5 * * * *` = **288 execuções/dia** = ~8.640/mês, só para disparar um `curl`. É o maior consumidor de *runs* do repositório por ordem de magnitude, e **não é CI** — é um scheduler de produção morando no CI.
- `ci-pdv-local.yml` → `rust-tauri-checks` roda em `windows-latest`, que consome **2× minutos** por minuto de execução (Cargo build + test de Tauri não é barato).
- **Três caminhos distintos para rodar Playwright**: `e2e-critical` (em `ci-pdv-importados.yml`), `e2e-playwright` (mesmo arquivo, atrás de `vars.ENABLE_PLAYWRIGHT_E2E`) e `e2e-playwright-only.yml` (branch `staging`). Os dois primeiros instalam Chromium e o mesmo toolchain; a diferença real é o script (`test:e2e:critical` vs `test:e2e`).
- **Colisão de nome:** `ci-pdv-importados.yml` e `ci-pdv-local.yml` **ambos** definem um job chamado `build-and-test`. Como Required Status Check, o contexto `build-and-test` é ambíguo — é satisfeito por qualquer um dos dois que reporte.

**Confiança:** Alta (leitura direta dos 6 arquivos; contagem de cron é aritmética).
**Limitações:** não tenho acesso à página de billing, então não sei a distribuição real de minutos consumidos por workflow nem quanto do limite cada um consome. A priorização abaixo é por natureza do workload, não por fatura medida.

### 1.2 Classificação

| Workflow | Veredito | Justificativa |
|---|---|---|
| `secret-scan.yml` | ✅ **Manter** | Barato, roda sempre, é o único gate de segredo. Candidato natural a Required Check. |
| `ci-backend-supabase.yml` | ✅ **Manter, consolidando** | 7 jobs separados que compartilham checkout+setup. Vários poderiam ser *steps* de 1–2 jobs. `anti-replay-diagnostic-gate` em `windows-latest` precisa de justificativa — se o teste não é específico de Windows, migrar para `ubuntu`. |
| `ci-pdv-importados.yml` | ⚠️ **Manter, mas remover `deploy`** | Ver §2. `build-and-test` é o gate real. `e2e-playwright` é redundante. |
| `ci-pdv-local.yml` | ⚠️ **Manter, renomear job** | Válido, mas `build-and-test` colide. Renomear para `pdv-local-build-and-test`. Avaliar rodar `rust-tauri-checks` só em PR que toque `src-tauri/**`, ou em cron semanal. |
| `e2e-playwright-only.yml` | ❌ **Remover** | Dispara só em `staging` (branch que não aparece no fluxo atual) e duplica `e2e-critical`. Único workflow com `concurrency` — mas irrelevante, já que não dispara. |
| `fiscal-cron.yml` | ❌ **Remover do Actions** | Não é CI. Ver §4 — deve virar `pg_cron` no Supabase. Remove ~8.640 runs/mês **e** elimina o acoplamento entre saúde do CI e operação fiscal de produção. |

### 1.3 Pipeline proposto

```
┌─ pr-checks.yml ──────────────── PR + push (main), SEM path filter
│    ├── secret-scan          (gitleaks)
│    ├── web-build-and-test   (guard:all, lint, typecheck, test, build — pdv-importados)
│    ├── backend-checks       (RLS smoke + scope + edge typecheck + outbox — 1 job, steps)
│    └── desktop-build-and-test (pdv-local; rust-tauri só se src-tauri/** mudou)
│
├─ e2e.yml ────────────────────── schedule noturno + workflow_dispatch + label "run-e2e"
│    └── e2e-critical         (sistema de risco, nunca bloqueia)
│
└─ release-validate.yml ───────── on: deployment_status (production, success)
     └── ssra                 (ver §3)
```

**Ganhos:** 6 → 3 workflows; ~8.640 runs/mês eliminados; fim da colisão de nomes; **path filters removidos dos checks obrigatórios** (fecha a armadilha de "Waiting for status to be reported" da auditoria anterior); E2E sai do caminho crítico de todo PR.

**Ponto de atenção — trade-off honesto:** remover os path filters faz **todo** PR rodar o CI inteiro, o que *aumenta* o consumo de minutos por PR. A economia líquida vem do `fiscal-cron` (que domina o volume) e do E2E fora do caminho crítico. Se o orçamento de Actions for muito apertado, a alternativa é manter path filters **e** garantir que nenhum job path-filtered seja Required Check — as duas coisas não podem coexistir.

**Alternativas consideradas:**
- *Self-hosted runners*: elimina o custo de minutos, mas adiciona superfície de segurança e manutenção. Desproporcional para o tamanho atual.
- *Manter tudo e só pagar*: aceitável se o volume do `fiscal-cron` for corrigido primeiro; sem isso, o billing volta a estourar.

**Recomendação:** consolidar para 3 workflows conforme acima, **começando pela remoção do `fiscal-cron` do Actions** — é a maior economia isolada e resolve um problema de produção ao mesmo tempo (§4).

---

## 2. Deploy de produção — análise arquitetural

### 2.1 Os dois mecanismos

| | **GitHub App da Vercel** (nativa) | **`amondnet/vercel-action@v25`** (job `deploy`) |
|---|---|---|
| Gatilho | Webhook de push, direto do GitHub | Job do Actions, após `build-and-test` |
| Onde builda | Infra da Vercel | Runner do Actions **e** infra da Vercel |
| Credenciais | OAuth da App instalada | 3 secrets (`VERCEL_TOKEN`, `ORG_ID`, `PROJECT_ID`) |
| Depende de runner? | **Não** | **Sim** |
| Preview por PR | Automático, com alias por branch | Não gera preview (usa `--prod`) |
| Status atual | ✅ Funcionando há semanas | ❌ Nunca executa (`needs: build-and-test`) |

**Evidência:** todos os 20 deployments recentes têm `meta.githubDeployment: "1"` e `source: "git"` — foram criados pela integração nativa. O job `deploy` está `skipped` em 100% das execuções.

### 2.2 Vantagens e desvantagens

**GitHub App nativa**
- ✅ Não depende de runner — provou-se resiliente exatamente durante o apagão.
- ✅ Preview automático por PR/branch com alias estável (`pdv-importados-git-<branch>-jinlong.vercel.app`).
- ✅ Cache de build da Vercel entre deploys; sem `npm ci` duplicado.
- ✅ Menos segredo em circulação (sem `VERCEL_TOKEN` no CI).
- ❌ **Deploya sem gate.** Todo push em `main` vai a produção independentemente de lint/teste. Esse é o defeito estrutural — e é exatamente o que está acontecendo hoje.
- ❌ Não integra naturalmente com Sentry (release + sourcemaps).

**`amondnet/vercel-action`**
- ✅ Deploy ocorre **depois** do gate (`needs: build-and-test`), respeitando o pipeline.
- ✅ Permite passos pré/pós no mesmo job — hoje é onde vivem o upload de sourcemaps e a criação do release no Sentry.
- ✅ `EXPECTED_VERCEL_PROJECT_ID` dá fail-fast contra deploy no projeto errado.
- ❌ Depende de runner: sem runner, **não há deploy de produção** — falha fechada e silenciosa.
- ❌ Builda duas vezes (uma no runner para o Sentry, outra na Vercel), gastando minutos.
- ❌ Action de terceiro, não fixada por SHA (`@v25` é tag móvel) — risco de supply chain.
- ❌ 3 secrets de longa duração no CI.

### 2.3 Riscos de manter ambos (situação atual)

1. **Deploy duplo concorrente.** Assim que o billing for restaurado, cada push em `main` disparará os dois. Dois deployments de produção para o mesmo commit, competindo pelo alias.
2. **Race no alias.** Quem promove por último vence. Não determinístico.
3. **SSRA envenenado.** O gate lê o deployment corrente do host; se o deploy nativo promover enquanto o do Actions ainda constrói, o SSRA valida um ID e o alias muda embaixo dele — falso negativo em deploy correto.
4. **Auditoria ambígua.** Não há como responder "quem publicou este release?" sem inspecionar `meta` de cada deployment.
5. **Custo duplicado** de build.

### 2.4 Impactos por dimensão

**Rollback.** Nativa: `Instant Rollback` no dashboard, sem CI, segundos. Action: exige re-run de workflow ou `vercel` CLI manual — e **se o CI estiver quebrado, não há rollback pelo pipeline**. Vantagem decisiva da nativa, especialmente porque o modo de falha observado (CI morto) é justamente quando se precisa de rollback.

**Preview Deployments.** Só a nativa entrega. A Action usa `--prod`, sem preview. Remover a nativa mataria os previews de PR — que hoje são o único ambiente de validação visual disponível (PR #229 depende deles).

**Production Deployments.** Ambas produzem `target: production`. A diferença é o gate: nativa deploya sempre; Action deploya só após verde.

**Observabilidade.** Aqui a Action tem vantagem real e mensurável: os passos `getsentry/action-sourcemaps` e `getsentry/action-release` só existem lá. Removê-la **perde release tracking e sourcemaps no Sentry** — regressão concreta de observabilidade, não teórica. Precisa de substituto.

**Auditoria.** Empate técnico com vantagem para a nativa: `meta.githubCommitSha`, `githubCommitRef`, `githubPrId` e `githubCommitVerification` vêm preenchidos e são consultáveis pela API, ligando deployment ↔ commit ↔ PR sem depender do CI.

### 2.5 Recomendação

> **Adotar exclusivamente a GitHub App nativa da Vercel. Remover o job `deploy` de `ci-pdv-importados.yml`.**

**Justificativa técnica:**

1. **Resiliência comprovada em falha real.** Durante três semanas de apagão de runners, a nativa entregou 16 deployments `READY`; a Action entregou zero. Isso não é hipótese — é o registro do incidente.
2. **Rollback é a operação mais crítica em incidente**, e a nativa é a única que funciona quando o CI está fora.
3. **Previews são requisito ativo** do fluxo de trabalho atual.
4. **Menor superfície de segredo e de supply chain** (sem `VERCEL_TOKEN` no CI, sem action de terceiro em tag móvel).
5. O defeito da nativa — deployar sem gate — **não se resolve escolhendo a Action**; resolve-se com Branch Protection (§5). O gate correto é *não deixar código ruim entrar em `main`*, não *não deployar `main`*. Deployar `main` sempre é a semântica desejada de trunk-based; o gate pertence ao merge.

**Condições obrigatórias** para que a recomendação seja segura (sem elas, não execute):

- **(a)** Substituir o Sentry release/sourcemaps. Opções: integração nativa Sentry↔Vercel (preferível, sem CI), ou um job disparado em `on: deployment_status`. **Não remova o job `deploy` antes disso** — perderia observabilidade de produção silenciosamente.
- **(b)** Branch Protection efetivo em `main` (§5), senão troca-se "deploy que nunca acontece" por "deploy sem nenhum gate".
- **(c)** SSRA reposicionado (§3).

**Alternativa** (se o time preferir gate no deploy): manter a Action, desligar o auto-deploy nativo em Settings → Git, fixar a action por SHA e **aceitar** que sem runner não há deploy nem rollback. Tecnicamente defensável, mas contradiz a evidência do incidente. Não recomendo.

---

## 3. SSRA

### 3.1 Objetivo original e o que valida

**Evidência** (`docs/SSRA_RELEASE.md` + `scripts/validate-production.mjs`):

> *"A única identidade de produção é o Deployment ID que a Vercel associa ao host de produção. O runtime em `/api/health` apenas declara qual deployment está executando; o gate compara plataforma ↔ runtime, nunca Git ↔ runtime."*

Concretamente, o script:
1. `GET https://api.vercel.com/v13/deployments/{PRODUCTION_HOST}` → `platformId`.
2. `GET https://{PRODUCTION_HOST}/api/health` → `runtimeId`, com 12 tentativas × 5s (propagação de CDN).
3. Falha se `platformId !== runtimeId`.

O problema original que ele resolve é legítimo e específico: **CDN servindo um build antigo depois de um deploy** (alias promovido mas edge ainda com cache velho), e **deploy no projeto errado**. Para isso, funciona.

### 3.2 O defeito estrutural (achado N2)

**O SSRA valida coerência, não atualidade.** Ele pergunta *"o host serve o que a plataforma diz que o host serve?"*. Nunca pergunta *"o host serve o commit que acabamos de liberar?"*.

**Evidência medida hoje (2026-07-25T13:56Z):**

```
GET https://pdv-importados.vercel.app/api/health
→ {"deploymentId":"dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU",
   "gitSha":"a4edafbf5771fce76bd138089fa2d7800d501554"}
```

`dpl_7DPHmhdzLHNSsd1mXV59tPzfA9aU` é um deployment `target: production` do projeto `pdv-importados`, criado em **2026-07-23T02:18Z** a partir de `a4edafbf`. O `main` está em `6781684b` (2026-07-24T20:48Z), e `a4edafbf` **não aparece nos 10 commits mais recentes de `main`**.

Se o SSRA rodasse agora, `platformId` para esse host seria `dpl_7DPH…` e `runtimeId` seria `dpl_7DPH…`. **Iguais. O gate passaria — com produção mais de dez commits atrasada, sem o BL-1 inteiro.**

Esse é o achado N1+N2 combinados: o incidente existe **e** a autoridade de release foi projetada de um jeito que não consegue vê-lo.

### 3.3 Continua fazendo sentido? Deve ser obrigatório?

**Sim para ambos — mas insuficiente na forma atual.** O invariante "plataforma == runtime" é necessário e barato. O que falta é o invariante de atualidade:

> `deployment do host de produção` **.meta.githubCommitSha** == `SHA que se pretendia liberar`

**Recomendação: SSRA v2**, somando três asserções:

| # | Asserção | Detecta |
|---|---|---|
| A1 | `platformId == runtimeId` (atual) | CDN/cache stale, projeto errado |
| A2 | `deployment.meta.githubCommitSha == <sha esperado>` | **Alias pinado em deployment antigo (N1)** |
| A3 | `deployment.target == 'production'` e `readyState == 'READY'` | Promoção de preview por engano |

E uma correção de configuração independente: `PRODUCTION_HOST` está como `pdv-importados.vercel.app`, mas o `get_project` lista como domínios do projeto apenas `pdv-importados-jinlong.vercel.app` e `pdv-importados-git-main-jinlong.vercel.app`. Os dois conjuntos de host precisam ser reconciliados e o host canônico declarado sem ambiguidade — hoje há pelo menos 4 aliases (`pdv-importados.vercel.app`, `v0-pdv-importados.vercel.app`, e os dois `-jinlong`) e não está claro qual é "produção".

### 3.4 Onde deve executar

**Hoje:** `needs: deploy` — acoplado ao mecanismo de deploy que será removido, e por isso `skipped` desde sempre.

**Proposto:** `on: deployment_status` filtrando `deployment_status.state == 'success'` e `environment == 'production'`. Vantagens: dispara para *qualquer* mecanismo de deploy (nativo ou não); roda quando a Vercel já declarou pronto, eliminando a corrida; e desacopla release authority de pipeline de build.

```yaml
# release-validate.yml (proposto — NÃO implementado)
on:
  deployment_status:
jobs:
  ssra:
    if: github.event.deployment_status.state == 'success'
        && github.event.deployment.environment == 'production'
```

### 3.5 Riscos de continuar desabilitado

| Risco | Severidade |
|---|---|
| **Já materializado:** produção defasada sem ninguém perceber (N1) | 🔴 Crítico |
| Deploy parcial (alias promovido, edge com build antigo) passa despercebido | 🟠 Alto |
| **Schema à frente do código:** migrations 272–276 aplicadas no banco, código correspondente não está em produção. Hoje é compatível (DEFAULTs), mas é uma janela aberta | 🟠 Alto |
| Rollback silencioso da Vercel não gera alarme | 🟡 Médio |

**Confiança:** Alta. **Limitação:** não consegui confirmar *por que* `pdv-importados.vercel.app` ficou pinado — pode ser alias manual, rollback via dashboard, ou domínio não registrado como Production Domain do projeto. A API não expõe isso e o dashboard não é acessível daqui. **A causa precisa ser confirmada em Vercel → Project → Domains antes de qualquer correção.**

---

## 4. Fiscal Cron — auditoria completa

### 4.1 Como deveria funcionar

`fiscal-cron.yml` (a cada 5 min) → `POST` na Edge Function `fiscal-worker` → RPC `fiscal_claim_documentos(limit)` marca até 20 docs `PENDENTE`/`ERRO` como `EM_PROCESSAMENTO` (`FOR UPDATE SKIP LOCKED`) → para cada um chama o provider → `fiscal_marcar_emitido` ou `fiscal_marcar_erro` (com backoff) ou `fiscal_marcar_erro_normalizado`.

### 4.2 Achado N3 — o cron nunca funcionou

**Evidência A — header errado.**

```yaml
# .github/workflows/fiscal-cron.yml:17-20
curl -X POST "$URL" \
  -H "apikey: $KEY" \        # ← header enviado
```
```ts
// backend/supabase/functions/fiscal-worker/index.ts:14-17
const gotKey = req.headers.get("X-FISCAL-WORKER-KEY")?.trim();   // ← header exigido
if (!workerKey?.trim() || !gotKey || !(await timingSafeEqualSecret(workerKey, gotKey))) {
  return json(401, { ok: false, error: "UNAUTHORIZED" });
}
```

O contrato correto é comprovado pelo consumidor que funciona — `pdv-importados/app/gerente/financeiro/actions.ts:175` usa `'X-FISCAL-WORKER-KEY': key`. **O cron manda o header errado; a função devolve 401.**

**Evidência B — a falha é silenciosa.** O `curl` não usa `-f`/`--fail`. Um HTTP 401 não altera o exit code do `curl`, então o step termina com 0 e **o job reporta `success`**. Ou seja: mesmo com runners saudáveis, o painel de Actions mostraria verde enquanto nada era processado.

**Evidência C — o banco confirma.** O único documento `PENDENTE` está lá desde **2026-06-12** com `tentativas = 0` e `ultima_tentativa_em = NULL`. Se o worker o tivesse sequer reivindicado uma vez, `fiscal_claim_documentos` teria gravado `ultima_tentativa_em = now()`. **Nunca foi tocado em 6 semanas.**

**Confiança:** Muito alta (três evidências independentes convergentes).

### 4.3 Frequência esperada vs real

| | Valor |
|---|---|
| Esperada (cron) | 288/dia |
| Real (runs disparados) | ~18/dia — GitHub degradou o agendamento por falhas repetidas |
| Real (execuções efetivas do worker) | **0** — sem runner desde o apagão; e antes disso, 401 |

### 4.4 Documentos acumulados

```sql
select status, count(*), min(created_at), max(created_at)
from public.documentos_fiscais_pendentes group by status;
```
| status | qtd | mais antigo | mais recente |
|---|---|---|---|
| EMITIDO | 1 | 2026-04-08 | 2026-04-08 |
| PENDENTE | 1 | 2026-06-12 | 2026-06-12 |

**Não há acúmulo** — e a razão é mais preocupante que o acúmulo seria:

- 56 vendas no total, 25 nos últimos 30 dias, mas apenas **2 documentos fiscais em todo o histórico**.
- Ambos são sintéticos: o `PENDENTE` é `tipo_doc = 'NFC_E_STUB'` com `venda_id = aaaaaaaa-0000-4000-8000-202606120001` (UUID de fixture).
- A RPC `finalizar_venda_transacional_canonica_v4` só enfileira se `p_fiscal_auto_enqueue = true`; o app passa `runtimeCfg.autoEnqueueFiscalOnSale`, cujo default em `lib/config/caixaSalesRuntimeConfig.ts:21` é **`false`**.

> **Conclusão:** nenhuma venda real gera documento fiscal hoje. A fila está vazia porque **a emissão fiscal está desligada de ponta a ponta**, não porque está em dia.

### 4.5 Mecanismo de recuperação automática

| Mecanismo | Existe? | Evidência |
|---|---|---|
| Backoff exponencial | ✅ Sim | `fiscal_marcar_erro`: `60 * 2^min(tentativas,6)` s, teto 3600s |
| Retry automático de `ERRO` | ✅ Sim | `fiscal_claim_documentos` seleciona `status IN ('PENDENTE','ERRO')` respeitando `proxima_tentativa_em` |
| Limite de tentativas / DLQ automática | ❌ **Não** | Nenhum guard de `tentativas` no claim. Tabela `documentos_fiscais_dlq` existe, mas nada move documentos para lá automaticamente |
| **Reaper de `EM_PROCESSAMENTO`** | ❌ **Não** | Busca por reaper/stale/timeout nas migrations: **zero resultados** |
| Reprocesso manual | ✅ Sim | `fiscal_reprocessar_documento` (GERENTE+) e `processarFilaFiscalAgora` na UI |

**Risco crítico — órfão permanente.** `fiscal_claim_documentos` marca o doc como `EM_PROCESSAMENTO` **antes** de chamar o provider. Se o worker morrer no meio (timeout de Edge Function, deploy, crash), o documento fica `EM_PROCESSAMENTO` para sempre: o claim só busca `PENDENTE`/`ERRO`, e o `fiscal_reprocessar_documento(uuid)` só aceita `status IN ('ERRO','PENDENTE')` — **nem o retry automático nem o reprocesso manual conseguem resgatá-lo.** Exigiria `UPDATE` direto no banco.

### 4.6 Máquina de estados ausente

A migration `092_fiscal_state_machine.sql` **não está aplicada**:

```sql
-- colunas de 092: ausentes
select column_name from information_schema.columns
where table_name='documentos_fiscais_pendentes'
  and column_name in ('ultima_transicao_em','transicao_origem');
→ 0 linhas   (a query original falhou com 42703: column does not exist)

-- triggers de 092: ausentes
→ só existem tr_documentos_fiscais_eventos_ai / _au (log de eventos)
   tr_documentos_fiscais_estado_bi / _bu NÃO existem
```

Sem esses triggers, **nenhuma transição de status é validada**. Em particular, `EMITIDO → PENDENTE` é aceita pelo banco — o que permite reemitir um documento já autorizado pela SEFAZ. É a transição mais perigosa do domínio fiscal, e é exatamente a que a 092 bloqueava.

**Confiança:** Muito alta (ausência verificada em `information_schema` e `pg_trigger`).

### 4.7 Overload quebrado e sem autorização

Existem **dois** `fiscal_reprocessar_documento`:

| Assinatura | Autorização | Estado |
|---|---|---|
| `(p_documento_id uuid)` | ✅ Exige perfil `GERENTE`/`DONO`/`ADMIN` | Correto — é o que o app chama |
| `(p_documento_id uuid, p_observacao text)` | ❌ **Nenhuma verificação de perfil ou de `auth.uid()`** | **Quebrado** |

O segundo referencia colunas que não existem: `erro_normalizado`, `erro_detalhe`, `correlation_id` em `documentos_fiscais_pendentes` (verificado: **0 das 3 existem**) e `evento_dados`, `correlation_id` em `documentos_fiscais_eventos` (cujas colunas reais são `id, documento_id, evento_tipo, status_antes, status_depois, actor_user_id, actor_role, origem_acao, payload, created_at`).

Ambos têm `GRANT EXECUTE ... TO authenticated`.

**Avaliação de risco, com precisão:** hoje **não é explorável** — a função falha no parse do `UPDATE` na primeira execução, então falha fechada. Mas é uma escalada de privilégio latente: se alguém "consertar" as colunas sem notar a ausência do check de perfil, qualquer usuário autenticado (inclusive `OPERADOR`) passa a poder resetar o estado de documentos fiscais. Deve ser **removida**, não corrigida.

Risco adicional: ambiguidade PostgREST (`PGRST203`) entre os dois overloads. Hoje resolve para o correto porque o app envia só `p_documento_id`, mas é frágil.

### 4.8 Risco de perda de documentos e risco de emissão

| Pergunta | Resposta | Confiança |
|---|---|---|
| Há risco de perda **hoje**? | **Não.** Fila com 1 doc sintético; nada gerado por venda real | Muito alta |
| Há risco de perda **no go-live**? | **Sim, alto.** Sem reaper, sem limite de tentativas, sem DLQ automática e sem máquina de estados | Alta |
| Há risco para emissão fiscal? | **Sim.** `FISCAL_PROVIDER_TYPE` default é `"mock"` — emitiria chaves falsas (`NFE-MOCK-…`) marcadas como `EMITIDO`, poluindo a base com documentos que a SEFAZ nunca viu | Muito alta |
| O cron voltaria a funcionar só com billing? | **Não.** O header continuaria errado | Muito alta |

### 4.9 Recomendação

> **Tirar o disparo fiscal do GitHub Actions e movê-lo para dentro do Supabase (`pg_cron` + `pg_net`), corrigindo o header no mesmo movimento.**

Justificativa: emissão fiscal é função de produção, não de CI. Acoplá-la ao Actions significa que uma questão de billing de CI derruba a operação fiscal — que é exatamente o que aconteceu. `pg_cron` roda no mesmo ambiente do dado, não custa minutos e não depende de runner.

**Ordem obrigatória** (não inverter):
1. Remover overload `(uuid, text)` de `fiscal_reprocessar_documento`.
2. Aplicar `092` (máquina de estados) — **antes** de qualquer volume real.
3. Adicionar reaper de `EM_PROCESSAMENTO` (ex.: `> 15 min` volta para `ERRO` com backoff) e limite de tentativas com movimentação para DLQ.
4. Migrar o disparo para `pg_cron` com o header `X-FISCAL-WORKER-KEY`.
5. Só então avaliar `AUTO_ENQUEUE_FISCAL_ON_SALE=true` e provider real — **nunca** com `FISCAL_PROVIDER_TYPE=mock`.

**Alternativa a `pg_cron`:** manter no Actions apenas corrigindo o header e adicionando `curl --fail`. É a correção mínima (1 linha + 1 flag), mas preserva o acoplamento CI↔produção fiscal. Aceitável como paliativo imediato **se** o passo 4 ficar no roadmap.

---

## 5. Branch Protection, Rulesets, Environments — configuração recomendada

**Limitação declarada:** não consegui ler a configuração atual. `GET /branches/main/protection`, `/rulesets`, `/environments` e `/hooks` retornam bloqueio de proxy ou "GitHub access is not enabled"; não há tool de branch protection no MCP; `pull_request_read(get_status)` retorna 403. **O que segue é a configuração recomendada, não um diff contra a atual.**

**Evidência indireta do estado atual:** PR #232 foi mergeado em `main` em 2026-07-24T20:48:34Z por `nocodenn-cell` com todos os checks de Actions em `failure` → ou não há Required Checks, ou o owner tem bypass. Em qualquer caso, **hoje os checks não são gate de merge**.

### 5.1 Pré-requisito bloqueante

Antes de configurar qualquer Required Check: **renomear os jobs `build-and-test` duplicados** (§1.1). Enquanto dois workflows produzirem o mesmo contexto, a lista de required checks é ambígua e pode ser satisfeita pelo workflow errado.

E a regra de ouro que a auditoria anterior estabeleceu: **nenhum job com `paths:` filter pode ser Required Check** — ou o filtro sai, ou o check não é obrigatório. Caso contrário, PRs que não casam o filtro travam em *"Expected — Waiting for status to be reported"*.

### 5.2 Required Status Checks recomendados

Após a consolidação do §1.3:

| Contexto | Obrigatório? | Por quê |
|---|---|---|
| `secret-scan` | ✅ Sim | Vazamento de segredo é irreversível |
| `web-build-and-test` | ✅ Sim | Gate real do produto |
| `backend-checks` | ✅ Sim | RLS é a fronteira de segurança do multi-tenant |
| `desktop-build-and-test` | ⚠️ Sim, se `pdv-local/**` mudou — via *ruleset* com condição, nunca via `paths:` no workflow | Evita a armadilha do path filter |
| `e2e-critical` | ❌ **Não** | Decisão SSRA já vigente: E2E é sistema de risco, não de decisão |
| `validate-production (SSRA)` | ❌ **Não** | Roda **pós**-deploy; como required check de PR seria um deadlock |

### 5.3 Branch Protection / Ruleset para `main`

```
Ruleset "main-production" — target: main, enforcement: active
├── Restrict deletions                          ✅
├── Block force pushes                          ✅
├── Require linear history                      ✅
├── Require signed commits                      ✅  (ver nota)
├── Require a pull request before merging       ✅
│     ├── Required approvals: 1                 (2 quando o time crescer)
│     ├── Dismiss stale approvals on push       ✅
│     ├── Require review from Code Owners       ✅  (.github/CODEOWNERS existe)
│     └── Require conversation resolution       ✅
├── Require status checks to pass               ✅
│     └── Require branches up to date           ✅
└── Bypass list: VAZIA                          ✅  ← o ponto que mais importa
```

**Nota sobre signed commits:** o commit `6781684b` tem `githubCommitVerification: "unverified"`. Ativar essa regra hoje bloquearia o fluxo atual de commits automatizados. Recomendo ativar **depois** de acertar a assinatura dos agentes — senão vira o próximo "gate que todo mundo faz bypass".

**Sobre a bypass list:** é a diferença entre governança real e teatro. Se o owner mantém bypass, todo o resto é decorativo — como o merge do #232 demonstrou.

### 5.4 Environments

Hoje não há nenhum configurado (não verificável, mas nada nos workflows referencia `environment:`).

```
production
├── Required reviewers: 1 (Ops/Tech Lead)
├── Wait timer: 0
├── Deployment branches: apenas `main`
└── Secrets: VERCEL_TOKEN, SENTRY_AUTH_TOKEN, FISCAL_WORKER_KEY

preview
└── Deployment branches: todas exceto main
```

**Ressalva importante e específica deste caso:** *Environment protection rules do GitHub só se aplicam a deployments criados via GitHub Actions.* Como a recomendação do §2.5 é usar a integração nativa da Vercel, **um required reviewer no environment `production` do GitHub não bloquearia o deploy da Vercel**. Para gate de produção com deploy nativo, o controle equivalente vive na Vercel (Deployment Protection) ou no merge para `main`. Não configure o environment achando que ele protege o que não protege.

### 5.5 Deployments

- Declarar **um** Production Domain canônico no projeto Vercel e reconciliar os 4 aliases hoje existentes (§3.3).
- Ativar **Vercel Deployment Protection** nos previews (hoje `pdv-importados-jinlong.vercel.app` já pede SSO — bom sinal; `pdv-importados.vercel.app` responde público).
- Manter `Instant Rollback` como procedimento oficial de rollback, documentado no runbook.

---

## 6. Roadmap de remediação

### 6.1 P0 — bloqueia produção

| # | Problema | Evidências | Risco | Esforço | Dependências |
|---|---|---|---|---|---|
| **P0-1** | Produção servindo build de 23/07 (`dpl_7DPH…`, `a4edafbf`); BL-1 inteiro fora do ar | `/api/health` medido 2026-07-25T13:56Z; `get_deployment`; `list_commits` de `main` | 🔴 Cliente usa versão defasada; migrations 272–276 aplicadas sem o código correspondente | **S** (investigar + repromover) | Acesso ao dashboard Vercel |
| **P0-2** | `fiscal-cron` envia header errado (`apikey` vs `X-FISCAL-WORKER-KEY`) e falha em silêncio (sem `curl -f`) | `fiscal-cron.yml:17-20` vs `index.ts:14-17`; `actions.ts:175` como contrato correto; doc `PENDENTE` com `tentativas=0` desde 12/06 | 🔴 Emissão fiscal nunca processou; verde falso no CI | **S** (2 linhas) | — |
| **P0-3** | Migration `092` (máquina de estados fiscal) não aplicada | Colunas e triggers ausentes (`information_schema`, `pg_trigger`) | 🔴 `EMITIDO → PENDENTE` permitido = reemissão de documento autorizado | **S** | Janela de manutenção |
| **P0-4** | Overload `fiscal_reprocessar_documento(uuid,text)` sem authz, referenciando 5 colunas inexistentes, com `GRANT` a `authenticated` | `pg_get_functiondef`; colunas verificadas ausentes | 🔴 Escalada latente + ambiguidade PostgREST | **S** (DROP) | Confirmar que nada o chama |
| **P0-5** | Runners do Actions indisponíveis (billing) | `runner_id: 0` em 100% dos jobs; ativo hoje | 🔴 Zero gate de CI | **S** (ação de conta) | Decisão de billing |

### 6.2 P1 — antes do próximo release

| # | Problema | Evidências | Risco | Esforço | Dependências |
|---|---|---|---|---|---|
| **P1-1** | Deploy duplo quando o billing voltar | Job `deploy` + integração nativa, ambos `--prod`/production | 🟠 Race no alias, SSRA envenenado | **M** | P0-5; substituto do Sentry |
| **P1-2** | SSRA não detecta defasagem (só coerência) | §3.2 — passaria hoje com produção 2 dias atrás | 🟠 Autoridade de release cega para o incidente real | **M** | P1-1 |
| **P1-3** | Sem Branch Protection efetivo | #232 mergeado com CI todo vermelho | 🟠 Código sem gate entra em `main`, e `main` deploya | **S** | Renomear jobs duplicados |
| **P1-4** | Colisão de nome `build-and-test` entre 2 workflows | `ci-pdv-importados.yml:35` e `ci-pdv-local.yml:23` | 🟠 Required Check ambíguo | **S** | — |
| **P1-5** | Sem reaper de `EM_PROCESSAMENTO`; sem limite de tentativas; DLQ não automatizada | Busca por reaper: 0 resultados; `fiscal_claim_documentos` sem guard | 🟠 Órfão permanente irrecuperável por RPC | **M** | P0-3 |
| **P1-6** | Path filters + Required Checks = travamento indefinido | PR #229 (produz) × #225/#233 (não produzem) | 🟠 PR travado em "Waiting for status" | **S** | P1-3 |

### 6.3 P2 — dívida técnica importante

| # | Problema | Evidências | Risco | Esforço | Dependências |
|---|---|---|---|---|---|
| **P2-1** | `fiscal-cron` no Actions (288 runs/dia) acopla operação fiscal ao billing de CI | `fiscal-cron.yml:5` | 🟡 Reincidência do incidente | **M** (pg_cron + pg_net) | P0-2 |
| **P2-2** | 6 workflows com redundância; 3 caminhos de Playwright | §1.1 | 🟡 Custo e manutenção | **M** | P1-3, P1-4 |
| **P2-3** | `/vercel.json` da raiz é config morta | `regions: gru1` só existe em `pdv-importados/vercel.json` | 🟡 Documentação enganosa | **S** | Confirmar Root Directory |
| **P2-4** | 4 aliases de produção sem host canônico declarado | `alias[]` do `dpl_7DPH…`; `domains` do projeto | 🟡 Ambiguidade de "o que é produção" | **S** | P0-1 |
| **P2-5** | `amondnet/vercel-action@v25` em tag móvel | `ci-pdv-importados.yml:205` | 🟡 Supply chain | **S** | Some com P1-1 |
| **P2-6** | Emissão fiscal desligada ponta a ponta (`AUTO_ENQUEUE=false`, provider `mock`) | `caixaSalesRuntimeConfig.ts:21`; `index.ts:36`; 2 docs / 56 vendas | 🟡 Decisão de produto, não bug — mas o go-live fiscal depende disso | **L** | P0-2..4, P1-5 |

### 6.4 P3 — melhoria

| # | Problema | Risco | Esforço |
|---|---|---|---|
| **P3-1** | `anti-replay-diagnostic-gate` em `windows-latest` sem justificativa aparente (2× minutos) | 🟢 Custo | **S** |
| **P3-2** | `e2e-playwright-only.yml` órfão (só dispara em `staging`) | 🟢 Confusão | **S** |
| **P3-3** | Signed commits ainda não viáveis (`6781684b` = `unverified`) | 🟢 Rastreabilidade | **M** |

### 6.5 Ordem correta de implementação

O critério é: **primeiro o que está quebrado em produção agora, depois o que impede que quebre de novo, por último o que reduz custo.**

```
FASE 1 — Incidente (dias 0-1)
  P0-1  Investigar e repromover produção        ← isolado, não depende de nada
  P0-2  Corrigir header do fiscal-cron          ← 2 linhas, independente

FASE 2 — Segurança de dados fiscais (dia 1-2)   ← antes de qualquer volume real
  P0-4  DROP do overload sem authz
  P0-3  Aplicar migration 092
  P1-5  Reaper + limite de tentativas + DLQ

FASE 3 — Restaurar o gate (dia 2-3)
  P0-5  Billing/runners
  P1-4  Renomear jobs duplicados                ← pré-requisito de P1-3
  P1-6  Remover path filters dos checks obrigatórios
  P1-3  Ativar Branch Protection (bypass vazia)

FASE 4 — Deploy e release authority (dia 3-5)   ← só depois que há gate
  P1-1  Escolher mecanismo único (nativa) + substituto do Sentry
  P1-2  SSRA v2 em on: deployment_status
  P2-4  Declarar host canônico

FASE 5 — Consolidação (semana 2)
  P2-1  fiscal-cron → pg_cron
  P2-2  Consolidar workflows (6 → 3)
  P2-3, P2-5, P3-*
```

**Três dependências que não podem ser invertidas:**

1. **P1-4 antes de P1-3.** Ativar Required Checks com dois `build-and-test` cria ambiguidade difícil de diagnosticar depois.
2. **P1-3 antes de P1-1.** Remover o job `deploy` sem Branch Protection troca "deploy que nunca acontece" por "deploy sem nenhum gate" — fica pior que hoje.
3. **P0-3/P0-4/P1-5 antes de P2-6.** Ligar a emissão fiscal antes da máquina de estados e do reaper é assumir risco fiscal irreversível com documentos reais.

---

## 7. Limitações gerais da investigação

| Item | Estado | Impacto no plano |
|---|---|---|
| Branch Protection / rulesets / environments / webhooks | ❌ Não legíveis (proxy + 403) | §5 é recomendação, não diff. Confirmar com print de Settings |
| Causa do pin de `pdv-importados.vercel.app` | ❌ Não determinada | P0-1 exige investigação no dashboard antes da correção |
| Root Directory do projeto Vercel | ⚠️ Inferido (`regions`, `outputDirectory`) | P2-3 exige confirmação antes de remover o arquivo |
| Distribuição real de minutos de Actions | ❌ Sem acesso a billing | Priorização do §1 é por natureza do workload, não por fatura |
| Logs da Edge Function `fiscal-worker` | ⚠️ Janela curta, retornou vazio | Conclusão de N3 apoia-se em código + estado do banco, que são suficientes |
| Ambiente auditado | `kbabmewnahysfvlybiak` | O mesmo confirmado pelo usuário como alvo; se houver outro ambiente de produção, os números do §4 mudam |

---

## 8. Recomendação final

**Executar a Fase 1 imediatamente e em separado.** P0-1 e P0-2 são independentes de tudo, têm esforço mínimo e são os dois casos onde o sistema está mentindo: produção diz estar atualizada e não está; o CI diz que a fila fiscal está sendo processada e nunca foi.

**Não tratar o billing como primeiro passo.** Ele é P0-5 e continua necessário, mas restaurá-lo antes das Fases 1-2 apenas ativa o deploy duplo (P1-1) sem resolver nenhum dos três achados novos.

**Não ligar a emissão fiscal real até a Fase 2 estar completa.** Sem máquina de estados, sem reaper e com provider `mock` como default, o custo de um erro é um documento fiscal irreversível — a única categoria de dano deste sistema que não tem rollback.
