# Auditoria CI/CD — Deploy "preso em Running Checks"

**Data:** 2026-07-25
**Escopo:** investigação pura. Nenhum arquivo de workflow, `vercel.json`, branch protection, secret ou setting da Vercel foi alterado.
**Repositório:** `nocodenn-cell/fastproduct` · **Projeto Vercel:** `pdv-importados` (`prj_UPGWQN4TmzDQRYm5IB80a8ZxOslO`, team `jinlong`/`NatureCode`)

---

## 0. Sumário executivo

A hipótese levantada no pedido — *"Required Check depende de workflow que não pode mais executar; a Vercel fica esperando um status que nunca chega"* — está **parcialmente correta, mas o mecanismo real é diferente e mais grave**.

| # | Achado | Confiança |
|---|---|---|
| A | **GitHub Actions não consegue alocar runner nenhum** (qualquer SO). 100% dos jobs morrem em 2–4s com `runner_id: 0`, sem log. Ativo **hoje**. | 🟢 **Muito alta** (evidência direta e reprodutível) |
| B | **O deploy de produção via GitHub Actions nunca executa** — o job `deploy` (`amondnet/vercel-action --prod`) depende de `build-and-test`, que sempre falha. Consequência: o gate `validate-production (SSRA)` **também nunca executa**. | 🟢 **Muito alta** |
| C | **A Vercel deploya normalmente** — via GitHub App nativa, independente do Actions. Todos os deployments recentes estão `READY`, incluindo o de produção. **Não há deployment travado.** | 🟢 **Muito alta** |
| D | **`/vercel.json` (raiz) é configuração morta** — a Vercel usa `pdv-importados/vercel.json`. `github.silent` e `github.autoJobCancelation` declarados na raiz **não têm efeito nenhum**. | 🟢 **Muito alta** — confirmado, ver §4.3 |
| E | **Armadilha estrutural de Required Check** confirmada: `ci-pdv-importados.yml` tem *path filters*. Em PR que não toca esses caminhos, `build-and-test` / `deploy` / `validate-production (SSRA)` **não produzem check algum** — se qualquer um for Required Check, o PR trava para sempre em *"Expected — Waiting for status to be reported"*. | 🟡 **Alta** (mecanismo comprovado; ativação depende de branch protection, que não pude ler) |
| F | **`fiscal-cron` nunca executa** desde o início do apagão — o worker fiscal não está sendo drenado por agendamento. | 🟢 **Muito alta** |
| G | Zero runs em `queued`/`in_progress`. **Nada está "preso" no GitHub Actions** — está falhando rápido, o que é diferente. | 🟢 **Muito alta** |

---

## 1. Causa provável (raiz)

> **Esgotamento de billing / indisponibilidade de runners GitHub-hosted na conta que hospeda `nocodenn-cell/fastproduct`.**

Tudo o mais desce em cascata daí. Não é regressão de nenhum PR, não é erro de YAML, não é `concurrency`, não é webhook.

O que **não** é a causa (descartado por evidência):

- ❌ Deployment da Vercel travado — todos `READY` (§4).
- ❌ `concurrency` cancelando jobs — só existe em `e2e-playwright-only.yml`, que só dispara em `staging`/manual (§2.3).
- ❌ Webhook GitHub → Vercel quebrado — a Vercel recebeu e processou **todos** os pushes recentes, com metadados completos (§4.1).
- ❌ GitHub App da Vercel desconectada — o check `Vercel Preview Comments` aparece e conclui `success` em todos os PRs (§4.2).
- ❌ Actions "presas"/enfileiradas — 0 runs em `queued`, 0 em `in_progress` (§3.3).

---

## 2. Evidências — `.github/workflows`

### 2.1 Inventário (6 workflows)

