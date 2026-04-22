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

Outra porta: `SMOKE_BASE_URL=http://localhost:3009 npm run smoke:http`

## Rodar localmente

Instale dependências na **raiz** do monorepo (recomendado — um único `package-lock.json`):

```bash
cd fastproduct   # raiz do repo
npm ci
# Primeira vez: instalar Chromium
npx playwright install chromium

# Terminal 1 (opcional se não usar webServer do Playwright)
npm run dev:web

# Terminal 2
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
| `PLAYWRIGHT_BASE_URL` | Não | Padrão `http://localhost:3009` (servidor de teste do Playwright). Se definido no CI (secret), o Playwright **não** sobe `next dev` (`PLAYWRIGHT_E2E_WITH_DEV=0`) e usa essa URL (ex.: deploy de staging). |
| `PLAYWRIGHT_TEST_PORT` | Não | Porta do `next dev` iniciado pelo Playwright (padrão `3009`) |
| `PLAYWRIGHT_REUSE_SERVER` | Não | Defina `1` para reutilizar um `next dev` já rodando na mesma porta (padrão: sempre sobe servidor novo) |
| `PLAYWRIGHT_TEST_EMAIL` | Para suite gerente | Usuário **GERENTE** ou **DONO** |
| `PLAYWRIGHT_TEST_PASSWORD` | Para suite gerente | Senha do usuário de teste |
| `PLAYWRIGHT_CAIXA_TEST_EMAIL` | Para `/caixa` (`caixa.spec`, `caixa-fluxos-criticos`, pipeline `test:e2e:critical`) | Usuário com **`perfil = OPERADOR`** (o middleware redireciona GERENTE/DONO para `/gerente`) |
| `PLAYWRIGHT_CAIXA_TEST_PASSWORD` | Idem | Senha do operador de teste |
| `PLAYWRIGHT_E2E_PRODUTO_CODIGO` | Não | Código de barras existente no Postgres (padrão **7898512340003** — seed migration `027`). Usado em `e2e/caixa-venda.spec.ts`. |

Sem `PLAYWRIGHT_TEST_*`, os testes do arquivo `gerente.spec.ts` são **pulados** no `beforeEach`. Com credenciais, `gerente.spec.ts` valida cabeçalho/navegação do painel, tabela do início, páginas **Caixas** (export CSV) e **Relatórios** (filtro de período).

`admin-idioma.spec.ts` cobre troca/persistência de idioma no `/admin` e roda também nos projetos mobile.

O ficheiro `e2e/caixa-venda-multi-pagamento.spec.ts` (pipeline crítico) exige as mesmas variáveis de operador e catálogo que `caixa-venda.spec.ts`: split **DINHEIRO + PIX** com valores lidos do total no rodapé.

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

O workflow [`.github/workflows/ci-pdv-importados.yml`](../.github/workflows/ci-pdv-importados.yml) roda **build + lint + Vitest** quando há mudanças em `pdv-importados/`. Alterações só em `backend/` disparam [`.github/workflows/ci-backend-supabase.yml`](../.github/workflows/ci-backend-supabase.yml) (`deno check` na Edge `sync-outbox`).

Em **`main`**, após deploy na Vercel, o job **smoke-test** corre **`npm run test:e2e:post-deploy-smoke`** (`e2e/login.spec.ts` + `e2e/caixa.spec.ts`) com `PLAYWRIGHT_BASE_URL` = URL do deploy e `PLAYWRIGHT_E2E_WITH_DEV=0`. Ver [PRODUCAO_GO_NO_GO.md](./PRODUCAO_GO_NO_GO.md).

### E2E crítico obrigatório (gate em `main` / `develop`)

No workflow [`.github/workflows/ci-pdv-importados.yml`](../.github/workflows/ci-pdv-importados.yml), após **build-and-test**, o job **`e2e-critical`** roda sempre **`npm run test:e2e:critical`** (check-env, smoke `sync-outbox`, `sync-fluxo-gerente`, vendas caixa e fluxos críticos). O **deploy em `main` na Vercel só prossegue** se esse job tiver sucesso (ou for ignorado em PR de fork, sem secrets).

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
