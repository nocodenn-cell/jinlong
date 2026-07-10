# 🏠 Jīn Lóng — Centro de Comando

> **Sistema ERP/PDV** para lojas de importados no Brasil (comunidade chinesa).
> Monorepo TypeScript com Next.js 15, Supabase, Tauri 2 e shared-core puro.

---

## Estado Atual

**Fase:** Pré-piloto (Feature Freeze ativo — 1º cliente pagante)
**Evolução estimada:** `████████░░` **83%** do MVP comercial
**Veredito operacional:** 🟡 **Pronto para piloto controlado** — fluxo normal de venda validado em código; go-live depende de checklist no ambiente alvo.

| Dimensão | Status |
|---|---|
| Core PDV web | 🟢 Completo — fluxo normal auditado (venda, cancelamento, caixa) |
| Diagnóstico pré-produção PDV | 🟢 Entregue — UI `/admin/diagnostico-caixa` + RPC `256` + CLI |
| Autenticação + RLS | 🟢 Completo |
| Cadastro de Produtos | 🟢 Completo — SSoT em `/admin/catalogo` |
| Motor de Preço Atacado | 🟢 Completo |
| Estoque (básico + kardex) | 🟢 Completo — SSoT em `/admin/estoque` |
| Financeiro | 🟡 Parcial — receber/pagar/fiscal unificado em `/admin/financeiro`; contas a pagar gerente em andamento |
| Painel Gerente | 🟢 Completo |
| Painel Admin v2 | 🟢 Consolidação SSoT (`88f2e64a`) + rota diagnóstico-caixa |
| PDV Desktop (Tauri) | 🟢 Completo |
| Sync Outbox + Anti-replay | 🟢 Completo |
| Fiscal (NFC-e real) | 🟡 Mock/stub, Focus pendente |
| Venda em Espera | 🟡 Parcial — RPCs migration `255`; E2E e hardening pendentes |
| Auto-update Tauri | 🔴 Não iniciado |
| Acessibilidade ARIA Fase 3.2 | 🔴 Pendente |

### Módulos (snapshot 2026-07-10)

| Módulo | Estado | Observação |
|---|---|---|
| **PDV** | 🟢 | Scan → carrinho → split → RPC v4; diagnóstico pré-produção para abertura de piloto |
| **Cadastro de produtos** | 🟢 | Catálogo admin, tiers atacado, estoque inicial só na criação |
| **Estoque** | 🟢 | Kardex, recebimento, transferência, import NF-e; devolução pós-venda P1 |
| **Financeiro** | 🟡 | Admin unificado; contas a pagar (gerente) bloqueador piloto |
| **Admin** | 🟢 | Consolidação de telas + cancelamento vendas via `VendaDetailSheet` / tabela |

### Riscos pendentes (go-live)

| Risco | Status |
|---|---|
| Typecheck `diagnosticoCaixa.impl.ts` | ✅ Resolvido (2026-07-10) — guard `status === 'ambiguo'` |
| Validação real Supabase (migrations + GRANTs) | 🔴 Pendente — executar `verify_p0_producao.sql` e migration `256` no ambiente alvo |
| Smoke test de venda no ambiente alvo | 🔴 Pendente — 1 venda real operador → gerente/admin |

**Checklist de abertura do piloto:** `/admin/diagnostico-caixa` · `npm run check:caixa-pre-producao` · `backend/supabase/scripts/verify_p0_producao.sql`

---

## Últimas Alterações

- **2026-07-10** — `5ce33a6d` feat(pdv): diagnóstico pré-produção do caixa (migration `256`, página admin, CLI)
- **2026-07-10** — Conflito `VendasTable.tsx` resolvido — cancelamento inline + sheet com `toVendaListRow()` (`VendaListRow`)
- **2026-07-10** — Typecheck do diagnóstico corrigido (`diagnosticoCaixa.impl.ts`)
- **2026-07-09** — `88f2e64a` consolidação admin + enforcement SSoT de entidades
- **2026-07-08** — Auditoria de governança PMO (`docs/GOVERNANCA_PMO_JINLONG.md`)
- **2026-07-08** — Feature Freeze ativo para piloto 1º cliente
- **2026-07-08** — RPC canônica v4 (`243_finalizar_venda_canonica_v4_captura.sql`)
- **Recente** — Pipeline scan bip integrado (`useCaixaScanPipeline`)
- **Recente** — Migration 255 (GRANT baseline + vendas em espera)
- **Recente** — Bloqueio overloads legados v2/v3 de `finalizar_venda`

---

## Principais Módulos

```
fastproduct/
├── pdv-importados/   → Next.js 15 (web, App Router, React 19)
├── pdv-local/        → Tauri 2 + Vite (desktop, SQLite offline)
├── backend/          → Supabase (187+ migrations + 3 Edge Functions)
└── shared-core/      → TypeScript puro (domínio compartilhado)
```

---

## Navegação Rápida

### Gestão
- [[Dashboard]] — Estado executivo completo
- [[Roadmap]] — P0 / P1 / P2 / P3
- [[Próxima Sprint]] — Próxima sprint sugerida
- [[Backlog]] — Em andamento / A fazer / Concluído
- [[Changelog]] — Linha do tempo de mudanças

### Técnico
- [[Arquitetura]] — Frontend / Backend / Banco / Fluxos
- [[PDV]] — Fluxo completo do PDV
- [[Cadastro Produto]] — Checklist de campos e funcionalidades
- [[Design System]] — Tokens, componentes, inconsistências

### Qualidade
- [[Bugs]] — P0 / P1 / P2
- [[Dívida Técnica]] — TODOs, código legado, orphans
- [[Auditoria]] — Violações arquiteturais, acoplamentos
- [[Estatísticas]] — Números do projeto

### Decisões
- [[Decisoes]] — ADRs e decisões arquiteturais

---

## Contexto do Cliente

**Cliente:** Dono de loja de importados (comunidade chinesa no Brasil)
**Mercado alvo:** ~60.000 lojas de importados no Brasil
**Diferencial:** bilíngue PT/ZH, atacado automático, funciona offline, sem burocracia fiscal como barreira

> *"Os ERPs do Brasil foram construídos com compliance fiscal como centro. Para esse cliente, isso é um obstáculo."*

---

## Branches Ativas

| Branch | Propósito |
|---|---|
| `main` | Produção / deploy Vercel |
| `feat/admin-screen-consolidation` | Branch atual — consolidação admin + diagnóstico pré-produção (`5ce33a6d` ahead de origin) |