| Arquivo | Gatilhos | Jobs (= nome do check) | `concurrency` |
|---|---|---|---|
| `ci-pdv-importados.yml` | push/PR → `main`,`develop` **com path filter** | `build-and-test`, `E2E crítico (sistema de risco)`, `deploy`, `validate-production (SSRA)`, `e2e-playwright` | ❌ |
| `ci-backend-supabase.yml` | push/PR → `main`,`develop` + dispatch | `Supabase local RLS smoke`, `Test RLS scope by profile`, `edge-functions-typecheck`, `outbox-contract`, `rls-rest-gate`, `migration-remote-drift`, `anti-replay-diagnostic-gate` | ❌ |
| `ci-pdv-local.yml` | push/PR | `build-and-test`, `rust-tauri-checks` (windows) | ❌ |
| `secret-scan.yml` | push/PR → `main`,`develop` | `gitleaks` | ❌ |
| `fiscal-cron.yml` | `schedule: */5 * * * *` + dispatch | `call-worker` | ❌ |
| `e2e-playwright-only.yml` | dispatch + push → **`staging`** | `e2e-critical` | ✅ `cancel-in-progress: true` |

### 2.2 Cadeia de dependências do deploy (`ci-pdv-importados.yml`)

```
build-and-test  ──needs──►  deploy  ──needs──►  validate-production (SSRA)
   (sempre falha)          (skipped)            (skipped)
```

`deploy` roda `amondnet/vercel-action@v25` com `vercel-args: '--prod'` e os secrets `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`. **Esse caminho de deploy está morto desde o início do apagão de runners.**

### 2.3 `concurrency` — item 8 do pedido: **descartado**

Único workflow com `concurrency` é `e2e-playwright-only.yml`, que dispara apenas em `push: branches: [staging]` e `workflow_dispatch`. Não dispara em `main`, não toca o deploy, não pode cancelar nada da cadeia de produção.

---

## 3. Evidências — runs, checks e billing

### 3.1 Assinatura de "sem runner alocado"

Amostra do último push em `main` (`6781684b`, 2026-07-24T20:48:37Z) — **13 jobs, 3 workflows, `ubuntu-latest` e `windows-latest`**, todos com:

- `conclusion: failure`
- duração 2–4 segundos
- `runner_id: 0`, `runner_name: ""`
- download de log → **HTTP 404** (job nunca chegou a produzir log)

Um job que falha em lint/teste real tem `runner_id` populado e log baixável. `runner_id: 0` + 404 significa que o job **nunca começou**.

### 3.2 Está acontecendo agora (não é histórico)

`fiscal-cron.yml`, 5 execuções mais recentes:

| Run | Criado | Conclusão | Duração |
|---|---|---|---|
| 30159152880 | 2026-07-25T13:07:40Z | failure | 4s |
| 30156938550 | 2026-07-25T11:51:00Z | failure | 3s |
| 30154953707 | 2026-07-25T10:42:47Z | failure | 3s |
| 30152279920 | 2026-07-25T09:07:13Z | failure | 4s |
| 30148485711 | 2026-07-25T06:59:30Z | failure | 3s |

Dois fatos adicionais aqui:

1. **O cron fiscal está configurado para `*/5 * * * *` (a cada 5 min) mas está disparando a cada ~1h15.** É o throttling que o GitHub aplica a workflows agendados que falham repetidamente. Ou seja: o próprio GitHub já degradou o agendamento.
2. **O `fiscal-worker` não está sendo acionado por cron há dias.** Isso é impacto *funcional*, não só de CI — a fila de documentos fiscais pendentes não tem quem a drene automaticamente.

### 3.3 Item 6 e 7 do pedido — GitHub Checks pendentes / Actions presas: **nenhum**

```
list_workflow_runs status=in_progress → total_count: 0
list_workflow_runs status=queued      → total_count: 0
```

E em todos os PRs abertos inspecionados, **100% dos check-runs estão `completed`** — nenhum `queued`, nenhum `in_progress`. Nada está pendurado.

### 3.4 Já era conhecido e documentado

`FASE_6_1_EXECUTION_PLAN.md` §0.1, item de pré-condição da Onda 0:

> *"**CI `secret-scan` está quebrado no repositório inteiro** (30 falhas consecutivas em todos os branches, jobs morrem em 2–4s sem runner alocado — `runner_id: 0`). Resolver em GitHub → Settings → Billing/Actions antes de usar CI como gate de merge. ⚠️ Bloqueia — sem isso, nenhuma onda tem gate confiável"*

