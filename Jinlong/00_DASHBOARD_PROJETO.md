# 00 — Dashboard do Projeto

> **Central de comando Obsidian** · [[Home]]
> Última atualização: **2026-07-10**

---

## Visão Geral — FastProduct / Jīn Lóng

**FastProduct** é um monorepo ERP/PDV TypeScript para lojas de importados no Brasil (comunidade chinesa).

| Item | Valor |
|---|---|
| **Produto** | ERP/PDV bilíngue PT/ZH |
| **Mercado alvo** | ~60.000 lojas de importados no Brasil |
| **Stack** | Next.js 15, React 19, Supabase (PG 17), Tauri 2, `shared-core` |
| **Diferencial** | Atacado automático, offline (desktop), fiscal não como barreira no D0 |

> *"Os ERPs do Brasil foram construídos com compliance fiscal como centro. Para esse cliente, isso é um obstáculo."*

---

## Status Atual (2026-07-10)

| Dimensão | Status |
|---|---|
| **Fase** | Pré-piloto — Feature Freeze ativo ([[07_DECISOES_ARQUITETURAIS#DEC-010]]) |
| **Evolução MVP** | ~83% do MVP comercial |
| **Veredito** | 🟡 Pronto para piloto controlado (web) — go-live depende de checklist no ambiente alvo |
| **Branch Git** | `feat/admin-screen-consolidation` |
| **HEAD** | `f2fca536` — `fix(admin): resolve VendasTable merge, typecheck diagnóstico e docs Jinlong` |

### Módulos (snapshot)

| Módulo | Estado | Observação |
|---|---|---|
| **PDV web** | 🟢 | Fluxo normal auditado; diagnóstico pré-produção entregue |
| **Cadastro produto** | 🟢 | SSoT em `/admin/catalogo` |
| **Estoque** | 🟢 | SSoT em `/admin/estoque`; devolução pós-venda P1 |
| **Financeiro** | 🟡 | Unificado em `/admin/financeiro` (receber + pagar + fiscal) |
| **Admin v2** | 🟢 | Consolidação SSoT (`88f2e64a`) + `/admin/diagnostico-caixa` |
| **PDV desktop** | 🟢 | Tauri 2 + SQLite + outbox — **fora do D0 do piloto** |
| **Fiscal NFC-e real** | 🟡 | Mock/stub; Focus pendente |
| **Venda em espera** | 🟡 | RPCs migration `255`; hardening pendente ([[04_PDV]]) |

---

## Próximo Objetivo

**Pilotar o 1º cliente pagante com segurança** — sem features novas.

1. Executar P0 Checklist T1–T12 em staging
2. Aplicar/validar migrations `255` + `256` no ambiente alvo
3. Smoke de venda real (operador → `/caixa` → admin vendas)
4. Homologação com evidências registradas

Ver detalhes: [[09_OPERACAO_PRIMEIRO_CLIENTE]] · [[06_ROADMAP#P0]]

---

## Bloqueadores Atuais

| Bloqueador | Impacto | Status |
|---|---|---|
| P0 Checklist T1–T12 incompleto | Não apto para produção real | 🔴 Pendente |
| Validação Supabase no ambiente alvo | Migrations + GRANTs + RPC `256` | 🔴 Pendente |
| Smoke de venda no ambiente alvo | Confirmação operacional | 🔴 Pendente |
| **Conflito migration 255** (dois arquivos no repo) | Ambiente novo pode aplicar apenas um | 🔴 **Decisão humana** |
| NFC-e Focus não configurado | Piloto sem NF-e real (aceitável no D0) | 🟡 Congelado |
| ADR-PDV-001 sem sign-off | Governança informal do pipeline bip | 🟡 Pendente |

---

## Links Rápidos (Obsidian)

### Painel principal
- [[01_HISTORICO_PROJETO]] — Linha do tempo e marcos
- [[02_ESTADO_ATUAL]] — O que funciona / incompleto / congelado
- [[03_ARQUITETURA]] — Módulos, RPCs, fluxos
- [[06_ROADMAP]] — Prioridades P0–P3
- [[99_LOG_ATUALIZACOES]] — Diário de mudanças

### Domínios
- [[04_PDV]] — Fluxo de venda completo
- [[05_CADASTRO_PRODUTO]] — Catálogo e regras SSoT
- [[07_DECISOES_ARQUITETURAIS]] — ADRs e decisões
- [[08_PROBLEMAS_E_SOLUCOES]] — Bugs e resoluções
- [[09_OPERACAO_PRIMEIRO_CLIENTE]] — Checklist go-live

### Documentação no repositório (`docs/`)
- `docs/FEATURE_FREEZE_PILOTO.md`
- `docs/P0_CHECKLIST_OPERACIONAL.md`
- `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`
- `docs/GOVERNANCA_PMO_JINLONG.md`
- `docs/adr/ADR-PDV-centro-de-gravidade.md`

### Arquivos legados (histórico preservado)
- [[Dashboard]] · [[Changelog]] · [[Backlog]] · [[Próxima Sprint]]
- [[Decisoes]] · [[Bugs]] · [[Auditoria]] · [[Dívida Técnica]]

---

## Estrutura do Monorepo

```
fastproduct/
├── pdv-importados/   → Next.js 15 (web, App Router)
├── pdv-local/        → Tauri 2 + Vite (desktop, SQLite)
├── backend/          → Supabase (187 migrations + 3 Edge Functions)
├── shared-core/      → TypeScript puro (domínio compartilhado)
└── docs/             → Checklists, runbooks, ADRs
```

---

## Branches Relevantes

| Branch | Propósito |
|---|---|
| `main` | Produção / deploy Vercel |
| `feat/admin-screen-consolidation` | **Atual** — consolidação admin + diagnóstico pré-produção |
