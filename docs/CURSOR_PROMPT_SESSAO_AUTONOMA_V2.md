# Prompt sessão autônoma — fastproduct (v2 corrigida)

**Cole o bloco entre `<<<PROMPT` e `PROMPT>>>` inteiro no Cursor Composer / Agent (nova conversa).**  
Esta versão corrige o rascunho anterior contra o código real: rotas **sem** prefixo `/pt/`, i18n via **`getMessages` + `src/lib/i18n`**, Edge **`Deno.serve`** + payload **`events`**, SQLite **`outbox`** (não `sync_queue`).

---

## Análise do que mudou em relação ao rascunho

| Rascunho (incorreto / arriscado) | Realidade no repo |
|----------------------------------|-------------------|
| Rotas `/pt/login`, `/zh/gerente/...` | App Router em `app/login`, `app/gerente/*`, `app/caixa` — **sem** `[locale]` na URL |
| “next-intl gerencia i18n” | Dependência existe, mas o painel usa **`getMessages(idioma)`** + JSON em **`src/lib/i18n/`** + cookie/DB de idioma |
| Playwright: `getByPlaceholder(/email/i)` | Placeholders são **"Email"** e **"Senha"** (PT) |
| Edge: `serve` std Deno + `body.eventos` | Já existe **`Deno.serve`** + **`{ events: OutboxEvent[] }`** + header **`X-SYNC-KEY`** |
| Rust `sync.rs` + `sync_queue` | Lógica em **`db.rs`**, tabela **`outbox`** (`id`, `tipo`, `payload_json`, `status`) |
| Migration `003_rpc_estoque.sql` | Já existem migrations **001–006** — nova migration deve ser **`007_...sql`** |
| `.gitignore` com `.cursor/` inteiro | Pode impedir versionar **`.cursor/rules`**. Preferir **não** ignorar `.cursor/` ou ignorar só cache |
| `.vscode/settings.json` no ignore | Perde config útil do time; preferir não ignorar ou usar `*.local` |

---

<<<PROMPT

```
Você é um engenheiro sênior no monorepo:
  c:\Naturecode\fastproduct
  - pdv-importados  → Next.js 15 App Router + Supabase Auth + traduções via getMessages (src/lib/i18n/*.json)
  - pdv-local       → Tauri 2 + React + Vite + SQLite (outbox, vendas, caixa)
  - supabase/       → em pdv-importados/supabase (migrations + Edge Function sync-outbox)

Idioma de código: TypeScript onde aplicável. Mensagens ao usuário final: pt-BR.
Não peça confirmação no meio; decida com padrões sensatos.

Ao final:
1) Liste TODOS os arquivos criados/alterados/removidos (uma linha cada).
2) Seção "## Ações manuais necessárias" para passos só no Dashboard (Supabase/Vercel).

═══════════════════════════════════════════════════════
ETAPA 0 — Saneamento
═══════════════════════════════════════════════════════

0.1) pdv-importados/next.config.js
  - Remover `experimental.appDir` se ainda existir.
  - O bloco `i18n: { locales, defaultLocale }` é do **Pages Router**. Este projeto usa **App Router** sem `pages/` para rotas principais. Remova `i18n` do next.config se não houver `pages/` dependendo dele.
  - Documente em pdv-importados/README.md (1–2 linhas): rotas sem prefixo de locale; idioma via usuário + getMessages, não via prefixo de URL.

0.2) fastproduct/.gitignore (raiz)
  - Garantir: **/node_modules/, **/.next/, **/out/, **/dist/, **/.env.local, **/.env.*.local, **/.env (exceto !**/.env.example), **/target/ (Rust), logs, .DS_Store.
  - NÃO adicionar `.cursor/` inteiro (regras do projeto podem ser versionadas). Opcional: `.cursor/cache` se existir.

0.3) fastproduct/README.md
  - Se não existir: criar com visão do monorepo, como rodar pdv-importados (`npm run dev`) e pdv-local (`npm run tauri` ou `npx tauri dev` a partir de pdv-local), links para docs/DEPLOY_VERCEL.md, docs/E2E.md, docs/SUPABASE_ENV.md, pdv-importados/supabase/README.md.

═══════════════════════════════════════════════════════
ETAPA 1 — i18n: uma fonte
═══════════════════════════════════════════════════════

- Runtime: getMessages em src/lib/i18n/getMessages.ts importa **./pt.json, ./zh.json, ./zh-HK.json**.
- Unificar: remover pasta **pdv-importados/messages/** SE nada importar dela (grep). Caso algo importe, redirecionar imports para src/lib/i18n.
- Atualizar src/lib/i18n/README.md: chave **comum** (não "common"); toda chave nova em pt deve existir em zh e zh-HK.
- npm test + npm run build em pdv-importados.

═══════════════════════════════════════════════════════
ETAPA 2 — Playwright (E2E mínimo)
═══════════════════════════════════════════════════════

- Instalar @playwright/test; playwright.config.ts com testDir `e2e/`, baseURL `process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'`, webServer opcional com `reuseExistingServer: true`, timeout adequado.

