# Produção — go / no-go (o que o Git resolve vs o que a equipa faz)

**Não é possível “fechar produção” só com commits:** migrações aplicam-se no Supabase, secrets na Vercel/Edge, e domínio/DNS são operação. Este ficheiro separa **gates no repositório** de **ações manuais obrigatórias**.

## O que já fica automatizado no CI (após merge em `main`)

Princípio: **E2E = sistema de risco, não sistema de decisão.** Só as linhas abaixo em “Decisão” podem impedir ou invalidar release; E2E gera alerta operacional.

### Sistemas de decisão (release authority)

| Gate | Onde |
|------|------|
| Lint + typecheck + testes unitários + build Next | Job `build-and-test` |
| Deploy Vercel produção (`--prod`) | Job `deploy` — projeto `pdv-importados`, host `https://pdv-importados.vercel.app` |
| **SSRA** — platform `deploymentId` === `/api/health` | Job `validate-production` — `npm run validate:production` |

Workflow: [`.github/workflows/ci-pdv-importados.yml`](../.github/workflows/ci-pdv-importados.yml).

**Autoridade de release:** apenas o Deployment ID da Vercel no host de produção — não comparar `origin/main` nem `github.sha` com runtime. Ver [SSRA_RELEASE.md](./SSRA_RELEASE.md).

Secrets mínimos para deploy + SSRA: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `CI_NEXT_PUBLIC_*`. Opcional: variable `EXPECTED_VERCEL_PROJECT_ID` (fail-fast se secret divergir).

### Sistemas de risco (observação — não bloqueiam deploy)

| Observador | Onde | Se falhar |
|------------|------|-----------|
| E2E crítico (sync + vendas) | Job `e2e-critical` (paralelo a `deploy`) | Issue + investigação; rollback manual se regressão em prod |
| Playwright suíte completa | Job `e2e-playwright` (opcional, `ENABLE_PLAYWRIGHT_E2E`) | Idem |
| Smoke pós-deploy | `test:e2e:post-deploy-smoke` — manual ou agendado | Idem |

Falha em sistema de risco **não** reverte nem impede um release que passou `validate-production`.

## O que a equipa **tem** de fazer fora do Git (P0)

Seguir na ordem [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md) e [SECURANCA_CHECKLIST_FECHAMENTO.md](./SECURANCA_CHECKLIST_FECHAMENTO.md):

1. **Supabase produção:** `migration list` / `db push` sem lacunas; `verify_p0_producao.sql` e smokes SQL indicados no P0.
2. **Edge:** `functions deploy` (`sync-outbox`, `validar-gerente`, e outras em uso) + secrets (`SYNC_KEY`, service role na função, etc.) — [backend/supabase/README.md](../backend/supabase/README.md).
3. **Vercel:** variáveis `NEXT_PUBLIC_*` e chaves só em servidor — [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md).
4. **PDV desktop (se em uso):** `pdv-local/.env` com `SYNC_*` alinhado à Edge.
5. **Teste manual §4 ou §4b** do P0 no ambiente que vai a loja.
6. **Smoke de i18n em navegadores chineses (360/QQ):** executar e anexar evidências em [SMOKE_BROWSER_CHINES_360_QQ.md](./SMOKE_BROWSER_CHINES_360_QQ.md).

## O que continua backlog pós–go-live (não bloqueia o 1.º deploy por si)

[BACKLOG_TECNICO.md](./BACKLOG_TECNICO.md): kardex avançado, arredondamento ABNT unificado, devoluções fora de `cancelar_venda`, mais E2E mutadores, clarificação offline web vs desktop.

## Comandos úteis antes de declarar “produção OK”

```bash
# Na raiz do monorepo (check + lint + test + build Next — sem build Vite do pdv-local)
npm run ci

# SSRA — após deploy em produção (requer VERCEL_TOKEN)
npm run validate:production
```

Build do desktop (`pdv-local`): workflow [`.github/workflows/ci-pdv-local.yml`](../.github/workflows/ci-pdv-local.yml) ou `npm run build:all` na raiz.

```powershell
cd backend
npx supabase migration list
```

Smoke local contra um deploy (URL fixa):

```powershell
$env:CI="true"
$env:PLAYWRIGHT_E2E_WITH_DEV="0"
$env:PLAYWRIGHT_BASE_URL="https://(seu-deploy).vercel.app"
$env:NEXT_PUBLIC_SUPABASE_URL="..."
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
$env:PLAYWRIGHT_CAIXA_TEST_EMAIL="..."
$env:PLAYWRIGHT_CAIXA_TEST_PASSWORD="..."
npm run test:e2e:post-deploy-smoke -w pdv-importados
```

Pipeline E2E **completo** (sync + venda + fluxos) continua em `npm run test:e2e:critical` — requer mais secrets e ambiente; ver [E2E.md](./E2E.md).

Cobertura de i18n (admin/gerente) para Go/No-Go:

- E2E desktop + mobile (Playwright) para troca/persistência de idioma e validação em chinês.
- Smoke manual 360/QQ preenchido com evidência no PR de release.
