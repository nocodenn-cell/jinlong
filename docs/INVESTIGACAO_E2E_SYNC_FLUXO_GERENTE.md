# Investigação — `E2E crítico` / `sync-fluxo-gerente.spec.ts`

**Data:** 2026-08-13 · **Classificação:** 🔴 **BLOCKED EXTERNALLY** (causa raiz)
**Escopo:** pendência **real** do sistema. Pré-existente ≠ fora de escopo.

> Nenhum timeout, seletor ou heading foi alterado. Nada foi "corrigido" especulativamente.

---

## 1. Sintoma

Dois testes falham de forma **determinística** (3 tentativas: inicial + 2 retries):

| Linha | Ação | Erro |
|---|---|---|
| 224 | `gotoApp('/gerente/vendas')` → `getByRole('heading', { name: 'Vendas e caixa' })` | `element(s) not found` (5000 ms) |
| 293 | `gotoApp('/gerente/financeiro')` → `getByRole('heading', { name: /financeiro/i })` | `element(s) not found` (5000 ms) |

Determinismo elimina flakiness e timing como causa primária — por isso [10] não foi investigado.

**Pré-existência (não introduzido por PR #297):** run [31484925799](https://github.com/nocodenn-cell/fastproduct/actions/runs/31484925799)
(`cursor/bugs-cr-ticos-recentes-ae0e`, 2026-08-11) falhou com o **mesmo** job como único vermelho e
`build-and-test` verde. Continua sendo pendência a resolver.

## 2. Hipóteses DESCARTADAS com evidência

Investigadas na ordem determinada; cada uma eliminada por leitura de código, não por suposição.

| # | Hipótese | Evidência que a descarta |
|---|---|---|
| 2 | Seed cria perfil errado | `scripts/seed-dev-users.mjs:184` → `perfil: 'GERENTE'`; `:122` → `ativo: true` |
| 5 | Usuário sem loja (`conta_sem_loja`) | `seed-dev-users.mjs:123` → `loja_id: loja_id ?? LOJA_MATRIZ_ID` |
| 4 | Mapa de redirect errado | `shared-core/navigation/routes.ts:124-125` → `vendas → ROUTES.admin.vendas`, `financeiro → ROUTES.admin.financeiro` |
| 4 | Catch-all não redireciona | `app/gerente/[...path]/page.tsx` → `redirect(legacyGerenteRedirect(slug))` |
| 9 | Heading não é `heading` role | `components/ui/admin-v2/PageHeader.tsx:29` renderiza `<h1>` real |
| 9 | Texto esperado não existe | `src/lib/i18n/pt.json:475` → `"Vendas e caixa"`; `:2267` → `"Financeiro e fiscal"` (casa `/financeiro/i`) |
| — | Seed aponta para outro banco | Workflow usa `PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_URL` tanto no seed quanto no app sob teste |

Ou seja: **role certo, texto certo, redirect certo, seed certo.** A página não chega a renderizar.

## 3. Hipótese remanescente mais forte — [1]/[3]

`middleware.ts:65` intercepta `/gerente/:path*` **e** `/admin/:path*`. Em
`lib/admin/policy/adminPolicy.ts:182-183`:

```ts
if (isPainelWeb(pathname) && !painelAllowed) {
  return redirect('/caixa', 'perfil_nao_gerencial', 'edge')
}
```

Um gerente barrado aqui é levado a **`/caixa`** — onde nenhum dos dois headings existe, produzindo
exatamente `element(s) not found`.

### Por que isso passaria despercebido: o harness mascara

`sync-fluxo-gerente.spec.ts:220,290`:

```js
await loginGerente(page, { postLoginUrl: /\/(caixa|gerente|admin)/ })
```

E `e2e/helpers/login.ts:23-25` só faz `page.waitForURL(postLoginUrl)`. Como o regex **aceita
`/caixa`**, um gerente rejeitado pelo middleware **passa no login** e só falha depois, no heading.

O teste, portanto, **não sabe distinguir** "logado como gerente" de "logado e rebaixado para
caixa" — e reporta o sintoma errado. Isso explica a mensagem confusa, mas **não prova** que o
rebaixamento ocorre: prova apenas que, se ocorresse, o sintoma seria idêntico ao observado.

## 4. Por que a causa raiz não foi fechada

Confirmar exige saber **em que URL a página realmente parou**. Duas fontes, ambas barradas:

| Fonte | Bloqueio |
|---|---|
| `error-context.md` / `trace.zip` do artefato [`e2e-critical-test-results`](https://github.com/nocodenn-cell/fastproduct/actions/runs/31737180730/artifacts/9196023788) | Download de artefato exige credencial do GitHub; indisponível neste ambiente |
| Reprodução local com o mesmo setup do workflow | Exige os secrets `PLAYWRIGHT_NEXT_PUBLIC_SUPABASE_URL`, `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY`, `PLAYWRIGHT_TEST_EMAIL/PASSWORD`; nenhum disponível. Stack Supabase local também exige Docker (sem daemon aqui) |

Sem uma dessas, qualquer alteração seria especulativa — inclusive "endurecer" o `postLoginUrl`,
que só faria sentido depois de confirmado o rebaixamento.

## 5. Próxima ação — como fechar em uma passagem

Com **qualquer** um dos dois:

**(a) Artefato** — baixar `e2e-critical-test-results`, abrir
`sync-fluxo-gerente-*/error-context.md` e ler a URL/snapshot no momento da falha. Se for `/caixa`,
a hipótese §3 está confirmada e a correção mínima é no `canAccessAdmin`/normalização de sessão —
**não** no teste.

**(b) Reprodução local** — com os secrets:

```bash
cd pdv-importados
export NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=... SEED_DEV_PASSWORD=...
node scripts/seed-dev-users.mjs
export PLAYWRIGHT_TEST_EMAIL=... PLAYWRIGHT_TEST_PASSWORD=...
npx playwright test e2e/sync-fluxo-gerente.spec.ts --trace on
npx playwright show-trace test-results/**/trace.zip
```

O trace dá URL, console, network e o snapshot de acessibilidade em cada passo.

### Diagnóstico auxiliar (proposto, **não** aplicado)

Depois de confirmada a causa, vale endurecer o harness para que a próxima falha se explique
sozinha — `postLoginUrl: /\/(gerente|admin)/` para `loginGerente`, fazendo o teste falhar **no
login** com "gerente foi rebaixado para /caixa" em vez de num heading ausente. Não é correção da
causa, é correção de **diagnóstico**, e por isso fica condicionada à confirmação.

## 6. Governança

`E2E` é **sistema de risco, não sistema de decisão** (`ci-pdv-importados.yml:4`). Não foi promovido
a required check, e a governança atual não foi alterada.

## 7. Entrega

| Campo | Estado |
|---|---|
| **CAUSA RAIZ** | ⛔ Não fechada — hipótese §3 com forte suporte, sem confirmação runtime |
| **CORREÇÃO MÍNIMA** | ⛔ Não aplicada — dependeria de causa não confirmada |
| **TESTE** | ⛔ Pendente |
| **EVIDÊNCIA** | ✅ §2 (7 hipóteses descartadas), §3 (mecanismo), §4 (bloqueio) |

**Classificação: `BLOCKED EXTERNALLY`** — artefato e credenciais inacessíveis. **Não** é
"resolvido por ser pré-existente"; segue como pendência aberta do sistema.

## 8. Fechamento — reprodução local (2026-08-14, branch `integration/jinlong-final-reconciliation`)

O bloqueio §4(b) foi removido: esta integração dispõe de stack Supabase local via Docker e dos
secrets necessários (`seed-dev-users.mjs` local). Reprodução executada exatamente como prescrito
em §5(b):

```bash
cd pdv-importados
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=... SEED_DEV_PASSWORD=...
node scripts/seed-dev-users.mjs
export PLAYWRIGHT_TEST_EMAIL=e2e-gerente@localhost.test PLAYWRIGHT_TEST_PASSWORD=...
export SYNC_ENDPOINT=http://127.0.0.1:54321/functions/v1/sync-outbox SYNC_KEY=...
npx playwright test e2e/sync-fluxo-gerente.spec.ts --trace on
```

(A Edge Function `sync-outbox` precisou ser servida localmente via
`supabase functions serve --env-file ...` — não estava no `supabase start` padrão deste ambiente.)

**Resultado: 2/2 PASS** (29.7s + 18.7s). O gerente autenticado chega a `/gerente/vendas`, o heading
`Vendas e caixa` é visível, a venda injetada via `sync-outbox` aparece na tabela, e o detalhe exibe
a timeline fiscal com o evento de erro esperado. A hipótese §3 (rebaixamento silencioso para
`/caixa`) **não se manifestou** nesta branch — o gerente nunca foi desviado do painel gerencial.

Isso não invalida a investigação: as 7 hipóteses descartadas em §2 continuam corretas, e o
mecanismo de risco em §3 (harness que mascara rebaixamento) continua real e vale a pena
endurecer preventivamente. O que muda é o resultado observado: nesta branch integrada, com o
estado atual de `middlewareAdminDecision`/`normalizeAdminSession` (reforçado pelos testes
`a006ff35`/`0dbe3982` já incorporados), o fluxo crítico **não falha**.

| Campo | Estado (atualizado) |
|---|---|
| **CAUSA RAIZ** | N/A — sintoma não reproduzido nesta branch |
| **CORREÇÃO MÍNIMA** | Não aplicada — nenhum defeito comprovado para corrigir |
| **TESTE** | ✅ 2/2 PASS, reprodução local com trace |
| **Classificação** | 🟢 **PASSING** nesta branch — falha de CI anterior permanece não explicada retroativamente, mas não bloqueia este merge |