**Rotas reais (sem /pt/):**
- Login: `/login` — título "PDV Importados", placeholders **Email** / **Senha**, botão **Entrar** (ou "Entrando..." quando loading).
- Gerente: `/gerente/produtos` (protegida; sem sessão redireciona conforme middleware — verificar comportamento real).

Testes sugeridos:
- login.spec.ts: formulário visível; skip se `!process.env.NEXT_PUBLIC_SUPABASE_URL`; credenciais inválidas → texto de erro (ex.: contendo "incorretos"); opcional rota protegida.
- gerente.spec.ts: skip sem `PLAYWRIGHT_TEST_EMAIL/PASSWORD`; login em `/login` → navegar para `/gerente/produtos` → assert conteúdo esperado (ex.: título produtos via tradução pt).
- **Não** assumir toggle "普通話" redirecionando para `/zh/gerente/...` — o LanguageToggle atual **não troca o prefixo da URL**; ajuste asserts ao código real (troca só idioma no servidor + revalidate).

Scripts: test:e2e, test:e2e:ui, test:e2e:report.
Criar docs/E2E.md em fastproduct/docs ou pdv-importados/docs (uma pasta só — escolha e documente).

═══════════════════════════════════════════════════════
ETAPA 3 — Deploy Vercel
═══════════════════════════════════════════════════════

Criar/atualizar docs/DEPLOY_VERCEL.md:
- Root Directory = pdv-importados se monorepo.
- Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY; service_role só server-side se necessário; nunca expor no cliente.
- SYNC_KEY e secrets da Edge ficam no **Supabase**, não na Vercel.
- Referência cruzada com docs/SUPABASE_ENV.md.

═══════════════════════════════════════════════════════
ETAPA 4 — Edge sync-outbox + estoque + caixa (incremental)
═══════════════════════════════════════════════════════

**Não substituir** o arquivo inteiro da function: estender **pdv-importados/supabase/functions/sync-outbox/index.ts** mantendo:
- POST, header **X-SYNC-KEY**, body **{ events: OutboxEvent[] }**, resposta **processed/failed**.

Novos valores de `ev.tipo` (além de VENDA_REGISTRADA):
- CAIXA_ABERTO, CAIXA_FECHADO, MOVIMENTO_CAIXA — payloads alinhados ao que o **pdv-local** pode enviar (reutilizar padrão JSON em payload_json).

**pdv-local:** em **src-tauri/src/db.rs** (e comandos Tauri), após abrir/fechar caixa e movimentos, **INSERT na tabela outbox** (mesmo schema atual), não criar `sync_queue` separada sem necessidade.

**Estoque:** nova migration **007_** (não reutilizar 003): RPC idempotente `decrementar_estoque_idempotente` + tabela de controle se necessário; conferir colunas reais de `public.estoque` (já tem `updated_at`).

**Documentação:** atualizar pdv-importados/core/sync/TAURI_SYNC.md e/ou pdv-local/README.md com matriz evento → tabela.

═══════════════════════════════════════════════════════
ETAPA 5 — Qualidade
═══════════════════════════════════════════════════════

cd pdv-importados && npm run build && npm test
cd pdv-local && npm test -- --run && (cd src-tauri && cargo check)
Opcional: npm run test:e2e (aceitar skips sem env).

═══════════════════════════════════════════════════════
ETAPA 6 — Entrega
═══════════════════════════════════════════════════════

Lista de arquivos + "## Ações manuais necessárias" (migrations no Supabase, secrets, Vercel envs, usuário Playwright).

```

PROMPT>>>

---

## Como usar

1. Copie apenas o conteúdo **entre** as linhas `<<<PROMPT` e `PROMPT>>>` (o bloco com ``` e o texto do agente).
2. Uma sessão pode não concluir ETAPA 4 inteira — aceitável entregar em sub-PRs (Edge primeiro, depois Rust).

Versão anterior genérica: `docs/CURSOR_PROMPT_SESSAO_COMPLETA.md` — prefira **esta v2** para este repositório.