E o critério de aceite #6 do mesmo documento condiciona a fase a *"`secret-scan` voltou a executar (pré-condição 0.1 resolvida) ou foi formalmente marcado como não-bloqueante"*. Nenhuma das duas coisas aconteceu.

O corpo do PR #229 repete o diagnóstico de forma independente. **O problema tem semanas e está rastreado — o que faltou foi a ação em Settings → Billing.**

---

## 4. Evidências — Vercel

### 4.1 Deployments: saudáveis, item 12 do pedido **descartado**

20 deployments mais recentes: **16 `READY`, 4 `CANCELED`, 0 `ERROR`, 0 `BUILDING`, 0 `QUEUED`.** Os `CANCELED` são todos casos de push seguido de outro push na mesma branch em poucos segundos (auto job cancelation) — comportamento correto.

Último deployment de produção:

```
dpl_6TskQXRr1SrNkCubKETGeyjmprgo
  target       production
  state        READY
  buildingAt   2026-07-24T20:48:40Z
  ready        2026-07-24T20:51:29Z   (2min49s)
  commit       6781684b (main)
  alias        pdv-importados-jinlong.vercel.app
               pdv-importados-git-main-jinlong.vercel.app
  source       git   /   meta.githubDeployment: "1"
```

**Construiu, ficou pronto e recebeu o alias de produção.** Não há deployment travado, não há deployment que terminou sem reportar status.

### 4.2 GitHub App da Vercel (item 10) e webhooks (item 11): **funcionando**

- `meta.githubDeployment: "1"` + `source: "git"` em todos os deployments → foram criados pela integração nativa reagindo ao webhook de push, não por CLI/API manual.
- Metadados completos (`githubCommitSha`, `githubCommitRef`, `githubPrId`, `repoPushedAt`, `branchAlias`) → o payload do webhook chegou íntegro.
- Check `Vercel Preview Comments` presente e `success` em PR #225 e #229.
- Também há a GitHub App do **Supabase** instalada (check `Supabase Preview`, `skipped`).

### 4.3 Achado D — `/vercel.json` da raiz não é lido

Existem **dois** arquivos:

```jsonc
// /vercel.json  (raiz)
{ "framework":"nextjs", "buildCommand":"npm run build", "outputDirectory":".next",
  "installCommand":"npm install",
  "github": { "silent": true, "autoJobCancelation": true } }

// /pdv-importados/vercel.json
{ "$schema":"https://openapi.vercel.sh/vercel.json", "regions":["gru1"] }
```

A Vercel lê o `vercel.json` do **Root Directory** do projeto.

**Confirmação direta (2026-07-25):** o comentário automático do `vercel[bot]` no PR #233 carrega um payload base64 que, decodificado, declara explicitamente a configuração do projeto:

```json
{ "isMonorepo": true, "type": "github",
  "projects": [{ "name": "pdv-importados",
                 "projectId": "prj_UPGWQN4TmzDQRYm5IB80a8ZxOslO",
                 "rootDirectory": "pdv-importados" }] }
```

`rootDirectory: "pdv-importados"` — não é mais inferência. Isso encerra a questão: **o `/vercel.json` da raiz nunca é lido pela Vercel.**

As duas evidências indiretas originais, que já apontavam nessa direção:

1. O deployment de produção reporta `regions: ["gru1"]` — declarado **só** em `pdv-importados/vercel.json`.
2. Se a raiz fosse o Root Directory, `outputDirectory: ".next"` apontaria para `/.next`, que não existe: o `build` da raiz é `turbo run build --filter=pdv-importados`, cuja saída é `pdv-importados/.next`. O build **não falharia silenciosamente — falharia**. Ele passa.

**Consequência:** `github.silent` e `github.autoJobCancelation` do arquivo da raiz são letra morta. O comportamento observado (comentários da Vercel ativos, auto-cancelamento ativo) vem dos *defaults* da Vercel, não desse arquivo. Isso é dívida de configuração enganosa: alguém que leia `/vercel.json` vai concluir coisas erradas sobre o projeto.

---

