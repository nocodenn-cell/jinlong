# Testes E2E — Playwright

Os testes ficam em `pdv-importados/e2e/` e usam `pdv-importados/playwright.config.ts`.

Projetos Playwright atuais:

- `chromium` (desktop)
- `mobile-chrome-pixel` (Android/Pixel)
- `mobile-safari-iphone` (iPhone/Safari)

## Smoke HTTP rapido

Com o app em `npm run dev` (porta 3000 por padrao):

```bash
cd pdv-importados
npm run smoke:http
```

Outra porta: `SMOKE_BASE_URL=http://localhost:3001 npm run smoke:http`

## Rodar localmente

Instale dependências na **raiz** do monorepo (recomendado — um único `package-lock.json`):

```bash
cd fastproduct   # raiz do repo
npm ci
# Primeira vez: instalar Chromium
npx playwright install chromium

# Com `npm run dev:web` já em :3000, o Playwright reutiliza o mesmo servidor (sem segundo `next dev`).
# Sem dev: o Playwright sobe `next dev` na porta configurada (padrão 3000).
npm run test:e2e -w pdv-importados
```

Interface gráfica de debug:

```bash
npm run test:e2e:ui
```

Relatório após falha:

```bash
npm run test:e2e:report
```

## Variáveis de ambiente

| Variável | Obrigatório | Uso |
|----------|-------------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Para testes de login | Cliente Supabase no browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Recomendado com URL | Auth real nos testes de login |
| `PLAYWRIGHT_BASE_URL` | Não | Padrão `http://localhost:3000` (alinhado ao `next dev`). No CI, secret ausente pode virar string vazia — `playwright.config.ts` e `e2e/helpers/url.ts` (`gotoApp`) normalizam com `trim() \|\| localhost`. Sem `PLAYWRIGHT_E2E_WITH_DEV`, o Playwright **não** sobe `next dev`; use URL de deploy/staging via secret quando aplicável. |
| `PLAYWRIGHT_TEST_PORT` | Não | Porta do `webServer` / `baseURL` local (padrão `3000`). Ex.: `3009` para E2E isolado com dev ainda em `3000`. |
| `PLAYWRIGHT_REUSE_SERVER` | Não | Fora do CI, reutilizar `next dev` já na mesma porta é o **padrão**. Defina `0` para forçar o Playwright a subir `next dev` via `webServer` (falha se a porta estiver ocupada). |
| `PLAYWRIGHT_TEST_EMAIL` | Para suite gerente | Usuário **GERENTE** ou **DONO** |
| `PLAYWRIGHT_TEST_PASSWORD` | Para suite gerente | Senha do usuário de teste |
| `PLAYWRIGHT_CAIXA_TEST_EMAIL` | Para `/caixa` (`caixa.spec`, `caixa-venda`, `caixa-venda-multi-pagamento`, `caixa-fluxos-criticos`, pipeline `test:e2e:critical`) | Usuário com **`perfil = OPERADOR`** (o middleware redireciona GERENTE/DONO para `/gerente`) |
| `PLAYWRIGHT_CAIXA_TEST_PASSWORD` | Idem | Senha do operador de teste |
| `PLAYWRIGHT_E2E_PRODUTO_CODIGO` | Não | Código de barras existente no Postgres (padrão **7898512340003** — seed migration `027`). Usado em `e2e/caixa-venda.spec.ts`. |

Sem `PLAYWRIGHT_TEST_*`, os testes do arquivo `gerente.spec.ts` são **pulados** no `beforeEach`. Com credenciais, `gerente.spec.ts` valida cabeçalho/navegação do painel, tabela do início, páginas **Caixas** (export CSV) e **Relatórios** (filtro de período).

`admin-idioma.spec.ts` cobre troca/persistência de idioma no `/admin` e roda também nos projetos mobile.

