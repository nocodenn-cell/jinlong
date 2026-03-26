# Prompt sessão autônoma — fastproduct **v3 (adaptada ao repo)**

**Estado verificado (mar/2026):** `pdv-importados` sem pasta `pages/`; login em **`/login`**; `next.config.js` sem `i18n`; existe **`middleware.ts`** (sessao + **perfil**: OPERADOR vs GERENTE/DONO, query `next`); Edge **`sync-outbox`** com **`Deno.serve`**, **`events`**, **`payload_json`**, **`X-SYNC-KEY`**; SQLite **`outbox`** em **`pdv-local/src-tauri/src/db.rs`**; migrations até **`007_estoque_baixa_idempotente.sql`**.

**Correções aplicadas vs o rascunho v3 que você colou:**

| Rascunho v3 | Realidade neste monorepo |
|-------------|---------------------------|
| Stack “next-intl” como roteamento i18n | Traduções do painel: **`getMessages` + `src/lib/i18n/*.json`** + cookie/DB (`usuarioIdioma`). `next-intl` está em `package.json` mas **não** define URLs `/pt/...`. |
| Body Edge `eventos` + `payload` objeto | Contrato atual: **`events`**, cada item `{ id, tipo, payload_json, created_at }`; fazer **`JSON.parse(payload_json)`** no handler. |
| Header `x-sync-key` minúsculo | Código usa **`X-SYNC-KEY`** (HTTP é case-insensitive, mas alinhe testes/docs ao mesmo nome). |
| Exemplo completo substituindo `index.ts` | **Proibido** apagar `ensureCaixaPdv`, insert de venda/itens/desconto atual. **Estender** com `switch (ev.tipo)` após parse. |
| “Última migration 002” | Já existem **`006_pdv_caixa_sync.sql`**. Próximo arquivo: **`007_...`**. |
| `pdv-local/src/lib/db.ts` + `sync_queue` | **`pdv-local/src-tauri/src/db.rs`**, tabela **`outbox`**. Hoje só **`VENDA_REGISTRADA`** é enfileirada; caixa/movimento são **novos** trabalhos. |
| Resposta Edge `{ resultados }` | Cliente Rust espera **`{ ok, processed, failed }`**. Manter esse formato ao estender. |
| `.gitignore` com `.cursor/` e `.vscode/settings.json` | No repo atual a raiz **não** ignora `.cursor/`. **Não** force ignorar `.cursor/rules` versionado; evite `.vscode/settings.json` global no ignore. |
| Playwright: redirect protegido → `/login` | **`middleware.ts`** redireciona anônimos; E2E em `login.spec.ts` asserta `/login`. |
| `test.beforeAll` + `test.skip` | Em Playwright, prefira **`test.describe.skip()`** condicional ou skip no início do arquivo. |
| Pós-login `waitForURL` com `dashboard` | Login redireciona para **`/caixa`** (OPERADOR) ou **`/gerente/produtos`** (GERENTE/DONO), não `/gerente/dashboard` (rota pode não existir). |

---

Cole o bloco entre **`<<<PROMPT`** e **`PROMPT>>>`** inteiro no Cursor Composer / Agent em **nova conversa**.

---

<<<PROMPT