## 5. Branch Protection e Required Status Checks (itens 4, 5, 9)

### 5.1 Limitação de método — declarada explicitamente

**Não consegui ler branch protection, rulesets, environments nem webhooks.** Ambos os canais disponíveis bloqueiam:

```
GET /repos/nocodenn-cell/fastproduct/branches/main/protection
  → "GitHub access is not enabled for this session..."
GET /repos/nocodenn-cell/fastproduct/environments
  → "Access to this GitHub API path is not permitted through this proxy."
pull_request_read(get_status)
  → 403 Resource not accessible by integration
```

Não há tool de branch protection no MCP disponível. **Portanto o que segue é inferência a partir de evidência indireta, não leitura da configuração.** Os itens 4, 5 e 9 do pedido ficam **parcialmente respondidos** — a confirmação exige alguém com acesso ao Settings do repositório.

### 5.2 Inferência: Required Checks hoje não estão bloqueando merges

PR #232 (`claude/reconciliacao-bl1-descontos-hq4tbq` → `main`) foi **mergeado em 2026-07-24T20:48:34Z por `nocodenn-cell`**, com todos os checks de Actions em `failure`. Duas leituras possíveis:

- não há Required Status Checks configurados em `main`; **ou**
- há, mas o owner tem bypass (repo é `githubRepoOwnerType: "User"`, e `merged_by` é o próprio owner).

Em qualquer dos casos, **hoje os checks não são gate real de merge** — exatamente o risco que `FASE_6_1_EXECUTION_PLAN.md` §0.1 anteviu.

### 5.3 Achado E — a armadilha do path filter (comparação de nomes pedida)

Comparação entre os nomes que os workflows **realmente produzem** e as condições em que produzem:

| Nome do check | Workflow | Produz sempre? |
|---|---|---|
| `gitleaks` | `secret-scan.yml` | ✅ todo push/PR em `main`/`develop` |
| `Supabase local RLS smoke`, `Test RLS scope by profile`, `edge-functions-typecheck`, `outbox-contract`, `rls-rest-gate`, `migration-remote-drift`, `anti-replay-diagnostic-gate` | `ci-backend-supabase.yml` | ✅ todo push/PR em `main`/`develop` |
| `build-and-test` | `ci-pdv-importados.yml` | ⚠️ **só se o diff tocar os path filters** |
| `E2E crítico (sistema de risco)` | idem | ⚠️ idem |
| `deploy` | idem | ⚠️ idem, e só em `refs/heads/main` |
| `validate-production (SSRA)` | idem | ⚠️ idem |
| `e2e-playwright` | idem | ⚠️ idem + `vars.ENABLE_PLAYWRIGHT_E2E == 'true'` |
| `e2e-critical` | `e2e-playwright-only.yml` | ❌ **só em `staging`** — nunca em PR para `main` |

**Prova empírica do mecanismo, com dados reais:**

- **PR #229** (toca `pdv-importados/**`) → 8 checks, incluindo `build-and-test`, `deploy`, `validate-production (SSRA)`.
- **PR #225** (só documentação) → 10 checks, e **nenhum deles é `build-and-test`, `deploy` ou `validate-production (SSRA)`**. O workflow simplesmente não disparou.

Ou seja: se `build-and-test` (ou `deploy`, ou `validate-production (SSRA)`) estiver na lista de Required Status Checks de `main`, **todo PR que não toque os paths filtrados fica travado para sempre** em *"Expected — Waiting for status to be reported"*. Nunca falha, nunca passa — fica pendurado. **Esse é literalmente o cenário descrito no pedido**, e ele está estruturalmente armado neste repositório.

Dois agravantes na mesma lista:

- `e2e-critical` (de `e2e-playwright-only.yml`) **nunca** pode ser satisfeito por um PR para `main` — o workflow só dispara em `staging`. Se estiver como Required Check, é um deadlock permanente.
- `e2e-playwright` fica `skipped` quando `vars.ENABLE_PLAYWRIGHT_E2E != 'true'`. Isso **não** trava (o GitHub trata job pulado por `if:` como satisfeito), mas confunde diagnóstico.

