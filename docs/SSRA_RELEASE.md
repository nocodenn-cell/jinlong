# SSRA — Single Source Release Authority

**Produção canônica:** `https://pdv-importados.vercel.app`  
**Projeto Vercel:** `pdv-importados` (não `fastproduct`)

## Princípio

A única identidade de produção é o **Deployment ID** que a Vercel associa ao host de produção. O runtime em `/api/health` apenas **declara** qual deployment está executando; o gate compara **plataforma ↔ runtime**, nunca Git ↔ runtime.

```
build-and-test ──┬──► deploy (--prod) ──► validate-production (SSRA)
                 └──► e2e-critical (assíncrono, não bloqueia deploy)
```

| Fonte | Autoridade? | Uso |
|-------|-------------|-----|
| Vercel API `GET /v13/deployments/{host}` | **Sim** | `deploymentId` da plataforma |
| `GET /api/health` | Espelho runtime | `deploymentId` em execução |
| `origin/main` / `github.sha` | **Não** | Debug / Sentry apenas |
| `fastproduct.vercel.app` | **Não** | Legado — arquivar manualmente |

## `/api/health`

Rota: [`pdv-importados/app/api/health/route.ts`](../pdv-importados/app/api/health/route.ts)

```json
{
  "deploymentId": "dpl_…",
  "gitSha": "abc123…",
  "timestamp": 1710000000000
}
```

- `deploymentId` ← `VERCEL_DEPLOYMENT_ID` (injeta Vercel em serverless)
- `gitSha` ← `VERCEL_GIT_COMMIT_SHA` (informativo)
- Local dev: ambos retornam `"local"`

**Não usar:** `NEXT_PUBLIC_GIT_SHA`, `window.__BUILD_SHA__`, comparação com `git rev-parse` em gates.

## Validar produção

### Local / pós-merge

```bash
# Requer VERCEL_TOKEN (e VERCEL_TEAM_ID se team)
export VERCEL_TOKEN=…
export PRODUCTION_HOST=pdv-importados.vercel.app   # opcional, já é o default
npm run validate:production
```

Saída esperada:

```
[validate-production] OK: SSRA — platform === runtime
```

O script consulta a API Vercel, depois `/api/health` com retries (propagação CDN).

### CI

Job `validate-production` em [`.github/workflows/ci-pdv-importados.yml`](../.github/workflows/ci-pdv-importados.yml) — único gate pós-deploy de release.

## E2E = sistema de risco, não sistema de decisão

**Regra canônica:** testes E2E medem **risco funcional** após o artefato existir; **não** decidem se produção foi promovida. A decisão de release pertence exclusivamente ao SSRA (Deployment ID plataforma ↔ runtime).

### Definições

| Tipo | Pergunta que responde | Pode bloquear deploy? | Exemplos neste repo |
|------|------------------------|------------------------|---------------------|
| **Sistema de decisão** | “Este release pode ir para produção?” | **Sim** | `build-and-test` (integridade técnica), `deploy` + `validate-production` (SSRA) |
| **Sistema de risco** | “O que pode estar quebrado em produção?” | **Não** | `e2e-critical`, `e2e-playwright` (opcional), `test:e2e:post-deploy-smoke` (manual) |

### Por que separar

- **Decisão** exige uma autoridade única e verificável (Vercel Deployment ID no host canônico).
- **Risco** é observação assíncrona: fluxos longos, dependências externas (Supabase staging, Edge, sync), flakiness — inadequados como veto de release.
- Misturar os dois cria **multi-verdade** (E2E verde + SSRA vermelho, ou o inverso) e atrasa correções sem aumentar confiança na identidade de produção.

### Comportamento no CI (`main`)

```
build-and-test ──┬──► deploy ──► validate-production   ← decisão
                 └──► e2e-critical                     ← risco (paralelo)
```

O job `e2e-critical` depende só de `build-and-test` e corre **em paralelo** com `deploy`. Falha **não** impede promoção em produção nem invalida um release que passou `validate-production`.

### Resposta operacional quando E2E falha

