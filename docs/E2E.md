# Testes E2E — Playwright

Os testes ficam em `pdv-importados/e2e/` e usam `pdv-importados/playwright.config.ts`.

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

## CI

Configure os secrets no GitHub (ou no provedor de CI). Testes que dependem de credenciais de gerente não falham o job se estiverem skip — para cobertura completa, defina as variáveis de teste.

## Notas sobre o app

- Rota de login: **`/login`** (sem `/pt/`).
- **`middleware.ts`:** sem sessão → `/login?next=...`. Com sessão: **OPERADOR** não acessa `/gerente/*` (vai para `/caixa`); **GERENTE/DONO** não acessa `/caixa` (vai para `/gerente/produtos`). Testes de gerente precisam de usuário com perfil adequado.