⚠️ Nota importante sobre um `skipped` que **não** é inofensivo: hoje `deploy` e `validate-production (SSRA)` aparecem como `skipped` porque `build-and-test` falhou. Se um deles for Required Check, o PR **passa** no gate mesmo sem nunca ter deployado nem validado nada. O gate SSRA vira teatro.

---

## 6. Impacto real hoje (o que está de fato quebrado)

| # | Impacto | Severidade |
|---|---|---|
| 1 | Nenhum gate de CI funciona. Merges em `main` acontecem sem lint, typecheck, teste, RLS smoke ou secret scan. | 🔴 Alta |
| 2 | `validate-production (SSRA)` — a autoridade de release do projeto ("Vercel Deployment ID === `/api/health`") — **nunca executou** nesse período. Ninguém está verificando que o que está no ar é o que foi buildado. | 🔴 Alta |
| 3 | `fiscal-cron` não roda → fila fiscal sem drenagem automática. | 🟠 Média-alta |
| 4 | `gitleaks` não roda → segredos vazados entrariam em `main` sem detecção. | 🟠 Média-alta |
| 5 | **Dois mecanismos de deploy de produção coexistem** (job `deploy` com `--prod` + GitHub App nativa). Hoje só um funciona. Quando os runners voltarem, cada push em `main` fará **dois** deploys de produção. | 🟠 Média (latente, mas dispara junto com a correção) |
| 6 | `/vercel.json` da raiz é config morta e enganosa. | 🟡 Baixa |

---

## 7. Menor correção possível

Ordenada por relação impacto/risco. **Nada aqui foi executado** — é proposta.

### C1 — Restaurar runners (a correção raiz)

**Ação:** GitHub → Settings → Billing and plans → verificar spending limit / método de pagamento de Actions. Se o limite está zerado ou o pagamento falhou, restaurar.
**Alteração de código:** nenhuma.
**Risco:** 🟢 **Baixo, com uma ressalva.** Restaurar runners resolve 4 dos 6 impactos de uma vez. A ressalva é o impacto #5: no primeiro push em `main` depois disso, o job `deploy` volta a rodar `vercel --prod` **ao mesmo tempo** que a integração nativa deploya. Resultado: dois deployments de produção concorrentes pelo mesmo commit, um sobrescrevendo o alias do outro. Não corrompe dados, mas produz um estado de release ambíguo — e o `validate-production (SSRA)` pode validar o Deployment ID errado, falhando um deploy que na verdade está correto.
**Por isso C1 deve vir junto com C2, ou logo depois.**

### C2 — Resolver a duplicidade de deploy (decisão, não conserto)

Escolher **um** mecanismo:

- **(a)** Manter a integração nativa da Vercel e remover o job `deploy` de `ci-pdv-importados.yml`, reapontando `validate-production (SSRA)` para o deployment que a Vercel criou.
- **(b)** Manter o job `deploy` do Actions e desligar o auto-deploy nativo no projeto Vercel (Settings → Git → desconectar/ignorar builds automáticos).

**Recomendação: (a).** É o que está comprovadamente funcionando há semanas, sem depender de runners nem de 3 secrets. O SSRA passa a validar o release real em vez de um paralelo.
**Risco de (a):** 🟡 **Médio.** Exige reescrever como o SSRA obtém o Deployment ID (hoje vem do output da action). Mudança em script de release — precisa de um push de teste em `main` para provar. Reversível com `git revert`.
**Risco de (b):** 🟠 Maior — reintroduz dependência de runner no caminho crítico de produção. Se os runners caírem de novo, o deploy para de novo. Não recomendo.

### C3 — Auditar a lista de Required Status Checks

**Ação:** Settings → Branches → `main` → comparar a lista de contexts com a tabela da §5.3. Concretamente:

- Remover `e2e-critical` se estiver lá (é deadlock permanente — o workflow não dispara em `main`).
- Para `build-and-test` / `deploy` / `validate-production (SSRA)`: ou remover da lista, ou **remover os path filters** de `ci-pdv-importados.yml` para que o workflow sempre dispare (e o job decida internamente se tem trabalho a fazer).
- Manter como Required apenas checks que provadamente disparam em 100% dos PRs: `gitleaks` e os 7 de `ci-backend-supabase.yml`.

