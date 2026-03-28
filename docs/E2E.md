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

```bash
cd pdv-importados
npm install
# Primeira vez: instalar Chromium
npx playwright install chromium

# Terminal 1 (opcional se não usar webServer do Playwright)
npm run dev

# Terminal 2
npm run test:e2e
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
| `PLAYWRIGHT_BASE_URL` | Não | Padrão `http://localhost:3009` (servidor de teste do Playwright) |
| `PLAYWRIGHT_TEST_PORT` | Não | Porta do `next dev` iniciado pelo Playwright (padrão `3009`) |
| `PLAYWRIGHT_REUSE_SERVER` | Não | Defina `1` para reutilizar um `next dev` já rodando na mesma porta (padrão: sempre sobe servidor novo) |
| `PLAYWRIGHT_TEST_EMAIL` | Para suite gerente | Usuário **GERENTE** ou **DONO** |
| `PLAYWRIGHT_TEST_PASSWORD` | Para suite gerente | Senha do usuário de teste |

Sem `PLAYWRIGHT_TEST_*`, os testes do arquivo `gerente.spec.ts` são **pulados** no `beforeEach`.

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

O job **Playwright** é **opcional**: crie a variável de repositório **`ENABLE_PLAYWRIGHT_E2E`** = `true` e defina os secrets **`PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_URL`**, **`PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_ANON_KEY`** (e, para `gerente.spec.ts`, **`PLAYWRIGHT_TEST_EMAIL`** / **`PLAYWRIGHT_TEST_PASSWORD`**). No CI o Playwright sobe o Next com **`PLAYWRIGHT_E2E_WITH_DEV=1`** (ver `playwright.config.ts`).

Testes que dependem de credenciais de gerente são **pulados** se `PLAYWRIGHT_TEST_*` estiverem ausentes.

## Notas sobre o app

- Rota de login: **`/login`** (sem `/pt/`).
- **`middleware.ts`:** sem sessão → `/login?next=...`. Com sessão: **OPERADOR** não acessa `/gerente/*` (vai para `/caixa`); **GERENTE/DONO** não acessa `/caixa` (vai para `/gerente/produtos`). Testes de gerente precisam de usuário com perfil adequado.
