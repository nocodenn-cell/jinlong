# 00 — Dashboard do Projeto

> **Central de comando Obsidian** · [[Home]]
> Última atualização: **2026-08-27**

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

## Status Atual (2026-08-27)

| Dimensão | Status |
|---|---|
| **Fase** | Piloto web — **GO** (`e1327e62` = produção) |
| **Veredito** | 🟢 Release consolidada. Feature freeze de **features novas** segue ativo |
| **Branch Git** | `main` |
| **HEAD** | `e1327e62` — `#330` opções do modal + WebKit E2E |
| **Canônico** | `docs/piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md` |

O snapshot de 2026-07-10 (`feat/admin-screen-consolidation` / `f2fca536`) é **histórico**.

### Módulos (snapshot)

| Módulo | Estado | Observação |
|---|---|---|
| **PDV web** | 🟢 | Troco só DINHEIRO; E2E crítico PASS |
| **Cadastro produto** | 🟢 | SSoT `/admin/catalogo`; merge opções; atacado≥varejo no CSV |
| **Estoque** | 🟢 | Kardex SSOT-04; remessa aceita DRAFT |
| **Financeiro** | 🟡 | Hub unificado; reauditoria AR/AP residual |
| **PDV desktop** | 🟢 | Fora do D0 |
| **Fiscal NFC-e real** | 🟡 | Stub; **não** furar a fila da próxima sprint |
| **Venda em espera** | 🟡 | Fora do D0 (D0-04) |

---

## Próximo Objetivo

**Estabilização operacional do piloto** — smoke na máquina da cliente, backup/restore, runbook. Ver `docs/piloto-d0/PROXIMA_SPRINT.md`. **Não** iniciar Fiscal/WhatsApp.

---

## Bloqueadores Atuais

| Bloqueador | Impacto | Status |
|---|---|---|
| Código necessário fora de `main` | — | 🟢 Nenhum |
| Restore nunca ensaiado | RPO/RTO desconhecidos | 🟡 Próxima sprint P0 |
| Smoke na loja | Periféricos/rede | 🟡 Próxima sprint P0 |
| Playwright completo vermelho | Ruído CI | 🟢 Classificado flake; não bloqueia GO |
| NFC-e Focus | Piloto sem NF-e real | 🟡 Aceitável no D0 |

O “conflito migration 255” e o checklist T1–T12 de julho são **históricos** — não reabrir como NO-GO de `e1327e62`.

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
- `docs/piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md` — **baseline GO**
- `docs/piloto-d0/PROXIMA_SPRINT.md`
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
| `main` | Produção / `e1327e62` |
