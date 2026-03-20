# Prompt único — sessão autônoma (fastproduct)

> **Preferir:** [`CURSOR_PROMPT_SESSAO_AUTONOMA_V3.md`](./CURSOR_PROMPT_SESSAO_AUTONOMA_V3.md) — verificada contra o repo (`payload_json`, `X-SYNC-KEY`, migrations `001`–`006`, `db.rs`). Alternativa: [`CURSOR_PROMPT_SESSAO_AUTONOMA_V2.md`](./CURSOR_PROMPT_SESSAO_AUTONOMA_V2.md).

Cole o bloco abaixo **inteiro** no Cursor (Composer / Agent) em uma nova conversa.  
**Objetivo:** executar tudo em sequência, sem pedir confirmação intermediária; assumir TypeScript, Next 15 App Router, Supabase, Tauri no `pdv-local`.

---

```
Você é um dev sênior. Trabalhe no monorepo `c:\Naturecode\fastproduct` (pdv-importados, pdv-local, supabase em pdv-importados).

## 0) Verificação rápida
- Confirme se `pdv-importados/next.config.js` NÃO contém `experimental.appDir` (Next 15). Se ainda existir `experimental: { appDir }`, remova o bloco `experimental` inteiro.
- Avalie o bloco `i18n: { locales, defaultLocale }` em `next.config.js`: no App Router ele costuma ser legado do Pages Router. Se o app não usa `pages/` com locale automático, remova `i18n` do next.config e documente no README (o projeto usa `getMessages` + paths sem `[locale]`).
- Garanta `.gitignore` na RAIZ `fastproduct/` ignorando `**/node_modules/`, `**/.next/`, `**/.env.local`, etc. Se faltar, crie/atualize. **Não** ignore `.cursor/` inteiro se o time versiona `.cursor/rules`.

## 1) i18n — uma única fonte de verdade
Hoje existem `pdv-importados/messages/*.json` e `pdv-importados/src/lib/i18n/*.json`; `getMessages.ts` importa de `src/lib/i18n/`.
- **Opção preferida:** manter apenas `src/lib/i18n/` como canônico; remover duplicata `messages/` OU substituir `messages/` por symlinks/README apontando para `src/lib/i18n`.
- Se remover `messages/`, grep o repo por imports de `messages/` e corrija.
- Atualize `src/lib/i18n/README.md` e `pdv-importados/README.md`: uma frase clara “editar traduções só em `src/lib/i18n/*.json`”; manter chaves alinhadas entre `pt`, `zh`, `zh-HK` (ex.: namespace **comum**).
- Rode `npm test` em `pdv-importados`.

## 2) Testes E2E mínimos (Playwright)
- Adicione `@playwright/test` em `pdv-importados` como devDependency.
- `playwright.config.ts`: baseURL `http://localhost:3000` (ou 3001 se documentado), testDir `e2e/`, `webServer` opcional com `reuseExistingServer: true` quando fizer sentido.
- **Rotas reais:** login em **`/login`** (não use prefixo `/pt/`). Placeholders típicos: **"Email"** e **"Senha"**; botão **"Entrar"**. O seletor de idioma pode **não** mudar o path da URL — validar asserts contra o código atual.
- Cenários mínimos:
  - `e2e/login.spec.ts`: visita `/login`; se `NEXT_PUBLIC_SUPABASE_URL` ausente, skip ou assert mensagem de config (evitar flake em CI sem env); com env mock ou projeto de teste, preenche formulário e espera redirect ou erro controlado.
  - `e2e/gerente.spec.ts`: autenticação (cookie injetado OU login real com `PLAYWRIGHT_TEST_EMAIL` / `PLAYWRIGHT_TEST_PASSWORD`) e `/gerente/produtos` com conteúdo esperado (texto vindo de `getMessages` em pt).
- Script `package.json`: `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`, opcional `"test:e2e:report": "playwright show-report"`.
- Documente em `docs/E2E.md`: como rodar local (`npm run dev` + `npx playwright install`), variáveis de ambiente e que CI precisa de secrets.

## 3) Deploy (Vercel + envs)
- Crie `docs/DEPLOY_VERCEL.md` em português:
  - Variáveis na Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; nunca `SUPABASE_SERVICE_ROLE_KEY` no cliente.
  - Edge Functions / PDV local: secrets separados (`SYNC_KEY`, etc.) — referência a `supabase/README.md` e `docs/SUPABASE_ENV.md`.
  - Build command / root: se monorepo, `cd pdv-importados && npm install && npm run build` ou projeto Vercel apontando para `pdv-importados`.

## 4) Produto — sync caixa na Edge + estoque (visão MVP)
- **Edge:** **estender** `pdv-importados/supabase/functions/sync-outbox/index.ts` sem quebrar o contrato atual: **`Deno.serve`**, header **`X-SYNC-KEY`**, corpo **`{ events: ... }`** com `payload_json` (string) como já usado pelo PDV local.
- **Caixa:** novos tipos além de `VENDA_REGISTRADA`: ex. `CAIXA_ABERTO`, `CAIXA_FECHADO`, `MOVIMENTO_CAIXA` → `public.caixas` / `public.movimentos_caixa`. Idempotência por id do evento/registro local.
- **Rust (`pdv-local`):** enfileirar na tabela **`outbox`** (schema SQLite existente), em **`src-tauri/src/db.rs`** (ou módulo já responsável pela sync) — não inventar `sync_queue` sem alinhar ao schema.
- **Estoque:** MVP sugerido na Edge após venda OK: RPC ou transação idempotente com `venda_id`; **nova migration** com número **posterior** às já existentes em `supabase/migrations/` (não reutilizar `003_` se já houver).
- Atualizar `TAURI_SYNC.md` / `pdv-local/README.md` com a matriz evento → tabela.

## 5) Qualidade
- `npm run build` e `npx tsc --noEmit` (se configurado) em `pdv-importados` sem erros.
- `npm test` em `pdv-importados` e `pdv-local`; opcional `npm run test:e2e` (aceitar skips sem env).
- `cargo check` em `pdv-local/src-tauri`.

## 6) Entrega
- Liste arquivos alterados e decisões (ex.: removeu `messages/` ou manteve symlink).
- Se algo exigir credencial humana (Supabase dashboard), descreva o passo manual em 1 parágrafo.

Idioma das mensagens ao usuário final: pt-BR. Não peça confirmação no meio; escolha padrões sensatos.
```

---

## Análise resumida (para você)

| Item | Complexidade | Nota |
|------|----------------|------|
| `next.config` | Baixa | `appDir` já é removível; revisar `i18n` no App Router. |
| `.gitignore` raiz | Baixa | Evita ruído de `node_modules`; não bloquear `.cursor/rules` versionado. |
| Playwright | Média | Login real exige env em CI; use skip ou projeto Supabase de teste; rotas sem `/pt/`. |
| Unificar i18n | Média | Menos duplicação = menos bugs `common` vs `comum`. |
| Deploy Vercel | Baixa (doc) | Crítico listar envs públicas vs secretas. |
| Caixa/estoque na Edge | Alta | Impacto em DB, Rust, function; fazer em PRs incrementais; manter contrato `events` + `X-SYNC-KEY`. |

- **Versão curta (este arquivo):** prompt único acima, já alinhado aos pontos críticos do repo.  
- **Versão v3 (recomendada):** [`CURSOR_PROMPT_SESSAO_AUTONOMA_V3.md`](./CURSOR_PROMPT_SESSAO_AUTONOMA_V3.md).  
- **Versão v2:** [`CURSOR_PROMPT_SESSAO_AUTONOMA_V2.md`](./CURSOR_PROMPT_SESSAO_AUTONOMA_V2.md).

Arquivos em `fastproduct/docs/`: COMPLETA, AUTONOMA_V2, **AUTONOMA_V3**.
