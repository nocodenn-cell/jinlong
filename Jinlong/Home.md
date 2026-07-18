# 🏠 Jīn Lóng — Centro de Comando (Obsidian)

> **Memória permanente do projeto FastProduct/Jinlong**
> Última atualização: **2026-07-13** · Branches ativas: `feat/admin-screen-consolidation` (HEAD `fdaf5339`) · `claude/jinlong-go-live-audit-n37ble` (HEAD `17c68e55`)

---

## Painel Principal

| # | Documento | Conteúdo |
|---|---|---|
| 00 | [[00_DASHBOARD_PROJETO]] | Visão geral, status, bloqueadores, links |
| 01 | [[01_HISTORICO_PROJETO]] | Linha do tempo, marcos, commits |
| 02 | [[02_ESTADO_ATUAL]] | Funcionando / incompleto / congelado / riscos |
| 03 | [[03_ARQUITETURA]] | Módulos, RPCs, regras de domínio |
| 04 | [[04_PDV]] | Fluxo de venda completo |
| 05 | [[05_CADASTRO_PRODUTO]] | Catálogo, importação, SSoT |
| 06 | [[06_ROADMAP]] | Concluído / em andamento / próximo / futuro |
| 07 | [[07_DECISOES_ARQUITETURAIS]] | ADRs e decisões com consequências |
| 08 | [[08_PROBLEMAS_E_SOLUCOES]] | Bugs, causas, soluções, commits |
| 09 | [[09_OPERACAO_PRIMEIRO_CLIENTE]] | Checklist go-live, treinamento, riscos |
| 99 | [[99_LOG_ATUALIZACOES]] | Diário de mudanças |

---

## Status Rápido

**Fase:** Pré-piloto (Feature Freeze ativo)
**Veredito:** 🟡 Pronto para piloto controlado (web) — go-live depende de checklist no ambiente alvo

| Módulo | Status |
|---|---|
| PDV web | 🟢 Completo + diagnóstico pré-produção |
| Cadastro produto | 🟢 SSoT `/admin/catalogo` |
| Estoque | 🟢 SSoT `/admin/estoque` |
| Financeiro | 🟡 Unificado `/admin/financeiro` |
| Fiscal NFC-e | 🟡 Mock/stub |
| Desktop Tauri | 🟢 Completo — fora do D0 |

**Próximo objetivo:** Pilotar 1º cliente — ver [[09_OPERACAO_PRIMEIRO_CLIENTE]]