O ficheiro `e2e/caixa-venda-multi-pagamento.spec.ts` faz parte do pipeline **`test:e2e:critical`** (após `caixa-venda.spec.ts`). Exige as mesmas variáveis de operador e catálogo que `caixa-venda.spec.ts`: split **DINHEIRO + PIX** (e cenário de 3 parcelas) na **aba Pgto** do PDV — não no footer. Valores lidos de `data-testid="caixa-total-liquido"` no rodapé.

### Financial Gate (complemento ao E2E)

O gate financeiro de produção (`npm run gate:pdv` na raiz do monorepo) **não** roda no pipeline Playwright, mas é **bloqueante para go-live** (ver [pdv-production-financial-gate.md](./pdv-production-financial-gate.md)). Pré-requisitos compartilhados com E2E de caixa:

| Variável | Uso no gate |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | Projeto staging alvo |
| `SUPABASE_SERVICE_ROLE_KEY` | RPCs admin + validação ledger |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Login operador (`e2e-operador@localhost.test`) |
| `SEED_DEV_PASSWORD` ou `PLAYWRIGHT_TEST_PASSWORD` | Senha do operador seed |

Antes do gate: `npm run seed:dev-users && npm run seed:demo-fluxo` em `pdv-importados`. Saída esperada: `[PDV SIMULATED PRODUCTION GATE]` com `FINAL RESULT: GO`.

Sem `PLAYWRIGHT_CAIXA_TEST_*`, os testes de **caixa** são **pulados** (local e CI). Para o smoke `test:e2e:critical` e `caixa-fluxos-criticos.spec.ts` exercitarem `/caixa`, defina esses secrets no GitHub (usuário **OPERADOR** do seed, ex.: `e2e-operador@localhost.test`).

### Criar usuário de teste no Supabase

O login exige linha em **`public.usuarios`** com o mesmo UUID do Auth. Para gerar **Auth + `usuarios`** de uma vez (recomendado):

```bash
cd pdv-importados
# .env.local: SUPABASE_SERVICE_ROLE_KEY + SEED_DEV_PASSWORD (ou use PLAYWRIGHT_TEST_PASSWORD)
npm run seed:dev-users
```

Documentação completa: [SEED_DEV_E2E](../pdv-importados/docs/SEED_DEV_E2E.md). Alinhe `PLAYWRIGHT_TEST_EMAIL` ao e-mail do **gerente** (padrão do seed: `e2e-gerente@localhost.test`).

## CI

### E2E = sistema de risco, não sistema de decisão

Neste repositório, **todos** os pipelines Playwright são **sistemas de risco**: detectam regressão funcional possível, mas **não** decidem se um release foi promovido em produção.

| Camada | Papel | Bloqueia deploy em `main`? |
|--------|-------|----------------------------|
| `build-and-test` | Decisão — integridade técnica (lint, typecheck, unit, build) | **Sim** |
| `validate-production` | Decisão — SSRA (Deployment ID plataforma ↔ `/api/health`) | **Sim** (pós-deploy) |
| `e2e-critical` | Risco — sync, vendas, fluxos críticos | **Não** |
| `e2e-playwright` (opcional) | Risco — suíte completa | **Não** |
| `test:e2e:post-deploy-smoke` | Risco — manual/agendado | **Não** |

Autoridade de release: [SSRA_RELEASE.md](./SSRA_RELEASE.md). Falha E2E → alerta + investigação + rollback **se** regressão confirmada — não veto automático de release.

---

O workflow [`.github/workflows/ci-pdv-importados.yml`](../.github/workflows/ci-pdv-importados.yml) roda **build + lint + Vitest** quando há mudanças em `pdv-importados/`. Alterações só em `backend/` disparam [`.github/workflows/ci-backend-supabase.yml`](../.github/workflows/ci-backend-supabase.yml) (`deno check` na Edge `sync-outbox`).

Em **`main`**, o único gate pós-deploy de **decisão** é **SSRA** (`validate-production`). Ver também [PRODUCAO_GO_NO_GO.md](./PRODUCAO_GO_NO_GO.md).

