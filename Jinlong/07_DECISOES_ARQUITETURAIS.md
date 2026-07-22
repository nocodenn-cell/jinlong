# 07 — Decisões Arquiteturais

> Registro permanente de decisões, alternativas rejeitadas e consequências.
> Fonte: código, migrations, ADRs e documentação existente.
> [[03_ARQUITETURA]] · [[01_HISTORICO_PROJETO]]

---

## DEC-001: Monorepo npm Workspaces + Turborepo

| Campo | Valor |
|---|---|
| **Data** | 2026-01 |
| **Decisão** | 4 workspaces: `pdv-importados`, `pdv-local`, `backend`, `shared-core` |
| **Motivo** | Compartilhar domínio sem duplicação; cache remoto Turborepo |
| **Alternativas rejeitadas** | Repos separados; polyrepo com pacote npm publicado |
| **Consequências** | ✅ `PricingService`, `CartEngine` compartilhados · ⚠️ Complexidade paths/aliases |

---

## DEC-002: Supabase como Backend Único

| Campo | Valor |
|---|---|
| **Data** | 2026-01 |
| **Decisão** | PostgreSQL + Auth + RLS + PostgREST + Edge Functions |
| **Motivo** | Banco + auth + API prontos; reduz surface operacional |
| **Alternativas rejeitadas** | NestJS custom; Firebase; PlanetScale + Auth0 |
| **Consequências** | ✅ RLS por design · ⚠️ Edge Functions em Deno · ⚠️ Vendor lock-in moderado |

---

## DEC-003: Next.js 15 App Router + Server Components

| Campo | Valor |
|---|---|
| **Data** | 2026-01 |
| **Decisão** | App Router com Server Components; Server Actions para mutações |
| **Motivo** | Menos código cliente; dados no servidor; sem endpoints manuais |
| **Alternativas rejeitadas** | Pages Router; SPA + API separada |
| **Consequências** | ✅ Carregamento rápido · ⚠️ Curva App Router · ⚠️ Atenção hidratação |

---

## DEC-004: PDV Desktop Tauri 2 + SQLite

| Campo | Valor |
|---|---|
| **Data** | 2026-01 |
| **Decisão** | Tauri 2 (Rust + WebView) + SQLite local |
| **Motivo** | Venda offline; PWA/IndexedDB descartado por limitações |
| **Alternativas rejeitadas** | Electron; PWA; Service Worker offline |
| **Consequências** | ✅ Offline completo · ✅ Bundle ~5MB · ⚠️ Build pipeline separado · ⚠️ Auto-update pendente |

---

## DEC-005: Sync Outbox HMAC SHA256 + Nonce

| Campo | Valor |
|---|---|
| **Data** | 2026-02 |
| **Decisão** | Edge Function com HMAC (não JWT) + nonce anti-replay |
| **Motivo** | Desktop offline sem sessão ativa; nonce previne replay |
| **Alternativas rejeitadas** | JWT longa duração; sem autenticação |
| **Consequências** | ✅ Seguro offline · ✅ Idempotência · ⚠️ `SYNC_KEY` crítico · ⚠️ Drift relógio > 5min |

**Evidência:** `migrations/024_sync_outbox_hmac_nonce_replay.sql`

---

## DEC-006: RPC Canônica v4 como Padrão

| Campo | Valor |
|---|---|
| **Data** | 2026-06/07 |
| **Decisão** | Toda finalização usa `finalizar_venda_transacional_canonica_v4`; v2/v3 bloqueadas |
| **Motivo** | Ledger, idempotência, guard de preço; legadas eram vetores de inconsistência |
| **Alternativas rejeitadas** | Múltiplas versões ativas; remover overloads completamente |
| **Consequências** | ✅ Ponto único de auditoria · ⚠️ Desktop antigo ainda usa `registrar_venda_com_itens` |

**Evidência:** `migrations/243`, `20260619…block_v2`, `20260620…block_v3`

---

## DEC-007: i18n Manual PT/ZH sem next-intl

| Campo | Valor |
|---|---|
| **Data** | 2026-01 |
| **Decisão** | JSON (`pt.json`, `zh.json`) + `getMessages()`; URLs sem prefixo locale |
| **Motivo** | next-intl forçaria `/pt/login`; bilíngue só no gerente (caixa sempre PT) |
| **Alternativas rejeitadas** | next-intl; react-i18next; URLs com prefixo |
| **Consequências** | ✅ URLs limpas · ⚠️ Normalização manual `zh-HK` → `zh` |