```
Você é um engenheiro sênior. Monorepo: c:\Naturecode\fastproduct

- pdv-importados → Next.js 15 App Router, Supabase Auth, textos via getMessages + src/lib/i18n/*.json (URLs sem [locale])
- pdv-local → Tauri 2 + React + Vite; SQLite com tabela outbox (Rust: src-tauri/src/db.rs)
- Edge Functions → backend/supabase/functions (Deno.serve)

Regras:
1) Não peça confirmação — decida e execute.
2) Antes de criar arquivo, leia se já existe.
3) Antes de nova migration, liste backend/supabase/migrations/*.sql e use o próximo número (hoje: após 006 → 007).
4) Mensagens ao usuário final: pt-BR.
5) Ao final, imprima "## Entrega" no formato especificado no final deste prompt.

════════════════════════════════════════════════════════
ETAPA 0 — Saneamento
════════════════════════════════════════════════════════

0.1) pdv-importados/next.config.js
  a) Remover `experimental.appDir` se existir.
  b) Verificar se existe pasta pdv-importados/pages/ com rotas reais. Se NÃO existir (só App Router), remova o bloco `i18n` inteiro e documente em pdv-importados/README.md:
     - Traduções: src/lib/i18n/*.json + getMessages; URLs sem prefixo de idioma.
  c) Rota de login: confirmar app/login/page.tsx → documentar "Rota de login: /login".
     Não existe middleware.ts no projeto até a data do prompt — se os redirects não baterem com a doc, ou corrija a doc ou implemente middleware (escolha consistente).

0.2) fastproduct/.gitignore (raiz)
  Leia e complete se necessário: node_modules, .next, out, dist, .env*, target/, src-tauri/gen/, logs, OS/IDE.
  NÃO adicionar `.cursor/` inteiro nem `.vscode/settings.json` sem necessidade do time.

0.3) fastproduct/README.md
  Se não existir, criar: descrição PDV bilíngue (PT / 普通话 / 廣東話), estrutura, como rodar:
  - cd pdv-importados && npm run dev
  - cd pdv-local && npx tauri dev (ou npm run tauri dev conforme package.json)
  Links: docs/DEPLOY_VERCEL.md, docs/E2E.md, docs/SUPABASE_ENV.md (se existir), backend/supabase/README.md

════════════════════════════════════════════════════════
ETAPA 1 — i18n uma fonte
════════════════════════════════════════════════════════

1.1) Canônico: src/lib/i18n/ (getMessages.ts importa pt.json, zh.json, zh-HK.json).
1.2) Se pdv-importados/messages/ for duplicata: grep imports; remover pasta ou redirecionar imports.
1.3) Garantir zh-HK.json alinhado em chaves com pt.json.
1.4) src/lib/i18n/README.md — editar só aqui; tabela de idiomas; aviso de paridade de chaves.
1.5) cd pdv-importados && npm run build

════════════════════════════════════════════════════════
ETAPA 2 — Playwright
════════════════════════════════════════════════════════

Só instalar se package.json não tiver @playwright/test.
playwright.config.ts: testDir e2e/, baseURL process.env.PLAYWRIGHT_BASE_URL ?? http://localhost:3000, webServer opcional npm run dev, reuseExistingServer: true.

LOGIN_PATH = '/login'
Placeholders exatos no DOM: placeholder "Email" e "Senha" (podem usar getByPlaceholder('Email') etc.).
Botão submit: texto "Entrar" ou "Entrando..." durante loading — usar regex /entrar/i com cuidado ao loading.

login.spec.ts:
- skip se !NEXT_PUBLIC_SUPABASE_URL (mensagem clara)
- credenciais inválidas → texto contendo "incorretos" (mensagem real: "Email ou senha incorretos")
- Rota "protegida": NÃO assumir redirect para /login sem middleware; alinhar ao comportamento real ou implementar proteção.

gerente.spec.ts:
- Requer PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD; usar usuário GERENTE ou DONO (senão redirect vai para /caixa).
- Após login: waitForURL(/\\/(caixa|gerente)/) — não exigir /dashboard.
- Idioma: botão "普通话" existe no LanguageToggle; URL não muda — assert em texto chinês no layout, não em /zh/...

package.json scripts: test:e2e, test:e2e:ui, test:e2e:report
docs: criar fastproduct/docs/E2E.md OU pdv-importados/docs/E2E.md (uma pasta só; linkar no README raiz)

════════════════════════════════════════════════════════
ETAPA 3 — DEPLOY_VERCEL.md
════════════════════════════════════════════════════════

Criar documentação em português (mesma pasta de docs escolhida acima ou pdv-importados/docs):
- Root Directory pdv-importados no monorepo
- NEXT_PUBLIC_* públicas; service role só servidor; SYNC_KEY só Supabase secrets da Edge
- Pós-deploy: verificar /login; não afirmar /gerente/dashboard se a rota não existir no app

════════════════════════════════════════════════════════
ETAPA 4 — sync-outbox + estoque + caixa (incremental)
════════════════════════════════════════════════════════

4.1) Ler backend/supabase/functions/sync-outbox/index.ts INTEIRO.
Manter: Deno.serve, X-SYNC-KEY, parse body.events, resposta { ok, processed, failed }, lógica atual de VENDA_REGISTRADA (ensureCaixaPdv, vendas, descontos_venda, itens best-effort).

Estender:
- Para cada ev, se tipo !== VENDA_REGISTRADA, implementar CAIXA_ABERTO, CAIXA_FECHADO, MOVIMENTO_CAIXA lendo JSON.parse(ev.payload_json) com formato acordado com pdv-local.
- Hoje os tipos não-VENDA são ignorados (marcados processed) — substituir por processamento real quando payload estiver definido.
- Qualquer RPC de estoque deve usar itens com produto_id UUID alinhado ao payload atual (venda usa preco_original, preco_unitario, item_id opcional).

4.2) Nova migration 007_* (número confirmado na pasta):
- RPC decrementar_estoque_idempotente + tabela controle se ainda não existir
- Conferir colunas de public.estoque (produto_id, quantidade_atual, updated_at)
- Políticas RLS: revisar (service role bypass; evitar políticas ambíguas)

4.3) pdv-local — pdv-local/src-tauri/src/db.rs
- Outbox: colunas id, created_at, tipo, payload_json, status, tentativas, last_error
- Alinhar payloads novos aos handlers da Edge; hoje VENDA_REGISTRADA usa objeto plano com venda_id, itens[], etc. (ver código Rust existente) — não trocar para { venda, itens } aninhados sem atualizar a Edge no mesmo PR.
- Inserir na outbox ao abrir/fechar caixa e movimentos quando implementar (hoje pode não existir — implementar inserts + testes).

4.4) Documentação sync: atualizar pdv-importados/core/sync/TAURI_SYNC.md ou pdv-local/README.md com matriz evento → tabela e header X-SYNC-KEY.
   Retries: documentar comportamento real (outbox_marcar_erro incrementa tentativas; verificar se há limite máximo no código antes de afirmar "3 tentativas").

════════════════════════════════════════════════════════
ETAPA 5 — Qualidade
════════════════════════════════════════════════════════

cd pdv-importados
npm run build
npx tsc --noEmit
npm test
npm run test:e2e   # aceitar skips sem env

cd pdv-local/src-tauri
cargo check

════════════════════════════════════════════════════════
ETAPA 6 — Entrega (formato obrigatório)
════════════════════════════════════════════════════════

## Arquivos alterados / criados
(agrupar pdv-importados/, pdv-local/, fastproduct/)

## Decisões tomadas
- i18n, rota login, migration número, contrato Edge (events + payload_json), etc.

## Ações manuais necessárias
- SQL no Supabase (migration 007)
- supabase secrets set SYNC_KEY=...
- Vercel envs
- Usuário Playwright (perfil GERENTE/DONO se testar /gerente/*)
```