### E2E crítico (sistema de risco, assíncrono)

No workflow [`.github/workflows/ci-pdv-importados.yml`](../.github/workflows/ci-pdv-importados.yml), após **build-and-test**, o job **`e2e-critical`** corre o pipeline Playwright crítico em **paralelo** com `deploy`. Na raiz do monorepo:

```bash
npm run test:e2e:critical
```

Equivalente explícito: `npm run test:e2e:critical -w pdv-importados` (script em `pdv-importados/scripts/e2e-critical-pipeline.mjs`: `env:check`, smoke sync-outbox, depois `sync-fluxo-gerente`, `caixa-venda`, `caixa-venda-multi-pagamento`, `caixa-fluxos-criticos`). Não participa da cadeia `deploy` → `validate-production`. Falha → tratar como risco (issue, repro, rollback manual se necessário).

**Complemento bloqueante para go-live (não Playwright):** `npm run gate:pdv` na raiz — ver [pdv-production-financial-gate.md](./pdv-production-financial-gate.md).

Secrets **obrigatórios** no repositório (Actions):

| Secret | Uso |
| --- | --- |
| `PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase de **teste/staging** |
| `PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key do mesmo projeto |
| `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD` | Usuário **GERENTE** (sync + painel) |
| `PLAYWRIGHT_CAIXA_TEST_EMAIL` / `PLAYWRIGHT_CAIXA_TEST_PASSWORD` | Usuário **OPERADOR** (`/caixa`) |
| `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY` | **Service role** do mesmo projeto (só CI; seed no teste sync) |
| `SYNC_ENDPOINT` / `SYNC_KEY` | Edge **sync-outbox** (mesmo par usado no backend) |

Opcionais: `PLAYWRIGHT_BASE_URL` (testar contra deploy em vez de subir `next dev`), `PLAYWRIGHT_E2E_PRODUTO_CODIGO`.

O job **Playwright suíte completa** (`npm run test:e2e`) continua **opcional**: variável de repositório **`ENABLE_PLAYWRIGHT_E2E`** = `true` e os mesmos secrets acima. No CI o Playwright sobe o Next com **`PLAYWRIGHT_E2E_WITH_DEV=1`** (ver `playwright.config.ts`), salvo se **`PLAYWRIGHT_BASE_URL`** estiver definido.

### Workflow só E2E (sem lint/build)

[`.github/workflows/e2e-playwright-only.yml`](../.github/workflows/e2e-playwright-only.yml) executa apenas **`npm run test:e2e:critical`** em **push** na branch **`staging`** ou **`workflow_dispatch`**, com os mesmos secrets obrigatórios da tabela acima (o workflow grava `pdv-importados/.env.local` e `pdv-local/.env` antes do pipeline).

Se o secret **`PLAYWRIGHT_BASE_URL`** apontar para o deploy de staging (ex.: Vercel preview estável), o job define **`PLAYWRIGHT_E2E_WITH_DEV=0`** e os testes batem na URL remota; caso contrário, sobe **`next dev`** na porta de teste.

**Staging / homologação:** mantenha os secrets apontando para o projeto Supabase de **staging** e usuários seed só desse ambiente — evita E2E contra produção.

Smoke manual específico para browsers chineses (360/QQ): [SMOKE_BROWSER_CHINES_360_QQ.md](./SMOKE_BROWSER_CHINES_360_QQ.md).

Testes que dependem de credenciais de gerente são **pulados** se `PLAYWRIGHT_TEST_*` estiverem ausentes.

## Notas sobre o app

- Rota de login: **`/login`** (sem `/pt/`).
- **`middleware.ts`:** sem sessão → `/login?next=...`. Com sessão: **OPERADOR** não acessa `/gerente/*` (vai para `/caixa`); **GERENTE/DONO** não acessa `/caixa` (vai para `/gerente/produtos`). Testes de gerente precisam de usuário com perfil adequado.