| Passo | Ação |
|-------|------|
| 1 | Tratar como **alerta de risco**, não como “deploy cancelado”. |
| 2 | Reproduzir localmente ou contra staging (`PLAYWRIGHT_BASE_URL`). |
| 3 | Abrir issue com logs + spec que falhou. |
| 4 | Se o risco é regressão em prod: **rollback** via Vercel (Promote deployment anterior) + `npm run validate:production`. |

**Se passar:** confirmação funcional adicional — não substitui SSRA.

Smoke Playwright leve (`npm run test:e2e:post-deploy-smoke`) permanece para uso manual ou agendado — também é **sistema de risco**, não gate SSRA.

### Anti-padrões (proibidos)

- `e2e-critical` em `needs:` do job `deploy`.
- Smoke Playwright na `preview-url` como gate de release.
- “Deploy só se E2E verde” como política de produção.
- Usar falha E2E para inferir que o Deployment ID em `/api/health` está errado (são camadas independentes).

## Prevenção de deploy no projeto errado

1. CI usa `vercel-args: '--prod'` no secret `VERCEL_PROJECT_ID` do projeto `pdv-importados`.
2. Variable GitHub `EXPECTED_VERCEL_PROJECT_ID` — step pré-deploy falha se ≠ secret.
3. Um host documentado: `pdv-importados.vercel.app`.
4. Desligar Git Integration duplicada no projeto legado (checklist abaixo).

Isto **não** reintroduz Git como autoridade — só valida destino de deploy.

## Branch protection (GitHub — manual)

Para que **E2E não bloqueie merge/deploy**, configure em **Settings → Branches → `main` → Require status checks**:

| Exigir (decisão) | Não exigir (risco) |
|------------------|-------------------|
| `build-and-test` | `E2E crítico (sistema de risco)` |
| `validate-production (SSRA)` (após 1º deploy com `/api/health`) | `e2e-playwright` |

Se `e2e-critical` for required check, merge em `main` fica bloqueado mesmo com SSRA verde — viola o modelo decisão vs risco.

## Checklist manual Vercel (one-shot)

Executar no dashboard Vercel / GitHub — **fora do CI**:

- [ ] **Arquivar** (ou pausar) o projeto Vercel `fastproduct` — evita segundo pipeline e domínio fantasma.
- [ ] Confirmar que **produção** do projeto `pdv-importados` aponta para `pdv-importados.vercel.app`.
- [ ] **Desligar** auto-deploy Git no projeto `fastproduct` (se ainda existir link ao repositório).
- [ ] Manter **apenas** o workflow [ci-pdv-importados.yml](../.github/workflows/ci-pdv-importados.yml) como caminho de release em `main`.
- [ ] Definir variable `EXPECTED_VERCEL_PROJECT_ID` no repositório GitHub com o ID do projeto `pdv-importados`.
- [ ] Após primeiro deploy com `/api/health`, rodar `npm run validate:production` e guardar log como evidência.

## Rollback

1. Vercel → projeto `pdv-importados` → Deployments → selecionar deployment estável → **Promote to Production**.
2. `npm run validate:production` — confirmar novo `deploymentId` alinhado.
3. Se regressão funcional detectada pelo `e2e-critical` assíncrono, repetir passos 1–2.

Ver também [RUNBOOK_ROLLBACK.md](./RUNBOOK_ROLLBACK.md).

## O que não existe neste modelo

| Item | Status |
|------|--------|
| `scripts/prod-alignment-check.mjs` | Não criar |
| `scripts/fastproduct-ghost-check.mjs` | Não criar |
| `scripts/deploy-hygiene-check.mjs` como gate CI | Não usar |
| Job `smoke-test` como gate release | Removido do CI |
| E2E como sistema de decisão (`needs: e2e-critical` no deploy) | Proibido |
| Comparação `origin/main` vs runtime | Proibido |

## Referências

- [PRODUCAO_GO_NO_GO.md](./PRODUCAO_GO_NO_GO.md)
- [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)
- [E2E.md](./E2E.md)