**Bloqueador crítico:** ✅ Resolvido hoje (2026-07-13) — Conflito migration `255` renumerado para `247c` durante o merge de `main`. Ver [[08_PROBLEMAS_E_SOLUCOES#BUG-P0-004]] e seção "Trabalho de Hoje" abaixo.

**Novo bloqueador (resolvido hoje):** Build do Vercel falhava em cascata (lockfile corrompido, import fantasma do Sentry, type-check incluindo artefatos de teste, `@types/bwip-js` mal classificado) — causa raiz sistêmica identificada e corrigida em 5 commits. Deploy preview **READY**. Ver seção "Trabalho de Hoje" abaixo.

---

## 📅 Trabalho de Hoje — 2026-07-13

> Duas frentes paralelas nesta sessão: (A) destravar o deploy no Vercel (branch `claude/jinlong-go-live-audit-n37ble`) e (B) resolver o merge de `main` pendente na consolidação admin (branch `feat/admin-screen-consolidation`). Ambas resultaram em PRs/commits prontos para revisão.

### A) Auditoria go-live + correção sistêmica do build Vercel

**Contexto:** builds sucessivos no Vercel falhavam com `Cannot find module` (um erro por deploy). Identificado como **causa sistêmica única**: o `npm install` do Vercel roda com `NODE_ENV=production` (`--omit=dev`), e o repositório violava essa invariante de 4 formas diferentes.

| # | Causa raiz | Sintoma | Correção | Commit |
|---|---|---|---|---|
| 1 | `package-lock.json` corrompido (~80% das 1374 entradas sem `resolved`/`integrity`) | `npm install` não resolvia pacotes | Lockfile regenerado do zero (1550 entradas válidas) | `c600a39` |
| 2 | Import fantasma `@sentry/browser` (não declarado em `package.json`) | `Cannot find module '@sentry/browser'` | Troca para `Sentry.replayIntegration()` via namespace `@sentry/nextjs` | `a7f31fd` |
| 3 | Artefatos de dev (`*.test.ts`, `*.spec.ts`, Storybook, e2e) incluídos no type-check de produção | `Cannot find module '@playwright/test'`, `'@storybook/react'` | `tsconfig.json` passa a excluir toda a classe de artefatos dev | `81e4834` |
| 4 | `@types/bwip-js` em `devDependencies`, mas exigido pelo type-check de `lib/etiqueta/gerarBarcode.ts` (código de produção) | `Cannot find module 'bwip-js'` | Move `@types/bwip-js` para `dependencies` | `09de6f9` |
| 5 | `tsconfig.typecheck.json` sem excluir `*.spec.ts`/`*.test-helpers.tsx` | Falha em `npm run typecheck` | Excludes adicionados | `a1cb468` |

- Teste E2E operacional de ponta a ponta adicionado (`e2e/fluxo-operacional-completo.spec.ts`, commit `17c68e5`) cobrindo o fluxo completo: fornecedor → produto → estoque → abrir caixa → venda → desconto → múltiplos pagamentos → baixa de estoque → financeiro → fechar caixa → auditoria.
- **Validação:** `npm ci --omit=dev && next build` → exit 0, 14/14 páginas geradas, zero "Cannot find module". `typecheck` limpo. Vitest: 403/408 (5 falhas pré-existentes, sem relação).
- **PR:** ✅ [#169](https://github.com/nocodenn-cell/fastproduct/pull/169) **mergeada em `main`** (commit `38d8b50`) — o fix sistêmico do build já está na branch principal.
- **Deploy Vercel:** 🟢 **READY** — `pdv-importados-git-claude-jinlong-go-live-audit-n37ble-jinlong.vercel.app`.
- CI do GitHub Actions segue com falhas pré-existentes (gitleaks, RLS gates, edge-functions-typecheck, migration-drift, Tauri, outbox-contract) — infraestrutura fora de escopo, requer secrets/serviços não disponíveis no CI de branch.
- ⚠️ **Pendência aberta:** `feat/admin-screen-consolidation` já incorpora `main` até o commit `4f39afe` (via merge `888e725`), mas `main` avançou ~18 commits desde então — incluindo a própria PR #169. A branch de consolidação **ainda não tem** os fixes de build do Vercel (lockfile, Sentry, tsconfig excludes, `@types/bwip-js`). Recomenda-se novo merge de `main` antes de abrir PR de `feat/admin-screen-consolidation`.

### B) Merge `main` → `feat/admin-screen-consolidation` (10 conflitos resolvidos)

**Contexto:** branch de consolidação das telas admin estava desatualizada em relação a `main`, que recebera um fix P0 (`#157`) restaurando telas que a consolidação havia quebrado silenciosamente (redirect para Catálogo). Merge gerou 10 arquivos em conflito — resolvidos individualmente, sem `checkout --ours/--theirs` indiscriminado, com investigação de causa raiz por trás de cada lado.

**Decisões de resolução:**

| Arquivo | Lado vencedor | Motivo |
|---|---|---|
| `shared-core/navigation/routes.ts` | `main` | Fix P0 `#157` restaurou `/admin/compras`, `/admin/financeiro/contas-pagar` (antes redirecionavam silenciosamente para Catálogo) |
| `app/admin/financeiro/_components/FinanceiroPanels.tsx` | `HEAD` (deleção) | Componente morto — coberto por teste de regressão `consolidacao-post-audit.test.ts` |
| `app/admin/financeiro/page.tsx` | `HEAD` (kpiSection) + limpeza de labels órfãs | `FinanceiroContent`/tabs é a arquitetura atual; reprocessamento fiscal já coberto por `DocumentoFiscalDetailSheet` |
| `app/admin/clientes/page.tsx`, `app/admin/fornecedores/page.tsx` | `HEAD` | Wrapper `PageHeader`/`admin-v2-page`, padrão usado em 11 outras páginas admin |
| `lib/navigation/adminV2SidebarNav.ts` | `HEAD` + fix extra | Import `ClipboardList`; removida entrada duplicada "Fornecedores" com `dictKey` inexistente no i18n (regressão de idioma silenciosa) |
| `app/gerente/financeiro/actions.ts` | `main` | `revalidatePath` do documento fiscal — página `/admin/financeiro/documento/[id]` existe e depende disso |
| `app/caixa/CaixaPdvOperadorTabs.tsx` | `HEAD` | Fluxo linear sem abas — único caller (`CaixaPageClient.tsx`) já usa esse shape; versão com abas de `main` referenciava props indefinidas |
| `app/admin/vendas/_components/VendasTable.tsx`, `app/admin/vendas/page.tsx` | `main` | Fix P0 substituindo placeholder hardcoded "Vendedor (—)" por nome real via `operador_id` + i18n do botão cancelar |

**Efeito colateral (bônus):** o merge também trouxe a renumeração de `main` para `255_vendas_em_espera_e_consulta_rapida.sql` → `247c_...sql`, **resolvendo o BUG-P0-004** (conflito de numeração de migration) que estava em aberto desde 2026-07-10.

**Fallout do merge corrigido para manter o build verde** (não eram conflitos marcados, mas quebras diretas da resolução):
- Duplicatas órfãs (`clientes`/`fornecedores`) em `ROUTES.admin`, geradas pelo auto-merge de hunks não sobrepostos.
- `VendaDetailSheet.tsx`: `operador_id: null` adicionado ao `toVendaListRow` local (mesmo padrão já usado para `caixa_id`).
- `tsconfig.json`/`tsconfig.typecheck.json`: exclusão de artefatos de teste do type-check de produção (mesma causa raiz da frente A, pré-existente nesta branch).
- `sentry.client.config.js`: mesmo fix de import fantasma `@sentry/browser` da frente A.

**Validação:**
- `git diff --name-only --diff-filter=U` → vazio
- `npm run typecheck` → exit 0
- `npm run build` → exit 0 (34 rotas geradas)
- `npx playwright test --project=chromium` → 10 passed, 5 failed (testes de integração chamando `supabase.rpc` direto, exigem `SUPABASE_SERVICE_ROLE_KEY`/`.env.local` ausente neste ambiente), 33 skipped (mesma causa). **Nenhuma falha relacionada ao merge** — todos os testes de UI pura (hydration, login, proteção de rota) passaram.

**Commits:** `888e725` (merge, 2 pais) + `fdaf533` (lock de sessão) — pushados para `origin/feat/admin-screen-consolidation`.

---

## Navegação por Domínio

```
[[00_DASHBOARD_PROJETO]]
  ├── Gestão
  │   ├── [[06_ROADMAP]]
  │   ├── [[09_OPERACAO_PRIMEIRO_CLIENTE]]
  │   └── [[99_LOG_ATUALIZACOES]]
  ├── Técnico
  │   ├── [[03_ARQUITETURA]]
  │   ├── [[04_PDV]]
  │   └── [[05_CADASTRO_PRODUTO]]
  ├── Governança
  │   ├── [[07_DECISOES_ARQUITETURAIS]]
  │   └── [[08_PROBLEMAS_E_SOLUCOES]]
  └── Estado
      ├── [[01_HISTORICO_PROJETO]]
      └── [[02_ESTADO_ATUAL]]
```

---

## Arquivos Legados (histórico preservado)

> Documentos anteriores à reestruturação Obsidian (2026-07-10).
> Conteúdo canônico está nos arquivos numerados acima.

| Legado | Substituto canônico |
|---|---|
| [[Dashboard]] | [[00_DASHBOARD_PROJETO]] |
| [[Changelog]] | [[01_HISTORICO_PROJETO]] + [[99_LOG_ATUALIZACOES]] |
| [[Roadmap]] | [[06_ROADMAP]] |
| [[Arquitetura]] | [[03_ARQUITETURA]] |
| [[PDV]] | [[04_PDV]] |
| [[Cadastro Produto]] | [[05_CADASTRO_PRODUTO]] |
| [[Decisoes]] | [[07_DECISOES_ARQUITETURAIS]] |
| [[Bugs]] | [[08_PROBLEMAS_E_SOLUCOES]] |
| [[Backlog]] | [[06_ROADMAP]] |
| [[Próxima Sprint]] | [[09_OPERACAO_PRIMEIRO_CLIENTE]] |
| [[Auditoria]] | [[03_ARQUITETURA]] + [[08_PROBLEMAS_E_SOLUCOES]] |
| [[Dívida Técnica]] | [[08_PROBLEMAS_E_SOLUCOES]] |
| [[Design System]] | [[03_ARQUITETURA]] (seção frontend) |
| [[Estatísticas]] | [[02_ESTADO_ATUAL]] |

---

## Contexto do Cliente

**Cliente:** Dono de loja de importados (comunidade chinesa no Brasil)
**Mercado alvo:** ~60.000 lojas de importados no Brasil
**Diferencial:** Bilíngue PT/ZH, atacado automático, offline (desktop), fiscal não como barreira no D0

---

## Monorepo

```
fastproduct/
├── pdv-importados/   → Next.js 15 (web)
├── pdv-local/        → Tauri 2 (desktop)
├── backend/          → Supabase (187 migrations)
├── shared-core/      → Domínio TypeScript puro
└── docs/             → Checklists e runbooks
```

---

## Documentação Externa (`docs/`)

- `docs/FEATURE_FREEZE_PILOTO.md`
- `docs/P0_CHECKLIST_OPERACIONAL.md`
- `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`
- `docs/GOVERNANCA_PMO_JINLONG.md`
- `docs/adr/ADR-PDV-centro-de-gravidade.md`