---

## DEC-008: shadcn/ui como Base de Componentes

| Campo | Valor |
|---|---|
| **Data** | 2026-01 |
| **Decisão** | Componentes owned pelo projeto (não lib runtime) |
| **Motivo** | Controle total; sem breaking changes de lib externa |
| **Alternativas rejeitadas** | MUI; Chakra; Mantine |
| **Consequências** | ✅ Customização total · ⚠️ Adição manual via CLI |

---

## DEC-009: Preço Autoritativo no Servidor

| Campo | Valor |
|---|---|
| **Data** | 2026-03 |
| **Decisão** | Preço recalculado pelo banco no commit; cliente não dita preço final |
| **Motivo** | Anti-fraude (manipulação de tráfego/preços) |
| **Alternativas rejeitadas** | Confiar no preço do cliente; hash de preço |
| **Consequências** | ✅ Venda correta mesmo com manipulação · ⚠️ Latência RPC extra |

**Evidência:** `migrations/123`, `234`, `250`, `254`

---

## DEC-010: Feature Freeze Piloto 1º Cliente

| Campo | Valor |
|---|---|
| **Data** | 2026-07-08 |
| **Decisão** | Freeze até Fase 4 estável; só correções de integridade e bloqueadores |
| **Motivo** | Evitar scope creep; MVP funcional |
| **Alternativas rejeitadas** | Desenvolver em paralelo; mini-sprints |
| **Consequências** | ✅ Foco estabilidade · ⚠️ Features acumuladas pós-piloto |

**Evidência:** `docs/FEATURE_FREEZE_PILOTO.md`

---

## DEC-011: SSoT de Entidades no Admin

| Campo | Valor |
|---|---|
| **Data** | 2026-07-09 |
| **Decisão** | Cadastros oficiais apenas em `/admin/*` (catálogo, clientes, fornecedores, estoque) |
| **Motivo** | Eliminar CRUD duplicado; governança de dados |
| **Alternativas rejeitadas** | Manter CRUD inline em PDV/financeiro |
| **Consequências** | ✅ Fonte única · ⚠️ Exceções legadas documentadas (FornecedorCombobox, estoque inicial) |

**Evidência:** commit `88f2e64a`, `.cursor/rules/entity-ssot.mdc`

---

## DEC-012: shared-core como Fonte Única de Domínio

| Campo | Valor |
|---|---|
| **Data** | 2026-02 (reforçado 2026-06) |
| **Decisão** | Lógica pura em `shared-core`; importada por web e desktop |
| **Motivo** | Bug real de divergência `variantesChaveLeitura` entre plataformas |
| **Alternativas rejeitadas** | Copiar lógica; pacote npm interno |
| **Consequências** | ✅ Paridade garantida · ⚠️ Mudanças afetam ambas plataformas |

---

## DEC-013: Piloto Web Only (sem Desktop no D0)

| Campo | Valor |
|---|---|
| **Data** | 2026-07-08 |
| **Decisão** | 1º cliente usa apenas `pdv-importados`; Tauri fora do D0 |
| **Motivo** | Reduzir complexidade onboarding; zero instalação |
| **Alternativas rejeitadas** | Incluir desktop; decidir por cliente |
| **Consequências** | ✅ Onboarding simples · ⚠️ Sem internet = sem venda no D0 |

**Evidência:** `docs/FEATURE_FREEZE_PILOTO.md` § Canal

---

## ADR Externo — ADR-PDV-001

| Campo | Valor |
|---|---|
| **Arquivo** | `docs/adr/ADR-PDV-centro-de-gravidade.md` |
| **Status** | **Proposto** — aguardando sign-off produto + eng lead |
| **Data** | 2026-05-12 |
| **Tema** | Centro de gravidade PDV, autoridade no bip, tolerância a falhas |
| **Impacto** | Implementação existe (`useCaixaScanPipeline`); ADR desatualizado |

**Ação pendente:** Atualizar status para "Aceito" com justificativa da implementação.

---

> Legado completo: [[Decisoes]] · Problemas derivados: [[08_PROBLEMAS_E_SOLUCOES]]