PROMPT>>>

---

## Referência rápida — payload **VENDA_REGISTRADA** (hoje)

O PDV local envia em `payload_json` (string JSON) aproximadamente:

```json
{
  "venda_id": "<uuid>",
  "caixa_id": "<uuid|null>",
  "operador_id": "<uuid|null>",
  "troco_inicial_caixa": 0,
  "forma_pagamento": "PIX",
  "total_bruto": 0,
  "total_desconto": 0,
  "total_liquido": 0,
  "desconto_gerente_percentual": null,
  "desconto_gerente_valor": null,
  "gerente_id": null,
  "itens": [
    {
      "item_id": "<uuid>",
      "produto_id": "<uuid>",
      "nome": "...",
      "quantidade": 1,
      "preco_original": 10,
      "preco_unitario": 10
    }
  ]
}
```

Novos tipos de evento (**CAIXA_***, **MOVIMENTO_***) devem ser especificados e implementados **em conjunto** (Rust + Edge + migrations), sem quebrar o cliente que já envia o formato acima.

---

Versões anteriores: [`CURSOR_PROMPT_SESSAO_AUTONOMA_V2.md`](./CURSOR_PROMPT_SESSAO_AUTONOMA_V2.md), [`CURSOR_PROMPT_SESSAO_COMPLETA.md`](./CURSOR_PROMPT_SESSAO_COMPLETA.md).