**Risco:** 🟢 **Baixo se for só remoção da lista** (afrouxa o gate, não quebra nada; e hoje o gate já não está sendo aplicado). 🟡 **Médio se optar por remover os path filters** — todo PR passa a rodar o CI inteiro, custo de minutos de Actions sobe, e a decisão de billing do C1 fica mais cara. Avalie C1 antes.

### C4 — Limpar `/vercel.json` da raiz

**Ação:** remover o arquivo, ou consolidar as chaves úteis em `pdv-importados/vercel.json` (que é o efetivo).
**Risco:** 🟢 **Baixo, com verificação obrigatória antes.** É preciso confirmar no dashboard da Vercel que o Root Directory é mesmo `pdv-importados` — a §4.3 é inferência forte, não leitura da config. Se o Root Directory for a raiz, remover o arquivo quebra o build. **Confirme primeiro, remova depois.** Puramente cosmético; sem pressa.

### C5 — Enquanto C1 não acontecer, formalizar o estado

O critério de aceite #6 de `FASE_6_1_EXECUTION_PLAN.md` já previa isso: *"ou foi formalmente marcado como não-bloqueante pelo time enquanto o problema de infra persiste"*. Hoje o projeto está no pior dos mundos — os checks existem, falham, e são ignorados caso a caso no corpo dos PRs. Ou o gate volta a funcionar (C1) ou se assume por escrito que o gate é `next build` + testes locais.
**Risco:** 🟢 Nulo (documental).

---

## 8. O que ficou sem resposta

Honestidade metodológica — estes itens do pedido **não** foram fechados:

| Item | Estado | Motivo |
|---|---|---|
| 4. Branch Protection Rules | ⚠️ Inferido, não lido | API bloqueada nos dois canais (§5.1) |
| 5. Required Status Checks | ⚠️ Inferido, não lido | idem |
| 9. Environment Protection Rules | ❌ Não verificado | `GET /environments` bloqueado pelo proxy |
| 11. Webhooks GitHub → Vercel (config) | 🟡 Parcial | `GET /hooks` bloqueado; **funcionamento** comprovado por efeito observado (§4.2), configuração não inspecionada |
| Root Directory do projeto Vercel | ⚠️ Inferido | Não exposto pela API/MCP; inferido por `regions` e por `outputDirectory` (§4.3) |

Para fechar 4, 5 e 9 basta um print de **Settings → Branches → `main`** e de **Settings → Environments**. Com isso, a §5.3 deixa de ser "armadilha estrutural possível" e vira "confirmada" ou "descartada".

---

## 9. Ordem sugerida

```
1. C1  Billing/runners                      ← desbloqueia tudo; fazer junto ou antes de C2
2. C2  Escolher um mecanismo de deploy (a)  ← evita deploy duplo quando C1 entrar
3. C3  Auditar Required Checks              ← precisa do print do Settings
4. C5  Formalizar (se C1 demorar)
5. C4  Limpar /vercel.json                  ← cosmético, sem pressa
```

---

## 10. Referências de evidência

- Runs/jobs: `nocodenn-cell/fastproduct` Actions — run 30125465982 (push `main` `6781684b`), job 89587814137 (log HTTP 404), runs 30159152880 / 30156938550 / 30154953707 / 30152279920 / 30148485711 (`fiscal-cron`, 2026-07-25).
- Check-runs: PR #229 (8 checks) e PR #225 (10 checks) — comparação da §5.3.
- Merge sem gate: PR #232, `merged_at: 2026-07-24T20:48:34Z`, `merged_by: nocodenn-cell`.
- Vercel: `prj_UPGWQN4TmzDQRYm5IB80a8ZxOslO`, deployment `dpl_6TskQXRr1SrNkCubKETGeyjmprgo` (produção, `READY`), lista dos 20 deployments mais recentes.
- Documentação prévia: `FASE_6_1_EXECUTION_PLAN.md` §0.1 e critério de aceite #6; corpo do PR #229 (seção "CI").
