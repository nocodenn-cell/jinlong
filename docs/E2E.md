# Testes E2E — Playwright

Os testes ficam em `pdv-importados/e2e/` e usam `pdv-importados/playwright.config.ts`.

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

O job **Playwright** é **opcional**: crie a variável de repositório **`ENABLE_PLAYWRIGHT_E2E`** = `true` e defina os secrets **`PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_URL`**, **`PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_ANON_KEY`** (e, para `gerente.spec.ts`, **`PLAYWRIGHT_TEST_EMAIL`** / **`PLAYWRIGHT_TEST_PASSWORD`**). Para testes em **`/caixa`**, inclua **`PLAYWRIGHT_CAIXA_TEST_EMAIL`** / **`PLAYWRIGHT_CAIXA_TEST_PASSWORD`** (e opcionalmente **`PLAYWRIGHT_E2E_PRODUTO_CODIGO`**). No CI o Playwright sobe o Next com **`PLAYWRIGHT_E2E_WITH_DEV=1`** (ver `playwright.config.ts`), salvo se **`PLAYWRIGHT_BASE_URL`** estiver definido (deploy de staging — ver workflow abaixo).

### Workflow só E2E (sem lint/build)

[`.github/workflows/e2e-playwright-only.yml`](../.github/workflows/e2e-playwright-only.yml) executa apenas **`npm run test:e2e:critical`** (`install` + Playwright). Dispara em **`workflow_dispatch`** ou em **push** na branch **`staging`**, quando **`ENABLE_PLAYWRIGHT_E2E=true`** *ou* quando o disparo é manual. Útil para homologação sem repetir o pipeline completo do app.

Se o secret **`PLAYWRIGHT_BASE_URL`** apontar para o deploy de staging (ex.: Vercel preview estável), o job define **`PLAYWRIGHT_E2E_WITH_DEV=0`** e os testes batem na URL remota; caso contrário, sobe **`next dev`** na porta de teste (comportamento igual ao job Playwright do CI principal).

**Staging / homologação:** além de `ENABLE_PLAYWRIGHT_E2E=true`, mantenha os mesmos secrets apontando para o projeto Supabase de **staging** e usuários seed só desse ambiente — evita E2E contra produção.

Testes que dependem de credenciais de gerente são **pulados** se `PLAYWRIGHT_TEST_*` estiverem ausentes.

## Notas sobre o app

- Rota de login: **`/login`** (sem `/pt/`).
- **`middleware.ts`:** sem sessão → `/login?next=...`. Com sessão: **OPERADOR** não acessa `/gerente/*` (vai para `/caixa`); **GERENTE/DONO** não acessa `/caixa` (vai para `/gerente/produtos`). Testes de gerente precisam de usuário com perfil adequado.
